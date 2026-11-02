import hashlib
import hmac
import logging
import secrets
from collections.abc import Mapping
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_DOWN, ROUND_HALF_UP
from typing import Any, cast

from django.conf import settings
from django.db import DatabaseError, IntegrityError, transaction
from django.db.models import Count, F, OuterRef, Prefetch, Q, Subquery
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import User
from .models import ChatMessage, ExpensePayment, ExpenseShare, Group, Membership, Settlement, SharedExpense
from .serializers import ChatMessageSerializer, GroupSerializer, MembershipSerializer, SettlementSerializer

CENT = Decimal("0.01")
MAX_AMOUNT = Decimal("9999999999.99")
logger = logging.getLogger(__name__)


def groups_for_user(user):
    last_read_at = Membership.objects.filter(
        group_id=OuterRef("pk"),
        user_id=user.pk,
        is_active=True,
    ).values("last_read_at")[:1]
    return (
        Group.objects.filter(memberships__user_id=user.pk, memberships__is_active=True)
        .annotate(membership_last_read_at=Subquery(last_read_at))
        .annotate(
            unread_count=Count(
                "messages",
                filter=(
                    ~Q(messages__sender_id=user.pk)
                    & (
                        Q(messages__created_at__gt=F("membership_last_read_at"))
                        | Q(membership_last_read_at__isnull=True)
                    )
                ),
                distinct=True,
            )
        )
        .prefetch_related(
            Prefetch(
                "memberships",
                queryset=Membership.objects.filter(is_active=True).select_related("user"),
                to_attr="active_memberships",
            )
        )
    )


def group_membership(group, user):
    return get_object_or_404(Membership.objects.select_related("user", "group"), group=group, user=user, is_active=True)


def require_admin(membership):
    if membership.role != "admin":
        raise PermissionDenied("Only group admins can perform this action.")


def money(value):
    amount = Decimal(str(value))
    if not amount.is_finite():
        raise ValueError("Amount must be finite.")
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def public_expense(expense):
    return {
        "id": expense.id,
        "title": expense.title,
        "amount": str(expense.amount),
        "date": expense.date.isoformat(),
        "category": expense.category,
        "split_type": expense.split_type,
        "created_by": expense.created_by_id,
        "created_at": expense.created_at,
        "shares": [
            {"membership_id": row.membership_id, "user_id": row.membership.user_id, "name": row.membership.user.name,
             "amount": str(row.amount), "percentage": str(row.percentage) if row.percentage is not None else None}
            for row in expense.shares.select_related("membership__user").all()
        ],
        "payments": [
            {"membership_id": row.membership_id, "user_id": row.membership.user_id, "name": row.membership.user.name, "amount": str(row.amount)}
            for row in expense.payments.select_related("membership__user").all()
        ],
    }


