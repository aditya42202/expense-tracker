from decimal import Decimal

from django.db.models import Q, Sum
from django.utils.dateparse import parse_date
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Budget, Category, CategoryBudget, Expense, GroupExpense, GroupMember, Income, Notification, Person, SavingsGoal, SettlementTransaction
from .permissions import IsOwner
from .serializers import (
    BudgetSerializer,
    CategoryBudgetSerializer,
    CategorySerializer,
    ExpenseSerializer,
    IncomeSerializer,
    NotificationSerializer,
    PersonSerializer,
    SavingsGoalSerializer,
    UserSerializer,
    GroupExpenseSerializer,
    GroupMemberSerializer,
    SettlementTransactionSerializer,
)


def _date_range(request):
    start_date = request.query_params.get("date_from")
    end_date = request.query_params.get("date_to")
    if start_date and not parse_date(start_date):
        raise serializers.ValidationError({"date_from": "Enter a valid date in YYYY-MM-DD format."})
    if end_date and not parse_date(end_date):
        raise serializers.ValidationError({"date_to": "Enter a valid date in YYYY-MM-DD format."})
    if start_date and end_date and start_date > end_date:
        raise serializers.ValidationError({"date_to": "The end date must be on or after the start date."})
    return start_date, end_date


def _filter_transactions(queryset, request):
    start_date, end_date = _date_range(request)
    if start_date:
        queryset = queryset.filter(date__gte=start_date)
    if end_date:
        queryset = queryset.filter(date__lte=end_date)
    category = request.query_params.get("category")
    if category:
        if not category.isdigit():
            raise serializers.ValidationError({"category": "Enter a valid category ID."})
        queryset = queryset.filter(category_id=category)
    search = request.query_params.get("search", "").strip()
    if search:
        queryset = queryset.filter(
            Q(description__icontains=search)
            | Q(notes__icontains=search)
            | Q(category__name__icontains=search)
            | Q(payment_method__icontains=search)
        )
    return queryset


def _build_category_summary(user, start_date=None, end_date=None):
    expenses = Expense.objects.filter(user=user)
    if start_date:
        expenses = expenses.filter(date__gte=start_date)
    if end_date:
        expenses = expenses.filter(date__lte=end_date)
    return list(
        expenses
        .values("category__name")
        .annotate(total=Sum("amount"))
        .order_by("-total")[:6]
    )


def _notify_user(user, title, message):
    Notification.objects.create(user=user, title=title, message=message)


def _month_series(user, months=6):
    today = timezone.localdate()
    month_data = []
    for offset in range(months):
        month = today.month - offset
        year = today.year
        while month <= 0:
            month += 12
            year -= 1
        expense_total = (
            Expense.objects.filter(user=user, date__month=month, date__year=year)
            .aggregate(total=Sum("amount"))["total"]
            or Decimal("0")
        )
        income_total = (
            Income.objects.filter(user=user, date__month=month, date__year=year)
            .aggregate(total=Sum("amount"))["total"]
            or Decimal("0")
        )
        month_label = timezone.datetime(year, month, 1).strftime("%b")
        month_data.insert(0, {"month": month_label, "income": float(income_total), "expense": float(expense_total)})
    return month_data


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user).order_by("name")

    def perform_create(self, serializer):
        category = serializer.save(user=self.request.user)
        _notify_user(self.request.user, "Category added", f"{category.name} was added to your categories.")

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj


class PersonViewSet(viewsets.ModelViewSet):
    serializer_class = PersonSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Person.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        person = serializer.save(user=self.request.user)
        _notify_user(self.request.user, "Person added", f"{person.name} was added to your people list.")

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        queryset = Expense.objects.filter(user=self.request.user).select_related("category", "person")
        return _filter_transactions(queryset, self.request).order_by("-date", "-created_at")

    def perform_create(self, serializer):
        expense = serializer.save(user=self.request.user)
        Notification.objects.create(
            user=self.request.user,
            title="Expense added",
            message=f"{expense.description or expense.category.name} was recorded for {expense.amount}"
            f"{f' by {expense.person.name}' if expense.person else ''}.",
        )

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj


class IncomeViewSet(viewsets.ModelViewSet):
    serializer_class = IncomeSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        queryset = Income.objects.filter(user=self.request.user).select_related("category")
        return _filter_transactions(queryset, self.request).order_by("-date", "-created_at")

    def perform_create(self, serializer):
        income = serializer.save(user=self.request.user)
        _notify_user(
            self.request.user,
            "Income added",
            f"{income.description or income.category.name} was added for {income.amount}.",
        )

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj


class BudgetViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Budget.objects.filter(user=self.request.user).order_by("year", "month")

    def perform_create(self, serializer):
        budget = serializer.save(user=self.request.user)
        _notify_user(self.request.user, "Budget added", f"A budget of {budget.amount} was added for {budget.month}/{budget.year}.")

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj

    @action(detail=False, methods=["get"], url_path="current")
    def current_budget(self, request):
        today = timezone.localdate()
        budget = Budget.objects.filter(user=request.user, month=today.month, year=today.year).first()
        total_expense = Expense.objects.filter(user=request.user, date__month=today.month, date__year=today.year).aggregate(total=Sum("amount"))[
            "total"
        ] or Decimal("0")
        data = {
            "monthly_budget": float(budget.amount) if budget else 0,
            "budget_used": float(total_expense),
            "budget_remaining": float((budget.amount if budget else 0) - total_expense),
            "daily_budget": float((budget.amount / 30) if budget else 0),
            "today_expense": float(Expense.objects.filter(user=request.user, date=today).aggregate(total=Sum("amount"))["total"] or 0),
        }
        return Response(data)


class CategoryBudgetViewSet(viewsets.ModelViewSet):
    serializer_class = CategoryBudgetSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        return CategoryBudget.objects.filter(user=self.request.user).select_related("category").order_by("year", "month", "category__name")

    def perform_create(self, serializer):
        category_budget = serializer.save(user=self.request.user)
        _notify_user(
            self.request.user,
            "Category budget added",
            f"A budget of {category_budget.amount} was added for {category_budget.category.name}.",
        )

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj


class SavingsGoalViewSet(viewsets.ModelViewSet):
    serializer_class = SavingsGoalSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        return SavingsGoal.objects.filter(user=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        goal = serializer.save(user=self.request.user)
        _notify_user(self.request.user, "Savings goal added", f"{goal.name} was added as a savings goal.")

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj

    @action(detail=True, methods=["post"], url_path="add-money")
    def add_money(self, request, pk=None):
        goal = self.get_object()
        amount = Decimal(str(request.data.get("amount", 0)))
        goal.current_amount += amount
        goal.save()
        _notify_user(self.request.user, "Savings added", f"{amount} was added to {goal.name}.")
        return Response(self.get_serializer(goal).data)

    @action(detail=True, methods=["post"], url_path="withdraw-money")
    def withdraw_money(self, request, pk=None):
        goal = self.get_object()
        amount = Decimal(str(request.data.get("amount", 0)))
        goal.current_amount = max(Decimal("0"), goal.current_amount - amount)
        goal.save()
        return Response(self.get_serializer(goal).data)


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response(self.get_serializer(notification).data)


class GroupMemberViewSet(viewsets.ModelViewSet):
    serializer_class = GroupMemberSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return GroupMember.objects.filter(owner=self.request.user).order_by("name")

    def list(self, request, *args, **kwargs):
        GroupMember.objects.get_or_create(owner=request.user, name=request.user.name)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class GroupExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = GroupExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return GroupExpense.objects.filter(owner=self.request.user).prefetch_related("participants__member", "settlement_transactions__from_member", "settlement_transactions__to_member")

    def perform_create(self, serializer):
        serializer.save()


class SettlementViewSet(viewsets.GenericViewSet):
    serializer_class = SettlementTransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SettlementTransaction.objects.filter(expense__owner=self.request.user).select_related("expense", "from_member", "to_member")

    def list(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        member, _ = GroupMember.objects.get_or_create(owner=request.user, name=request.user.name)
        expenses = GroupExpense.objects.filter(owner=request.user).prefetch_related("participants")
        total = sum((expense.amount for expense in expenses), Decimal("0"))
        paid = share = Decimal("0")
        for expense in expenses:
            row = next((item for item in expense.participants.all() if item.member_id == member.id), None)
            if row:
                paid += row.paid_amount
                share += row.share_amount
        return Response({
            "total_group_expenses": total,
            "your_contribution": paid,
            "your_share": share,
            "you_need_to_pay": sum((item.amount for item in self.get_queryset().filter(from_member=member, status="PENDING")), Decimal("0")),
            "you_need_to_receive": sum((item.amount for item in self.get_queryset().filter(to_member=member, status="PENDING")), Decimal("0")),
            "net_balance": paid - share,
        })

    @action(detail=True, methods=["post"], url_path="mark-settled")
    def mark_settled(self, request, pk=None):
        transaction = self.get_object()
        transaction.status = "SETTLED"
        transaction.settled_at = timezone.now()
        transaction.save(update_fields=["status", "settled_at"])
        return Response(self.get_serializer(transaction).data)


class DashboardViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        today = timezone.localdate()
        total_income = Income.objects.filter(user=request.user).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        total_expense = Expense.objects.filter(user=request.user).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        monthly_budget = Budget.objects.filter(user=request.user, month=today.month, year=today.year).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        today_expense = Expense.objects.filter(user=request.user, date=today).aggregate(total=Sum("amount"))["total"] or Decimal("0")
        monthly_expense = Expense.objects.filter(user=request.user, date__month=today.month, date__year=today.year).aggregate(total=Sum("amount"))["total"] or Decimal("0")

        response = {
            "total_income": float(total_income),
            "total_expense": float(total_expense),
            "balance": float(total_income - total_expense),
            "monthly_budget": float(monthly_budget),
            "budget_remaining": float(monthly_budget - monthly_expense),
            "today_expense": float(today_expense),
            "total_savings": float(total_income - total_expense),
            "current_month_expense": float(monthly_expense),
            "current_month_income": float(
                Income.objects.filter(user=request.user, date__month=today.month, date__year=today.year)
                .aggregate(total=Sum("amount"))["total"] or Decimal("0")
            ),
            "expense_count": Expense.objects.filter(user=request.user).count(),
            "income_count": Income.objects.filter(user=request.user).count(),
            "category_breakdown": _build_category_summary(request.user),
            "highest_expenses": [],
            "monthly_trend": _month_series(request.user, 6),
            "recent_transactions": [],
        }

        recent = Expense.objects.filter(user=request.user).order_by("-date", "-created_at")[:10]
        for item in recent:
            response["recent_transactions"].append(
                {
                    "id": item.id,
                    "date": item.date,
                    "type": "Expense",
                    "category": item.category.name,
                    "description": item.description,
                    "amount": float(item.amount),
                    "payment_method": item.payment_method,
                }
            )

        income_recent = Income.objects.filter(user=request.user).order_by("-date", "-created_at")[:10]
        for item in income_recent:
            response["recent_transactions"].append(
                {
                    "id": item.id,
                    "date": item.date,
                    "type": "Income",
                    "category": item.category.name,
                    "description": item.description,
                    "amount": float(item.amount),
                    "payment_method": item.payment_method,
                }
            )

        response["recent_transactions"] = sorted(response["recent_transactions"], key=lambda x: x["date"], reverse=True)[:10]
        response["highest_expenses"] = [
            {
                "id": item.id,
                "date": item.date,
                "category": item.category.name,
                "description": item.description,
                "amount": float(item.amount),
            }
            for item in Expense.objects.filter(user=request.user).select_related("category").order_by("-amount", "-date")[:5]
        ]
        return Response(response)

    @action(detail=False, methods=["get"], url_path="reports")
    def reports(self, request):
        aggregate = self.list(request).data
        return Response({
            "summary": {
                "total_income": aggregate["total_income"],
                "total_expense": aggregate["total_expense"],
                "balance": aggregate["balance"],
                "monthly_budget": aggregate["monthly_budget"],
                "budget_remaining": aggregate["budget_remaining"],
            },
            "category_breakdown": aggregate["category_breakdown"],
            "monthly_trend": aggregate["monthly_trend"],
            "recent_transactions": aggregate["recent_transactions"],
            "expense_count": aggregate["expense_count"],
            "income_count": aggregate["income_count"],
            "highest_expenses": aggregate["highest_expenses"],
        })

    @action(detail=False, methods=["get"], url_path="monthly")
    def monthly(self, request):
        try:
            months = int(request.query_params.get("months", 12))
        except ValueError:
            raise serializers.ValidationError({"months": "Enter a number between 1 and 24."})
        if not 1 <= months <= 24:
            raise serializers.ValidationError({"months": "Enter a number between 1 and 24."})
        return Response({"monthly_trend": _month_series(request.user, months)})

    @action(detail=False, methods=["get"], url_path="categories")
    def categories(self, request):
        start_date, end_date = _date_range(request)
        return Response({"category_breakdown": _build_category_summary(request.user, start_date, end_date)})


class ProfileViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def update(self, request):
        user = request.user
        user.name = request.data.get("name", user.name)
        if request.data.get("profile_image"):
            user.profile_image = request.data.get("profile_image")
        user.save()
        return Response(UserSerializer(user).data)

    @action(detail=False, methods=["post"], url_path="change-password")
    def change_password(self, request):
        current = request.data.get("current_password")
        new_password = request.data.get("new_password")
        if not request.user.check_password(current):
            return Response({"error": "Current password is incorrect"}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_password) < 8:
            return Response({"error": "Password must be at least 8 characters"}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(new_password)
        request.user.save()
        return Response({"message": "Password updated successfully"})
