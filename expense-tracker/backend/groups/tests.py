from typing import Any, Protocol, cast

from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from accounts.models import User
from config.asgi import application
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
        self.client.force_authenticate(self.outsider)
        joined = self.client.post("/api/groups/join/", {"token": invite.data["token"]}, format="json")
        self.assertEqual(joined.status_code, 201)
        self.client.force_authenticate(self.member)
        self.client.post(f"/api/groups/{self.group.id}/chat/", {"text": "Hi there"}, format="json")
        self.client.force_authenticate(self.owner)
        self.client.post(f"/api/groups/{self.group.id}/chat/", {"text": "Hello"}, format="json")
        page = self.client.get(f"/api/groups/{self.group.id}/chat/?limit=1")
        self.assertEqual(len(page.data["results"]), 1)
        self.assertIsNotNone(page.data["next_before"])
        group_data = self.client.get("/api/groups/").data[0]
        self.assertEqual(group_data["unread_count"], 1)
        self.assertEqual(self.client.post(f"/api/groups/{self.group.id}/chat/read/").status_code, 200)

    def test_websocket_ticket_is_one_use_and_delivers_persisted_messages(self):
        ticket = self.client.post(f"/api/groups/{self.group.id}/chat/ticket/", {}, format="json").data["ticket"]

        async def send_and_receive():
            communicator = WebsocketCommunicator(
                application,
                f"/ws/groups/{self.group.id}/chat/?ticket={ticket}",
                headers=[(b"origin", b"http://localhost:5173")],
            )
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.send_json_to({"text": "Live from the group"})
            event = await communicator.receive_json_from()
            await communicator.disconnect()
            return event

        event = async_to_sync(send_and_receive)()
        self.assertEqual(event["type"], "message")
        self.assertEqual(event["message"]["text"], "Live from the group")
        self.assertTrue(ChatMessage.objects.filter(group=self.group, text="Live from the group").exists())

        async def reuse_ticket():
            communicator = WebsocketCommunicator(
                application,
                f"/ws/groups/{self.group.id}/chat/?ticket={ticket}",
                headers=[(b"origin", b"http://localhost:5173")],
            )
            connected, close_code = await communicator.connect()
            if connected:
                await communicator.disconnect()
            return connected, close_code

        connected, close_code = async_to_sync(reuse_ticket)()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4403)
