from datetime import timedelta
from typing import Any, Protocol, cast
from unittest.mock import patch

from django.db import DatabaseError
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from expenses.models import AIInsight
from .models import ChatMessage, ChatReaction, ExpenseShare, Group, HiddenChatMessage, Membership, SharedExpense


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
        self.client.force_authenticate(self.member)
        member_edit = self.client.patch(
            f"/api/groups/{self.group.id}/expenses/{created.data['id']}/", {"title": "Member edit"}, format="json",
        )
        self.assertEqual(member_edit.status_code, 200, member_edit.data)
        self.assertEqual(member_edit.data["title"], "Member edit")

    def test_group_expenses_can_only_be_edited_for_thirty_minutes(self):
        created = self.client.post(f"/api/groups/{self.group.id}/expenses/", {
            "title": "Taxi", "amount": "10.00", "date": timezone.localdate().isoformat(), "split_type": "equal",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        expense = SharedExpense.objects.get(pk=created.data["id"])
        expense.created_at = timezone.now() - timedelta(minutes=31)
        expense.save(update_fields=["created_at"])

        response = self.client.patch(
            f"/api/groups/{self.group.id}/expenses/{expense.id}/", {"title": "Too late"}, format="json",
        )

        self.assertEqual(response.status_code, 403)
        expense.refresh_from_db()
        self.assertEqual(expense.title, "Taxi")

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

    def test_chat_members_can_poll_replies_and_only_read_their_group(self):
        url = f"/api/groups/{self.group.id}/chat/"
        self.assertEqual(self.client.post(url, {"text": "   "}, format="json").status_code, 400)
        admin_message = self.client.post(url, {"text": "Dinner is ready"}, format="json")
        self.assertEqual(admin_message.status_code, 201, admin_message.data)

        self.client.force_authenticate(self.member)
        member_history = self.client.get(url)
        self.assertEqual(member_history.status_code, 200)
        self.assertEqual(member_history.data["results"][0]["id"], admin_message.data["id"])
        self.assertEqual(member_history.data["results"][0]["sender_name"], "Owner")

        member_reply = self.client.post(url, {"text": "On my way"}, format="json")
        self.assertEqual(member_reply.status_code, 201, member_reply.data)
        self.client.force_authenticate(self.owner)
        admin_followup = self.client.post(url, {"text": "See you soon"}, format="json")
        self.assertEqual(admin_followup.status_code, 201, admin_followup.data)
        incremental = self.client.get(f"{url}?after={admin_message.data['id']}&limit=1")
        self.assertEqual(incremental.status_code, 200)
        self.assertEqual([message["id"] for message in incremental.data["results"]], [member_reply.data["id"]])
        self.assertEqual(incremental.data["next_after"], member_reply.data["id"])
        next_page = self.client.get(f"{url}?after={incremental.data['next_after']}&limit=1")
        self.assertEqual([message["id"] for message in next_page.data["results"]], [admin_followup.data["id"]])
        self.assertIsNone(next_page.data["next_after"])
        self.assertEqual(
            [message["id"] for message in self.client.get(url).data["results"]],
            [admin_message.data["id"], member_reply.data["id"], admin_followup.data["id"]],
        )
        self.assertEqual(self.client.get(f"{url}?after=invalid").status_code, 400)
        self.assertEqual(self.client.get(f"{url}?after=1&before=2").status_code, 400)

        other_group_response = self.client.post("/api/groups/", {"name": "Other group"}, format="json")
        other_group_url = f"/api/groups/{other_group_response.data['id']}/chat/"
        self.assertEqual(other_group_response.status_code, 201)
        self.assertEqual(self.client.get(other_group_url).data["results"], [])

        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.post(url, {"text": "Not a member"}, format="json").status_code, 404)
        self.assertEqual(self.client.post(f"{url}read/").status_code, 404)

    def test_chat_reactions_delete_for_me_and_delete_for_everyone_limits(self):
        message = self.client.post(f"/api/groups/{self.group.id}/chat/", {"text": "Dinner?"}, format="json")
        message_id = message.data["id"]
        reaction_url = f"/api/groups/{self.group.id}/chat/{message_id}/reaction/"
        self.client.force_authenticate(self.member)

        reacted = self.client.post(reaction_url, {"emoji": "👍"}, format="json")
        self.assertEqual(reacted.status_code, 200, reacted.data)
        self.assertEqual(reacted.data["reactions"], [{"emoji": "👍", "count": 1, "reacted_by_me": True}])
        self.assertEqual(ChatReaction.objects.filter(message_id=message_id, user=self.member).count(), 1)
        self.assertEqual(self.client.post(reaction_url, {"emoji": "💣"}).status_code, 400)
        changed_reaction = self.client.post(reaction_url, {"emoji": "❤️"}, format="json")
        self.assertEqual(changed_reaction.data["reactions"], [{"emoji": "❤️", "count": 1, "reacted_by_me": True}])

        delete_url = f"/api/groups/{self.group.id}/chat/{message_id}/delete/"
        self.assertEqual(self.client.post(delete_url, {"for_everyone": True}, format="json").status_code, 403)
        hidden = self.client.post(delete_url, {"for_everyone": False}, format="json")
        self.assertEqual(hidden.status_code, 204)
        self.assertTrue(HiddenChatMessage.objects.filter(message_id=message_id, user=self.member).exists())
        self.assertFalse(any(row["id"] == message_id for row in self.client.get(
            f"/api/groups/{self.group.id}/chat/",
        ).data["results"]))

        self.client.force_authenticate(self.owner)
        expired = ChatMessage.objects.get(pk=message_id)
        expired.created_at = timezone.now() - timedelta(hours=1, seconds=1)
        expired.save(update_fields=["created_at"])
        self.assertEqual(self.client.post(delete_url, {"for_everyone": True}, format="json").status_code, 403)
        self.assertTrue(ChatMessage.objects.filter(pk=message_id).exists())
        recent = ChatMessage.objects.create(group=self.group, sender=self.owner, text="Delete in time")
        recent_delete = self.client.post(
            f"/api/groups/{self.group.id}/chat/{recent.id}/delete/", {"for_everyone": True}, format="json",
        )
        self.assertEqual(recent_delete.status_code, 204)
        self.assertFalse(ChatMessage.objects.filter(pk=recent.id).exists())

    def test_admin_can_block_and_clear_chat_but_members_cannot(self):
        message = self.client.post(f"/api/groups/{self.group.id}/chat/", {"text": "Visible"}, format="json")
        member_url = f"/api/groups/{self.group.id}/members/{self.member_id}/"
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.delete(f"/api/groups/{self.group.id}/chat/clear/").status_code, 403)
        self.client.force_authenticate(self.owner)
        blocked = self.client.patch(member_url, {"is_blocked": True}, format="json")
        self.assertEqual(blocked.status_code, 200, blocked.data)
        self.assertTrue(blocked.data["is_blocked"])
        self.client.force_authenticate(self.member)
        self.assertEqual(
            self.client.post(f"/api/groups/{self.group.id}/chat/", {"text": "Blocked"}, format="json").status_code,
            403,
        )
        self.assertEqual(self.client.get(f"/api/groups/{self.group.id}/chat/").status_code, 200)
        self.client.force_authenticate(self.owner)
        unblocked = self.client.patch(member_url, {"is_blocked": False}, format="json")
        self.assertEqual(unblocked.status_code, 200)
        self.client.force_authenticate(self.member)
        self.assertEqual(
            self.client.post(f"/api/groups/{self.group.id}/chat/", {"text": "Unblocked"}, format="json").status_code,
            201,
        )
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(f"/api/groups/{self.group.id}/chat/clear/").status_code, 204)
        self.assertFalse(ChatMessage.objects.filter(pk=message.data["id"]).exists())

    @patch("groups.views.time.sleep")
    def test_chat_long_poll_returns_new_messages_after_zero_cursor(self, sleep):
        def create_message(_seconds):
            ChatMessage.objects.create(group=self.group, sender=self.owner, text="New message")

        sleep.side_effect = create_message

        response = self.client.get(f"/api/groups/{self.group.id}/chat/?after=0&wait=20")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([message["text"] for message in response.data["results"]], ["New message"])
        sleep.assert_called_once_with(1)

    @patch("groups.views.time.sleep")
    @patch("groups.views.time.monotonic", side_effect=[0, 0, 21])
    def test_chat_long_poll_times_out_with_empty_results_and_caps_wait(self, _monotonic, sleep):
        response = self.client.get(f"/api/groups/{self.group.id}/chat/?after=0&wait=999")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])
        self.assertFalse(response.data["has_more"])
        sleep.assert_called_once_with(1)

    def test_chat_long_poll_rejects_invalid_wait_parameters(self):
        url = f"/api/groups/{self.group.id}/chat/"

        self.assertEqual(self.client.get(f"{url}?after=0&wait=invalid").status_code, 400)
        self.assertEqual(self.client.get(f"{url}?wait=1").status_code, 400)

    @patch("groups.views.time.sleep")
    def test_chat_long_poll_rechecks_membership_while_waiting(self, sleep):
        sleep.side_effect = lambda _seconds: Membership.objects.filter(
            group=self.group,
            user=self.owner,
        ).update(is_active=False)

        response = self.client.get(f"/api/groups/{self.group.id}/chat/?after=0&wait=20")

        self.assertEqual(response.status_code, 404)

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

    def test_generating_new_invite_clears_stale_expired_hashes(self):
        self.client.post(f"/api/groups/{self.group.id}/invite/", {}, format="json")
        self.group.refresh_from_db()
        self.group.invite_expires_at = timezone.now() - timedelta(seconds=1)
        self.group.invite_token_hash = "stale-token"
        self.group.invite_code_hash = "stale-code"
        self.group.save(update_fields=["invite_expires_at", "invite_token_hash", "invite_code_hash"])

        response = self.client.post(f"/api/groups/{self.group.id}/invite/", {}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.group.refresh_from_db()
        self.assertNotEqual(self.group.invite_token_hash, "stale-token")
        self.assertNotEqual(self.group.invite_code_hash, "stale-code")

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