def validate_expense_payload(group, user, data, existing=None):
    payload = {field: data.get(field, getattr(existing, field, None)) for field in ("title", "amount", "date", "category", "split_type")}
    if not isinstance(payload["title"], str) or not payload["title"].strip() or len(payload["title"]) > 200:
        raise ValidationError({"title": "Enter a title of 1–200 characters."})
    if not payload["date"]:
        raise ValidationError({"date": "Enter an expense date."})
    if isinstance(payload["date"], str):
        payload["date"] = parse_date(payload["date"])
    if not isinstance(payload["date"], date):
        raise ValidationError({"date": "Enter a valid expense date."})
    payload["category"] = payload["category"] or ""
    if not isinstance(payload["category"], str) or len(payload["category"]) > 100:
        raise ValidationError({"category": "Category must be 100 characters or fewer."})
    try:
        amount = money(payload["amount"])
    except Exception as exc:
        raise ValidationError({"amount": "Enter a valid amount."}) from exc
    if amount <= 0 or amount > MAX_AMOUNT:
        raise ValidationError({"amount": "Amount must be greater than zero and at most 9,999,999,999.99."})
    payload["amount"] = amount
    if payload["split_type"] not in ("equal", "custom", "percentage"):
        raise ValidationError({"split_type": "Choose equal, custom, or percentage."})
    members = {member.id: member for member in Membership.objects.filter(group=group, is_active=True).select_related("user")}
    if "shares" in data:
        shares_input = data["shares"]
    elif existing:
        shares_input = [{"membership_id": share.membership_id, "amount": str(share.amount),
                         "percentage": str(share.percentage) if share.percentage is not None else None}
                        for share in existing.shares.all()]
    else:
        shares_input = [{"membership_id": m.id} for m in members.values()]
    if not isinstance(shares_input, list) or not shares_input:
        raise ValidationError({"shares": "Select at least one group member."})
    try:
        selected_ids = [int(item["membership_id"]) for item in shares_input]
    except (TypeError, KeyError, ValueError) as exc:
        raise ValidationError({"shares": "Each share requires a valid membership_id."}) from exc
    if len(set(selected_ids)) != len(selected_ids) or any(member_id not in members for member_id in selected_ids):
        raise ValidationError({"shares": "Shares must use distinct members of this group."})

    computed = []
    if payload["split_type"] == "equal":
        base = (amount / len(selected_ids)).quantize(CENT, rounding=ROUND_DOWN)
        remaining_cents = int((amount - base * len(selected_ids)) / CENT)
        computed = [(members[member_id], base + (CENT if index < remaining_cents else 0), None)
                    for index, member_id in enumerate(selected_ids)]
    elif payload["split_type"] == "custom":
        try:
            values = [money(item["amount"]) for item in shares_input]
        except (KeyError, TypeError, ValueError, InvalidOperation) as exc:
            raise ValidationError({"shares": "Custom shares require valid amounts."}) from exc
        if any(value < 0 for value in values) or sum(values, Decimal("0")) != amount:
            raise ValidationError({"shares": "Custom share amounts must be non-negative and add up to the expense total."})
        computed = [(members[member_id], value, None) for member_id, value in zip(selected_ids, values)]
    else:
        try:
            percentages = [Decimal(str(item["percentage"])) for item in shares_input]
        except (KeyError, TypeError, ValueError, InvalidOperation) as exc:
            raise ValidationError({"shares": "Percentage shares require valid percentages."}) from exc
        if any(not value.is_finite() or value < 0 or value > 100 for value in percentages) or sum(percentages) != Decimal("100"):
            raise ValidationError({"shares": "Percentages must be between 0 and 100 and total exactly 100."})
        assigned = Decimal("0")
        for index, (member_id, percentage) in enumerate(zip(selected_ids, percentages)):
            share = amount - assigned if index == len(selected_ids) - 1 else (amount * percentage / 100).quantize(CENT, rounding=ROUND_HALF_UP)
            assigned += share
            computed.append((members[member_id], share, percentage))

    payments_input = data.get("payments")
    if payments_input is None and existing:
        payments_input = [{"membership_id": payment.membership_id, "amount": str(payment.amount)}
                          for payment in existing.payments.all()]
    if payments_input is None:
        payments_input = [{"membership_id": group_membership(group, user).id, "amount": str(amount)}]
    if not isinstance(payments_input, list) or not payments_input:
        raise ValidationError({"payments": "Enter at least one payer."})
    payments = []
    payer_ids = set()
    try:
        for item in payments_input:
            membership_id = int(item["membership_id"])
            paid = money(item["amount"])
            if membership_id not in members or membership_id in payer_ids or paid <= 0:
                raise ValueError
            payer_ids.add(membership_id)
            payments.append((members[membership_id], paid))
    except (KeyError, TypeError, ValueError, InvalidOperation) as exc:
        raise ValidationError({"payments": "Payers must be distinct group members with positive amounts."}) from exc
    if sum((paid for _, paid in payments), Decimal("0")) != amount:
        raise ValidationError({"payments": "Payer amounts must add up to the expense total."})
    return payload, amount, computed, payments


class GroupsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            memberships = Membership.objects.filter(user=request.user, is_active=True).select_related("group")
            return Response([
                GroupSerializer(group, context={"membership": membership}).data
                for membership in memberships
                for group in [groups_for_user(request.user).get(pk=membership.group.id)]
            ])
        except DatabaseError:
            logger.exception("Failed to load groups for user_id=%s", request.user.pk)
            raise

    def post(self, request):
        serializer = GroupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            group = serializer.save(created_by=request.user)
            Membership.objects.create(group=group, user=request.user, role="admin")
        return Response(GroupSerializer(group, context={"membership": group_membership(group, request.user)}).data,
                        status=status.HTTP_201_CREATED)


class GroupDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        membership = group_membership(group, request.user)
        return Response(GroupSerializer(group, context={"membership": membership}).data)

    def patch(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        membership = group_membership(group, request.user)
        require_admin(membership)
        serializer = GroupSerializer(group, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        require_admin(group_membership(group, request.user))
        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        group_membership(group, request.user)
        memberships = group.memberships.filter(is_active=True).select_related("user")
        return Response(MembershipSerializer(memberships, many=True).data)

    def post(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        acting_membership = group_membership(group, request.user)
        require_admin(acting_membership)
        email = str(request.data.get("email", "")).strip()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            raise ValidationError({"email": "No active user was found with this email."})
        membership, created = Membership.objects.get_or_create(group=group, user=user, defaults={"is_active": True})
        if not created and not membership.is_active:
            membership.is_active = True
            membership.role = "member"
            membership.save(update_fields=["is_active", "role"])
            created = True
        return Response(MembershipSerializer(membership).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, group_id, membership_id):
        group = get_object_or_404(Group, pk=group_id)
        acting = group_membership(group, request.user)
        target = get_object_or_404(Membership, group=group, pk=membership_id, is_active=True)
        if acting.id != target.id:
            require_admin(acting)
        if target.role == "admin" and group.memberships.filter(role="admin", is_active=True).count() == 1:
            raise ValidationError("A group must have at least one admin.")
        if ExpensePayment.objects.filter(membership=target).exists() or ExpenseShare.objects.filter(membership=target).exists():
            _, balances = group_net_balances(group)
            if balances[target.id] != 0:
                raise ValidationError("This member must settle their group balance before leaving.")
        target.is_active = False
        target.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupInviteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        require_admin(group_membership(group, request.user))
        now = timezone.now()
        Group.objects.filter(invite_expires_at__lte=now).exclude(invite_code_hash__isnull=True).update(
            invite_code_hash=None,
        )
        for _ in range(10):
            token = secrets.token_urlsafe(32)
            code = f"{secrets.randbelow(1_000_000):06d}"
            group.invite_token_hash = hashlib.sha256(token.encode()).hexdigest()
            group.invite_code_hash = hmac.new(
                str(settings.SECRET_KEY).encode(),
                code.encode(),
                hashlib.sha256,
            ).hexdigest()
            group.invite_expires_at = now + timedelta(days=7)
            try:
                with transaction.atomic():
                    group.save(update_fields=["invite_token_hash", "invite_code_hash", "invite_expires_at"])
            except IntegrityError:
                continue
            return Response({"token": token, "code": code, "expires_at": group.invite_expires_at})
        raise ValidationError({"invite": "Unable to generate a unique invitation code. Please try again."})


class JoinGroupView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "group_invite"

    def post(self, request):
        code = request.data.get("code")
        token = str(request.data.get("token", "")).strip()
        if code is not None or (len(token) == 6 and token.isascii() and token.isdigit()):
            code = str(code if code is not None else token).strip()
            if len(code) != 6 or not code.isascii() or not code.isdigit():
                raise ValidationError({"code": "Enter a valid six-digit invitation code."})
            digest = hmac.new(
                str(settings.SECRET_KEY).encode(),
                code.encode(),
                hashlib.sha256,
            ).hexdigest()
            group = Group.objects.filter(
                invite_code_hash=digest,
                invite_expires_at__gt=timezone.now(),
            ).first()
        else:
            digest = hashlib.sha256(token.encode()).hexdigest()
            group = Group.objects.filter(
                invite_token_hash=digest,
                invite_expires_at__gt=timezone.now(),
            ).first()
        if not group:
            raise ValidationError({"invite": "This invitation code or link is invalid or expired."})
        membership, created = Membership.objects.get_or_create(group=group, user=request.user, defaults={"is_active": True})
        if not created and not membership.is_active:
            membership.is_active = True
            membership.role = "member"
            membership.save(update_fields=["is_active", "role"])
            created = True
        return Response(GroupSerializer(group, context={"membership": membership}).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class GroupExpensesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        group_membership(group, request.user)
        return Response([public_expense(expense) for expense in group.expenses.prefetch_related("shares__membership__user", "payments__membership__user")])

    def post(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        group_membership(group, request.user)
        payload, _, shares, payments = validate_expense_payload(group, request.user, request.data)
        with transaction.atomic():
            expense = SharedExpense.objects.create(group=group, created_by=request.user, **payload)
            ExpenseShare.objects.bulk_create([ExpenseShare(expense=expense, membership=member, amount=share, percentage=percentage)
                                              for member, share, percentage in shares])
            ExpensePayment.objects.bulk_create([ExpensePayment(expense=expense, membership=member, amount=paid)
                                                for member, paid in payments])
        return Response(public_expense(expense), status=status.HTTP_201_CREATED)


class GroupExpenseDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, group_id, expense_id):
        group = get_object_or_404(Group, pk=group_id)
        group_membership(group, request.user)
        return get_object_or_404(SharedExpense, group=group, pk=expense_id)

    def get(self, request, group_id, expense_id):
        expense = self.get_object(request, group_id, expense_id)
        return Response(public_expense(expense))

    def patch(self, request, group_id, expense_id):
        expense = self.get_object(request, group_id, expense_id)
        payload, amount, shares, payments = validate_expense_payload(expense.group, request.user, request.data, expense)
        with transaction.atomic():
            for key, value in payload.items():
                setattr(expense, key, value)
            expense.amount = amount
            expense.save()
            expense.shares.all().delete()
            expense.payments.all().delete()
            ExpenseShare.objects.bulk_create([ExpenseShare(expense=expense, membership=member, amount=share, percentage=percentage)
                                              for member, share, percentage in shares])
            ExpensePayment.objects.bulk_create([ExpensePayment(expense=expense, membership=member, amount=paid)
                                                for member, paid in payments])
        return Response(public_expense(expense))

    def delete(self, request, group_id, expense_id):
        expense = self.get_object(request, group_id, expense_id)
        expense.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def group_net_balances(group):
    memberships = list(group.memberships.filter(is_active=True).select_related("user"))
    balances = {membership.id: Decimal("0.00") for membership in memberships}
    for share in ExpenseShare.objects.filter(expense__group=group):
        balances[share.membership_id] -= share.amount
    for payment in ExpensePayment.objects.filter(expense__group=group):
        balances[payment.membership_id] += payment.amount
    for settlement in group.settlements.filter(is_settled=True):
        balances[settlement.from_membership_id] += settlement.amount
        balances[settlement.to_membership_id] -= settlement.amount
    return memberships, balances


def suggested_transfers(memberships, balances):
    debtors = [[member, -balance] for member in memberships if (balance := balances[member.id]) < 0]
    creditors = [[member, balance] for member in memberships if (balance := balances[member.id]) > 0]
    transfers = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        amount = min(debtors[i][1], creditors[j][1]).quantize(CENT)
        if amount:
            transfers.append({"from_membership_id": debtors[i][0].id, "from_name": debtors[i][0].user.name,
                              "to_membership_id": creditors[j][0].id, "to_name": creditors[j][0].user.name,
                              "amount": str(amount)})
        debtors[i][1] -= amount
        creditors[j][1] -= amount
        if not debtors[i][1]:
            i += 1
        if not creditors[j][1]:
            j += 1
    return transfers


class GroupBalancesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        group_membership(group, request.user)
        members, balances = group_net_balances(group)
        return Response({
            "balances": [{"membership_id": member.id, "user_id": member.user_id, "name": member.user.name,
                          "balance": str(balances[member.id].quantize(CENT))} for member in members],
            "suggested_transfers": suggested_transfers(members, balances),
        })


class GroupSettlementsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        group_membership(group, request.user)
        records = group.settlements.select_related("from_membership__user", "to_membership__user")
        members, balances = group_net_balances(group)
        return Response({"settlements": SettlementSerializer(records, many=True).data,
                         "suggested_transfers": suggested_transfers(members, balances)})

    def post(self, request, group_id):
        with transaction.atomic():
            group = get_object_or_404(Group.objects.select_for_update(), pk=group_id)
            group_membership(group, request.user)
            try:
                from_member = Membership.objects.get(group=group, pk=request.data["from_membership_id"], is_active=True)
                to_member = Membership.objects.get(group=group, pk=request.data["to_membership_id"], is_active=True)
                amount = money(request.data["amount"])
            except (KeyError, TypeError, ValueError, InvalidOperation, Membership.DoesNotExist) as exc:
                raise ValidationError("Provide valid group members and an amount.") from exc
            if from_member.id == to_member.id or amount <= 0 or amount > MAX_AMOUNT:
                raise ValidationError("A settlement must be positive and between two different members.")
            if group.settlements.filter(
                from_membership=from_member,
                to_membership=to_member,
                is_settled=False,
            ).exists():
                raise ValidationError("A pending settlement already exists for these members.")
            members, balances = group_net_balances(group)
            expected = next(
                (
                    Decimal(transfer["amount"])
                    for transfer in suggested_transfers(members, balances)
                    if transfer["from_membership_id"] == from_member.id
                    and transfer["to_membership_id"] == to_member.id
                ),
                Decimal("0"),
            )
            if amount != expected:
                raise ValidationError({"amount": "Settlement amount must match the current server-calculated balance."})
            record = Settlement.objects.create(
                group=group, from_membership=from_member, to_membership=to_member,
                amount=amount, created_by=request.user,
            )
        return Response(SettlementSerializer(record).data, status=status.HTTP_201_CREATED)


class GroupSettlementDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, group_id, settlement_id):
        group = get_object_or_404(Group, pk=group_id)
        acting = group_membership(group, request.user)
        settlement = get_object_or_404(Settlement, group=group, pk=settlement_id)
        if acting.role != "admin" and acting.id not in (settlement.from_membership_id, settlement.to_membership_id):
            raise PermissionDenied("Only the group admins or settlement participants can confirm this transfer.")
        if not settlement.is_settled:
            settlement.is_settled = True
            settlement.settled_at = timezone.now()
            settlement.save(update_fields=["is_settled", "settled_at"])
        return Response(SettlementSerializer(settlement).data)


class GroupChatView(APIView):
    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        if isinstance(exc, DatabaseError):
            logger.exception(
                "Database error while handling group chat request path=%s user_id=%s",
                self.request.path,
                self.request.user.pk if self.request.user.is_authenticated else None,
            )
            return Response(
                {"detail": "Group chat is temporarily unavailable. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return super().handle_exception(exc)

    def get(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        group_membership(group, request.user)
        try:
            limit = min(max(int(request.query_params.get("limit", 50)), 1), 100)
            before = int(request.query_params["before"]) if request.query_params.get("before") else None
        except (TypeError, ValueError) as exc:
            raise ValidationError({"pagination": "before and limit must be integers."}) from exc
        queryset = group.messages.select_related("sender")
        if before:
            queryset = queryset.filter(id__lt=before)
        messages = list(queryset.order_by("-id")[:limit + 1])
        has_more = len(messages) > limit
        messages = messages[:limit]
        messages.reverse()
        return Response({"results": ChatMessageSerializer(messages, many=True).data,
                         "next_before": messages[0].id if messages and has_more else None})

    def post(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        group_membership(group, request.user)
        message_type = str(request.data.get("message_type", "TEXT")).upper()
        if message_type == "EXPENSE":
            try:
                expense_id = int(request.data["expense_id"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValidationError({"expense_id": "Provide a valid group expense ID."}) from exc
            expense = get_object_or_404(SharedExpense, group=group, pk=expense_id)
            text = f"Expense shared: {expense.title}"
            message, created = ChatMessage.objects.get_or_create(
                group=group,
                expense=expense,
                message_type="EXPENSE",
                defaults={"sender": request.user, "text": text},
            )
        elif message_type == "TEXT":
            text = str(request.data.get("text", "")).strip()
            if not text or len(text) > 2000:
                raise ValidationError({"text": "Message must contain 1–2000 characters."})
            message = ChatMessage.objects.create(
                group=group, sender=request.user, text=text, message_type="TEXT",
            )
            created = True
        else:
            raise ValidationError({"message_type": "Choose TEXT or EXPENSE."})
        serialized = cast(Mapping[str, Any], ChatMessageSerializer(message).data)
        return Response(
            serialized,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class GroupChatReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, group_id):
        group = get_object_or_404(Group, pk=group_id)
        membership = group_membership(group, request.user)
        membership.last_read_at = timezone.now()
        membership.save(update_fields=["last_read_at"])
        return Response({"last_read_at": membership.last_read_at})
