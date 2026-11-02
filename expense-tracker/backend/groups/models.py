from __future__ import annotations

from django.conf import settings
from django.db import models


class Group(models.Model):
    id: int
    memberships: models.Manager
    expenses: models.Manager
    settlements: models.Manager
    messages: models.Manager

    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_groups")
    invite_token_hash = models.CharField(max_length=64, blank=True)
    invite_code_hash = models.CharField(max_length=64, null=True, blank=True, unique=True)
    invite_expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]


class Membership(models.Model):
    id: int

    ROLE_CHOICES = [("admin", "Admin"), ("member", "Member")]

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="new_group_memberships")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="member")
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["joined_at", "id"]
        constraints = [models.UniqueConstraint(fields=["group", "user"], name="groups_unique_membership")]


class SharedExpense(models.Model):
    id: int
    shares: models.Manager
    payments: models.Manager

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="expenses")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="shared_expenses_created")
    title = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()
    category = models.CharField(max_length=100, blank=True)
    split_type = models.CharField(max_length=12, choices=[("equal", "Equal"), ("custom", "Custom"), ("percentage", "Percentage")])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [models.Index(fields=["group", "date"], name="groups_group_date_idx")]


class ExpenseShare(models.Model):
    id: int
    membership_id: int

    expense = models.ForeignKey(SharedExpense, on_delete=models.CASCADE, related_name="shares")
    membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="shares")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    percentage = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["expense", "membership"], name="groups_unique_expense_share")]


class ExpensePayment(models.Model):
    id: int
    membership_id: int

    expense = models.ForeignKey(SharedExpense, on_delete=models.CASCADE, related_name="payments")
    membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["expense", "membership"], name="groups_unique_expense_payment")]


class Settlement(models.Model):
    id: int
    from_membership_id: int
    to_membership_id: int

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="settlements")
    from_membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="sent_settlements")
    to_membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="received_settlements")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    is_settled = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="group_settlements_created")
    created_at = models.DateTimeField(auto_now_add=True)
    settled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["group", "is_settled"], name="groups_settled_status_idx")]


class ChatMessage(models.Model):
    id: int

    MESSAGE_TYPE_CHOICES = [
        ("TEXT", "Text"),
        ("EXPENSE", "Expense"),
        ("SETTLEMENT", "Settlement"),
        ("SYSTEM", "System"),
    ]

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="group_messages")
    text = models.CharField(max_length=2000, blank=True)
    message_type = models.CharField(max_length=12, choices=MESSAGE_TYPE_CHOICES, default="TEXT")
    expense = models.ForeignKey(
        SharedExpense, on_delete=models.SET_NULL, null=True, blank=True, related_name="chat_messages",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["group", "expense", "message_type"],
                condition=models.Q(message_type="EXPENSE"),
                name="groups_unique_shared_expense_message",
            ),
        ]


class WebSocketTicket(models.Model):
    id: int

    token_hash = models.CharField(max_length=64, unique=True)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="websocket_tickets")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="group_websocket_tickets")
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["expires_at", "used_at"], name="groups_ticket_expiry_idx")]
