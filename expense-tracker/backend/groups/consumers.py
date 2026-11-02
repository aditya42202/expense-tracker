import hashlib
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import transaction
from django.utils import timezone

from .models import ChatMessage, Membership, WebSocketTicket
from .serializers import ChatMessageSerializer


@database_sync_to_async
def consume_ticket(token, group_id):
    digest = hashlib.sha256(token.encode()).hexdigest()
    with transaction.atomic():
        ticket = WebSocketTicket.objects.select_for_update().filter(
            token_hash=digest, group_id=group_id, used_at__isnull=True, expires_at__gt=timezone.now(),
        ).select_related("user").first()
        if ticket is None or not ticket.user.is_active:
            return None
        if not Membership.objects.filter(group_id=group_id, user=ticket.user, is_active=True).exists():
            return None
        if not WebSocketTicket.objects.filter(pk=ticket.pk, used_at__isnull=True).update(used_at=timezone.now()):
            return None
        return ticket.user


@database_sync_to_async
def persist_message(group_id, user, text):
    if not user.is_active or not Membership.objects.filter(group_id=group_id, user=user, is_active=True).exists():
        return None
    message = ChatMessage.objects.create(group_id=group_id, sender=user, text=text)
    return ChatMessageSerializer(message).data


@database_sync_to_async
def has_active_membership(group_id, user):
    return user.is_active and Membership.objects.filter(group_id=group_id, user=user, is_active=True).exists()


class GroupChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        url_route = self.scope.get("url_route")
        route_kwargs = url_route.get("kwargs") if url_route else None
        group_id = route_kwargs.get("group_id") if route_kwargs else None
        if group_id is None:
            await self.close(code=4404)
            return
        self.group_id = int(group_id)
        query = parse_qs(self.scope["query_string"].decode())
        tickets = query.get("ticket", [])
        user = await consume_ticket(tickets[0], self.group_id) if tickets else None
        if user is None:
            await self.close(code=4403)
            return
        self.user = user
        self.channel_group_name = f"group_chat_{self.group_id}"
        await self.channel_layer.group_add(self.channel_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, _close_code):
        del _close_code
        if hasattr(self, "channel_group_name"):
            await self.channel_layer.group_discard(self.channel_group_name, self.channel_name)

    async def receive_json(self, content, **_kwargs):
        del _kwargs
        text = str(content.get("text", "")).strip() if isinstance(content, dict) else ""
        if not text or len(text) > 2000:
            await self.send_json({"type": "error", "message": "Message must contain 1–2000 characters."})
            return
        message = await persist_message(self.group_id, self.user, text)
        if message is None:
            await self.close(code=4403)
            return
        await self.channel_layer.group_send(
            self.channel_group_name, {"type": "chat.message", "message": message},
        )

    async def chat_message(self, event):
        if not await has_active_membership(self.group_id, self.user):
            await self.close(code=4403)
            return
        await self.send_json({"type": "message", "message": event["message"]})
