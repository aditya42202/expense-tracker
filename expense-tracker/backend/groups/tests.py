from datetime import timedelta
from typing import Any, Protocol, cast
from unittest.mock import patch

from django.db import DatabaseError
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from expenses.models import AIInsight
from .models import ChatMessage, ExpenseShare, Group, Membership, SharedExpense


class APIResponse(Protocol):
    status_code: int
    data: Any

    def __getitem__(self, key: str) -> str: ...


class TypedAPIClient(APIClient):
    def get(self, *args: Any, **kwargs: Any) -> APIResponse:
        return cast(APIResponse, super().get(*args, **kwargs))

    def post(self, *args: Any, **kwargs: Any) -> APIResponse:
        return cast(APIResponse, super().post(*args, **kwargs))

    def patch(self, *args: Any, **kwargs: Any) -> APIResponse:
        return cast(APIResponse, super().patch(*args, **kwargs))

    def delete(self, *args: Any, **kwargs: Any) -> APIResponse:
        return cast(APIResponse, super().delete(*args, **kwargs))

    def options(self, *args: Any, **kwargs: Any) -> APIResponse:
        return cast(APIResponse, super().options(*args, **kwargs))


class GroupAPITests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = User.objects.create_user(email="owner@example.test", password="password-123", name="Owner", is_active=True)
        self.member = User.objects.create_user(email="member@example.test", password="password-123", name="Member", is_active=True)
        self.outsider = User.objects.create_user(email="other@example.test", password="password-123", name="Outsider", is_active=True)
        self.client: TypedAPIClient = TypedAPIClient()
        self.client.force_authenticate(self.owner)
        response = self.client.post("/api/groups/", {"name": "Trip", "description": "Weekend"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.group = Group.objects.get(pk=response.data["id"])
        self.owner_member = Membership.objects.get(group=self.group, user=self.owner)
        self.member_response = self.client.post(
            f"/api/groups/{self.group.id}/members/", {"email": self.member.email}, format="json",
        )
        self.member_id = self.member_response.data["id"]

    def test_group_crud_and_membership_authorization(self):
        self.assertEqual(self.member_response.status_code, 201)
        self.assertEqual(self.client.patch(f"/api/groups/{self.group.id}/", {"name": "Updated"}, format="json").status_code, 200)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(f"/api/groups/{self.group.id}/").status_code, 200)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(f"/api/groups/{self.group.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/groups/{self.group.id}/expenses/").status_code, 404)

    def test_group_list_and_member_list_return_active_members_only(self):
        groups = self.client.get("/api/groups/")
        self.assertEqual(groups.status_code, 200)
        self.assertEqual([group["id"] for group in groups.data], [self.group.id])
        self.assertEqual(groups.data[0]["unread_count"], 0)

        members = self.client.get(f"/api/groups/{self.group.id}/members/")
        self.assertEqual(members.status_code, 200)
        self.assertEqual({member["user_id"] for member in members.data}, {self.owner.id, self.member.id})

        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(f"/api/groups/{self.group.id}/members/").status_code, 404)

    def test_cors_preflight_allows_frontend_idempotency_key(self):
        response = self.client.options(
            "/api/groups/",
            HTTP_ORIGIN="http://localhost:5173",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type,idempotency-key",
        )
        self.assertIn("idempotency-key", response["access-control-allow-headers"])

    def test_custom_percentage_shares_and_payer_amounts_are_server_validated(self):
        url = f"/api/groups/{self.group.id}/expenses/"
        bad = self.client.post(url, {
            "title": "Dinner", "amount": "100.00", "date": "2026-11-02", "split_type": "custom",
            "shares": [{"membership_id": self.owner_member.id, "amount": "40"},
                       {"membership_id": self.member_id, "amount": "40"}],
            "payments": [{"membership_id": self.owner_member.id, "amount": "100"}],
        }, format="json")
        self.assertEqual(bad.status_code, 400)
        self.assertFalse(SharedExpense.objects.exists())

        invalid_percentage = self.client.post(url, {
            "title": "Dinner", "amount": "100.00", "date": "2026-11-02", "split_type": "percentage",
            "shares": [{"membership_id": self.owner_member.id, "percentage": "not-a-number"},
                       {"membership_id": self.member_id, "percentage": "100"}],
            "payments": [{"membership_id": self.owner_member.id, "amount": "100"}],
        }, format="json")
        self.assertEqual(invalid_percentage.status_code, 400)

        valid = self.client.post(url, {
            "title": "Dinner", "amount": "100.00", "date": "2026-11-02", "split_type": "percentage",
            "shares": [{"membership_id": self.owner_member.id, "percentage": "80"},
                       {"membership_id": self.member_id, "percentage": "20"}],
            "payments": [{"membership_id": self.owner_member.id, "amount": "60"},
                         {"membership_id": self.member_id, "amount": "40"}],
        }, format="json")
        self.assertEqual(valid.status_code, 201, valid.data)
        self.assertEqual(sum(float(share["amount"]) for share in valid.data["shares"]), 100)
        self.assertEqual(ExpenseShare.objects.count(), 2)
        balance = self.client.get(f"/api/groups/{self.group.id}/balances/")
        amounts = {row["membership_id"]: row["balance"] for row in balance.data["balances"]}
        self.assertEqual(amounts[self.owner_member.id], "-20.00")
        self.assertEqual(amounts[self.member_id], "20.00")
        transfer = balance.data["suggested_transfers"][0]
        incorrect_amount = self.client.post(f"/api/groups/{self.group.id}/settlements/", {
            **transfer, "amount": "99.99",
        }, format="json")
        self.assertEqual(incorrect_amount.status_code, 400)
        settlement = self.client.post(f"/api/groups/{self.group.id}/settlements/", transfer, format="json")
        self.assertEqual(settlement.status_code, 201, settlement.data)
        duplicate = self.client.post(f"/api/groups/{self.group.id}/settlements/", transfer, format="json")
        self.assertEqual(duplicate.status_code, 400)
        settled = self.client.post(
            f"/api/groups/{self.group.id}/settlements/{settlement.data['id']}/settle/", {}, format="json",
        )
        self.assertEqual(settled.status_code, 200)
        balances_after_settlement = self.client.get(f"/api/groups/{self.group.id}/balances/").data["balances"]
        self.assertTrue(all(row["balance"] == "0.00" for row in balances_after_settlement))

    def test_expense_patch_preserves_splits_and_payers_when_omitted(self):
        created = self.client.post(f"/api/groups/{self.group.id}/expenses/", {
            "title": "Taxi", "amount": "10.00", "date": "2026-11-02", "split_type": "equal",
            "shares": [{"membership_id": self.owner_member.id}, {"membership_id": self.member_id}],
            "payments": [{"membership_id": self.owner_member.id, "amount": "10.00"}],
        }, format="json")
        self.assertEqual(created.status_code, 201)
        updated = self.client.patch(
            f"/api/groups/{self.group.id}/expenses/{created.data['id']}/", {"title": "Updated taxi"}, format="json",
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["title"], "Updated taxi")
        self.assertEqual(len(updated.data["shares"]), 2)
        self.assertEqual(updated.data["payments"][0]["amount"], "10.00")

    def test_equal_split_rounds_to_cents_and_custom_payer_total_is_enforced(self):
        response = self.client.post(f"/api/groups/{self.group.id}/expenses/", {
            "title": "Taxi", "amount": "10.00", "date": "2026-11-02", "split_type": "equal",
            "shares": [{"membership_id": self.owner_member.id}, {"membership_id": self.member_id}],
            "payments": [{"membership_id": self.owner_member.id, "amount": "9.00"}],
        }, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(f"/api/groups/{self.group.id}/expenses/", {
            "title": "Taxi", "amount": "10.01", "date": "2026-11-02", "split_type": "equal",
            "shares": [{"membership_id": self.owner_member.id}, {"membership_id": self.member_id}],
            "payments": [{"membership_id": self.owner_member.id, "amount": "10.01"}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual([share["amount"] for share in response.data["shares"]], ["5.01", "5.00"])

    def test_group_delete_removes_its_expense_ledger(self):
        created = self.client.post(f"/api/groups/{self.group.id}/expenses/", {
            "title": "Taxi", "amount": "10.00", "date": "2026-11-02", "split_type": "equal",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        response = self.client.delete(f"/api/groups/{self.group.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(SharedExpense.objects.exists())

    def test_invite_join_and_chat_history_unread_counts(self):
        invite = self.client.post(f"/api/groups/{self.group.id}/invite/", {}, format="json")
        self.assertEqual(invite.status_code, 200)
        self.assertEqual(len(invite.data["code"]), 6)
        self.assertTrue(invite.data["code"].isascii() and invite.data["code"].isdigit())
        self.client.force_authenticate(self.outsider)
        joined = self.client.post("/api/groups/join/", {"token": invite.data["token"]}, format="json")
        self.assertEqual(joined.status_code, 201)
        self.client.force_authenticate(self.member)
        sent = self.client.post(f"/api/groups/{self.group.id}/chat/", {"text": "Hi there"}, format="json")
        self.assertEqual(sent.status_code, 201, sent.data)
        self.assertNotIn("delivery_status", sent.data)
        self.assertTrue(ChatMessage.objects.filter(group=self.group, text="Hi there").exists())
        self.client.force_authenticate(self.owner)
        history = self.client.get(f"/api/groups/{self.group.id}/chat/").data["results"]
        self.assertTrue(any(message["text"] == "Hi there" for message in history))
        sent = self.client.post(f"/api/groups/{self.group.id}/chat/", {"text": "Hello"}, format="json")
        self.assertEqual(sent.status_code, 201, sent.data)
        page = self.client.get(f"/api/groups/{self.group.id}/chat/?limit=1")
        self.assertEqual(len(page.data["results"]), 1)
        self.assertIsNotNone(page.data["next_before"])
        group_data = self.client.get("/api/groups/").data[0]
        self.assertEqual(group_data["unread_count"], 1)
        self.assertEqual(self.client.post(f"/api/groups/{self.group.id}/chat/read/").status_code, 200)

    def test_expense_chat_message_is_structured_and_idempotent(self):
        created = self.client.post(f"/api/groups/{self.group.id}/expenses/", {
            "title": "Dinner", "amount": "30.00", "date": timezone.localdate().isoformat(),
            "split_type": "equal",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)

        url = f"/api/groups/{self.group.id}/chat/"
        first = self.client.post(url, {
            "message_type": "EXPENSE", "expense_id": created.data["id"],
        }, format="json")
        retry = self.client.post(url, {
            "message_type": "EXPENSE", "expense_id": created.data["id"],
        }, format="json")

        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data["id"], first.data["id"])
        self.assertEqual(first.data["message_type"], "EXPENSE")
        self.assertEqual(first.data["expense_title"], "Dinner")
        self.assertEqual(ChatMessage.objects.filter(group=self.group, expense_id=created.data["id"]).count(), 1)
        detail = self.client.get(f"/api/groups/{self.group.id}/expenses/{created.data['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["title"], "Dinner")

        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(f"/api/groups/{self.group.id}/expenses/{created.data['id']}/").status_code, 404)

    def test_six_digit_invitation_code_is_hashed_and_joins_group(self):
        invite = self.client.post(f"/api/groups/{self.group.id}/invite/", {}, format="json")
        self.assertEqual(invite.status_code, 200)
        self.group.refresh_from_db()
        self.assertNotEqual(self.group.invite_code_hash, invite.data["code"])

        self.client.force_authenticate(self.outsider)
        joined = self.client.post("/api/groups/join/", {"code": invite.data["code"]}, format="json")
        self.assertEqual(joined.status_code, 201, joined.data)
        self.assertEqual(joined.data["id"], self.group.id)

    @patch("groups.views.secrets.randbelow", return_value=7)
    def test_invitation_code_keeps_leading_zeroes_and_expires_after_seven_days(self, _randbelow):
        before = timezone.now()
        invite = self.client.post(f"/api/groups/{self.group.id}/invite/", {}, format="json")
        after = timezone.now()

        self.assertEqual(invite.status_code, 200)
        self.assertEqual(invite.data["code"], "000007")
        expiry = invite.data["expires_at"]
        self.assertGreaterEqual(expiry, before + timedelta(days=7))
        self.assertLessEqual(expiry, after + timedelta(days=7))

    def test_invalid_six_digit_invitation_code_is_rejected(self):
        response = self.client.post("/api/groups/join/", {"code": "12a456"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_expired_invitation_code_and_link_are_rejected(self):
        invite = self.client.post(f"/api/groups/{self.group.id}/invite/", {}, format="json")
        self.group.refresh_from_db()
        self.group.invite_expires_at = timezone.now() - timedelta(seconds=1)
        self.group.save(update_fields=["invite_expires_at"])
        self.client.force_authenticate(self.outsider)

        expired_code = self.client.post("/api/groups/join/", {"code": invite.data["code"]}, format="json")
        expired_link = self.client.post("/api/groups/join/", {"token": invite.data["token"]}, format="json")
        self.assertEqual(expired_code.status_code, 400)
        self.assertEqual(expired_link.status_code, 400)
        self.assertFalse(Membership.objects.filter(group=self.group, user=self.outsider, is_active=True).exists())

    def test_invite_code_collision_retries_with_an_unused_code(self):
        second_group_response = self.client.post("/api/groups/", {"name": "Second group"}, format="json")
        self.assertEqual(second_group_response.status_code, 201, second_group_response.data)

        with patch("groups.views.secrets.randbelow", side_effect=[123456, 123456, 654321]):
            first_invite = self.client.post(f"/api/groups/{self.group.id}/invite/", {}, format="json")
            second_invite = self.client.post(
                f"/api/groups/{second_group_response.data['id']}/invite/", {}, format="json",
            )

        self.assertEqual(first_invite.data["code"], "123456")
        self.assertEqual(second_invite.status_code, 200, second_invite.data)
        self.assertEqual(second_invite.data["code"], "654321")

    @patch("groups.views.get_object_or_404", side_effect=DatabaseError("database unavailable"))
    def test_chat_database_errors_return_safe_service_unavailable_response(self, _get_object):
        response = self.client.get(f"/api/groups/{self.group.id}/chat/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.data["detail"],
            "Group chat is temporarily unavailable. Please try again later.",
        )

    @patch("expenses.ai_views._request_ai", return_value="Food spending is the largest category.")
    def test_group_ai_insights_use_authorized_group_data(self, request_ai):
        created = self.client.post(f"/api/groups/{self.group.id}/expenses/", {
            "title": "Dinner", "amount": "120.00", "date": timezone.localdate().isoformat(),
            "category": "Food", "split_type": "equal",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)

        response = self.client.post(
            f"/api/groups/{self.group.id}/ai-insights/", {"consent": True}, format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["content"], "Food spending is the largest category.")
        financial_data = request_ai.call_args.args[1]["group_financial_data"]
        self.assertEqual(financial_data["current_month_expenses"], "120.00")
        self.assertEqual(financial_data["category_totals"], [{"category": "Food", "total": "120.00", "count": 1}])
        self.assertEqual(
            AIInsight.objects.filter(user=self.owner, feature="group_insights", content=response.data["content"]).count(),
            1,
        )

    @patch("expenses.ai_views._request_ai")
    def test_group_ai_insights_require_consent_and_group_membership(self, request_ai):
        missing_consent = self.client.post(f"/api/groups/{self.group.id}/ai-insights/", {}, format="json")
        self.assertEqual(missing_consent.status_code, 400)
        request_ai.assert_not_called()

        self.client.force_authenticate(self.outsider)
        forbidden = self.client.post(
            f"/api/groups/{self.group.id}/ai-insights/", {"consent": True}, format="json",
        )
        self.assertEqual(forbidden.status_code, 404)
        request_ai.assert_not_called()
