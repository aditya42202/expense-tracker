from django.conf import settings
from django.db import models


class Category(models.Model):
    CATEGORY_TYPE_CHOICES = [
        ("INCOME", "Income"),
        ("EXPENSE", "Expense"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="categories")
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=20, choices=CATEGORY_TYPE_CHOICES, default="EXPENSE")
    icon = models.CharField(max_length=50, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "name", "type")

    def __str__(self):
        return f"{self.user.email}: {self.name} ({self.type})"


class Person(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="people")
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["name"]

    def __str__(self):
        return self.name


class GroupMember(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="group_members")
    linked_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True, related_name="group_memberships")
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["owner", "name"], name="unique_group_member_name")]

    def __str__(self):
        return self.name


class GroupExpense(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="group_expenses")
    title = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()
    category = models.CharField(max_length=100, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.title} - {self.amount}"


class GroupExpenseParticipant(models.Model):
    expense = models.ForeignKey(GroupExpense, on_delete=models.CASCADE, related_name="participants")
    member = models.ForeignKey(GroupMember, on_delete=models.CASCADE, related_name="expense_participations")
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    share_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["expense", "member"], name="unique_group_expense_member")]


class SettlementTransaction(models.Model):
    STATUS_CHOICES = [("PENDING", "Pending"), ("SETTLED", "Settled")]

    expense = models.ForeignKey(GroupExpense, on_delete=models.CASCADE, related_name="settlement_transactions")
    from_member = models.ForeignKey(GroupMember, on_delete=models.CASCADE, related_name="payments_to_make")
    to_member = models.ForeignKey(GroupMember, on_delete=models.CASCADE, related_name="payments_to_receive")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    settled_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class Expense(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ("Cash", "Cash"),
        ("UPI", "UPI"),
        ("Debit Card", "Debit Card"),
        ("Credit Card", "Credit Card"),
        ("Net Banking", "Net Banking"),
        ("Wallet", "Wallet"),
        ("Other", "Other"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="expenses")
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="expenses")
    person = models.ForeignKey(Person, on_delete=models.SET_NULL, blank=True, null=True, related_name="expenses")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    date = models.DateField()
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES, default="Cash")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email} - {self.category.name} - {self.amount}"


class Income(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ("Cash", "Cash"),
        ("UPI", "UPI"),
        ("Debit Card", "Debit Card"),
        ("Credit Card", "Credit Card"),
        ("Net Banking", "Net Banking"),
        ("Wallet", "Wallet"),
        ("Other", "Other"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="income")
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="income_entries")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    date = models.DateField()
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES, default="Cash")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email} - {self.category.name} - {self.amount}"


class Budget(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budgets")
    month = models.IntegerField()
    year = models.IntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "month", "year")

    def __str__(self):
        return f"{self.user.email} - {self.month}/{self.year} - {self.amount}"


class CategoryBudget(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="category_budgets")
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="category_budgets")
    month = models.IntegerField()
    year = models.IntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        unique_together = ("user", "category", "month", "year")

    def __str__(self):
        return f"{self.user.email} - {self.category.name} - {self.month}/{self.year}"


class SavingsGoal(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="savings_goals")
    name = models.CharField(max_length=200)
    target_amount = models.DecimalField(max_digits=12, decimal_places=2)
    current_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    target_date = models.DateField(blank=True, null=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email} - {self.name}"


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.email} - {self.title}"
