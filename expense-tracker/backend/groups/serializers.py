from rest_framework import serializers

from .models import ChatMessage, Group, Membership, Settlement


class MembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    name = serializers.CharField(source="user.name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "user_id", "name", "email", "role", "joined_at"]


class GroupSerializer(serializers.ModelSerializer):
    members = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = ["id", "name", "description", "created_by", "created_at", "updated_at", "members", "unread_count"]
        read_only_fields = ["id", "created_by", "created_at", "updated_at", "members", "unread_count"]

    def get_members(self, obj):
        memberships = getattr(obj, "active_memberships", None)
        if memberships is None:
            memberships = obj.memberships.filter(is_active=True).select_related("user")
        return MembershipSerializer(memberships, many=True).data

    def get_unread_count(self, obj):
        if hasattr(obj, "unread_count"):
            return obj.unread_count
        membership = self.context.get("membership")
        if membership is None or membership.last_read_at is None:
            return obj.messages.exclude(sender_id=membership.user_id).count() if membership else 0
        return obj.messages.filter(created_at__gt=membership.last_read_at).exclude(sender_id=membership.user_id).count()


class ChatMessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.IntegerField(read_only=True)
    sender_name = serializers.CharField(source="sender.name", read_only=True)

    class Meta:
        model = ChatMessage
        fields = ["id", "sender_id", "sender_name", "text", "created_at"]


class SettlementSerializer(serializers.ModelSerializer):
    from_member = MembershipSerializer(source="from_membership", read_only=True)
    to_member = MembershipSerializer(source="to_membership", read_only=True)

    class Meta:
        model = Settlement
        fields = ["id", "from_membership", "to_membership", "from_member", "to_member", "amount", "is_settled", "created_at", "settled_at"]
        read_only_fields = ["id", "from_member", "to_member", "is_settled", "created_at", "settled_at"]
