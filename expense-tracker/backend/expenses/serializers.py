from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from .models import (
    Budget, Category, CategoryBudget, Expense, GroupExpense, GroupExpenseParticipant, GroupMember,
    Income, Notification, Person, SavingsGoal, SettlementTransaction,
)
from .settlement import calculate_settlement, money


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "name", "email", "profile_image", "created_at"]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "type", "icon", "created_at"]


class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = ["id", "name", "created_at"]
        read_only_fields = ["id", "created_at"]


class GroupMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupMember
        fields = ["id", "name", "is_active", "linked_user", "created_at"]
        read_only_fields = ["id", "created_at", "linked_user"]


class GroupExpenseSerializer(serializers.ModelSerializer):
    participants = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=True)
    payers = serializers.ListField(child=serializers.DictField(), write_only=True, required=True)
    participant_details = serializers.SerializerMethodField(read_only=True)
    settlements = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = GroupExpense
        fields = ["id", "title", "amount", "date", "category", "participants", "payers", "participant_details", "settlements", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        owner = self.context["request"].user
        participant_ids = list(dict.fromkeys(attrs.pop("participants")))
        participant_id_set = set(participant_ids)
        payer_data = attrs.pop("payers")
        members = {member.id: member for member in GroupMember.objects.filter(owner=owner, is_active=True)}
        if not participant_ids:
            raise serializers.ValidationError({"participants": "Select at least one participant."})
        if not participant_id_set.issubset(members):
            raise serializers.ValidationError({"participants": "Participants must belong to your group."})
        if not payer_data:
            raise serializers.ValidationError({"payers": "At least one payer is required."})
        paid_by_member = {}
        for payer in payer_data:
            try:
                member_id = int(payer["member"])
                paid_amount = money(payer["amount"])
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError({"payers": "Each payer needs a member and amount."})
            if member_id not in participant_id_set or paid_amount < 0:
                raise serializers.ValidationError({"payers": "Payers must be selected participants with non-negative amounts."})
            paid_by_member[member_id] = paid_by_member.get(member_id, Decimal("0")) + paid_amount
        if money(sum(paid_by_member.values(), Decimal("0"))) != money(attrs["amount"]):
            raise serializers.ValidationError({"payers": "Total paid amounts must equal the expense amount."})
        attrs["_participant_ids"] = participant_ids
        attrs["_paid_by_member"] = paid_by_member
        return attrs

    def create(self, validated_data):
        participant_ids = validated_data.pop("_participant_ids")
        paid_by_member = validated_data.pop("_paid_by_member")
        expense = GroupExpense.objects.create(owner=self.context["request"].user, **validated_data)
        participant_rows = [{"name": GroupMember.objects.get(id=member_id).name, "paid_amount": paid_by_member.get(member_id, 0)} for member_id in participant_ids]
        calculated, _ = calculate_settlement(expense.amount, participant_rows)
        shares = {row["name"]: row["share_amount"] for row in calculated}
        GroupExpenseParticipant.objects.bulk_create([
            GroupExpenseParticipant(expense=expense, member_id=member_id, paid_amount=paid_by_member.get(member_id, 0), share_amount=shares[GroupMember.objects.get(id=member_id).name])
            for member_id in participant_ids
        ])
        self._create_transactions(expense, calculated)
        return expense

    def update(self, instance, validated_data):
        participant_ids = validated_data.pop("_participant_ids")
        paid_by_member = validated_data.pop("_paid_by_member")
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        instance.participants.all().delete()
        participant_rows = [{"name": GroupMember.objects.get(id=member_id).name, "paid_amount": paid_by_member.get(member_id, 0)} for member_id in participant_ids]
        calculated, _ = calculate_settlement(instance.amount, participant_rows)
        shares = {row["name"]: row["share_amount"] for row in calculated}
        GroupExpenseParticipant.objects.bulk_create([
            GroupExpenseParticipant(expense=instance, member_id=member_id, paid_amount=paid_by_member.get(member_id, 0), share_amount=shares[GroupMember.objects.get(id=member_id).name])
            for member_id in participant_ids
        ])
        self._create_transactions(instance, calculated)
        return instance

    def _create_transactions(self, expense, calculated):
        from .models import SettlementTransaction
        SettlementTransaction.objects.filter(expense=expense).delete()
        _, transfers = calculate_settlement(expense.amount, calculated)
        members = {member.name: member for member in GroupMember.objects.filter(owner=expense.owner)}
        SettlementTransaction.objects.bulk_create([
            SettlementTransaction(expense=expense, from_member=members[item["from"]], to_member=members[item["to"]], amount=item["amount"])
            for item in transfers
        ])

    def get_participant_details(self, obj):
        return [{"id": row.member_id, "name": row.member.name, "paid": row.paid_amount, "share": row.share_amount, "net": money(row.paid_amount - row.share_amount), "status": "receive" if row.paid_amount > row.share_amount else "pay" if row.paid_amount < row.share_amount else "settled"} for row in obj.participants.select_related("member").all()]

    def get_settlements(self, obj):
        return [{"id": item.id, "from": item.from_member.name, "to": item.to_member.name, "amount": item.amount, "status": item.status} for item in obj.settlement_transactions.select_related("from_member", "to_member").all()]


class SettlementTransactionSerializer(serializers.ModelSerializer):
    from_name = serializers.CharField(source="from_member.name", read_only=True)
    to_name = serializers.CharField(source="to_member.name", read_only=True)
    expense_name = serializers.CharField(source="expense.title", read_only=True)
    date = serializers.DateField(source="expense.date", read_only=True)

    class Meta:
        model = SettlementTransaction
        fields = ["id", "expense", "expense_name", "date", "from_member", "from_name", "to_member", "to_name", "amount", "status", "settled_at"]
        read_only_fields = ["id", "expense", "expense_name", "date", "from_member", "from_name", "to_member", "to_name", "amount", "settled_at"]


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    person_name = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = [
            "id",
            "user",
            "category",
            "category_name",
            "person",
            "person_name",
            "user_name",
            "amount",
            "description",
            "date",
            "payment_method",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]

    def get_category_name(self, obj):
        return obj.category.name

    def get_person_name(self, obj):
        return obj.person.name if obj.person else None

    def get_user_name(self, obj):
        return obj.user.name

    def validate_category(self, value):
        if value.user_id != self.context["request"].user.id:
            raise serializers.ValidationError("Choose one of your own categories.")
        return value

    def validate_person(self, value):
        if value and value.user_id != self.context["request"].user.id:
            raise serializers.ValidationError("Choose one of your own people.")
        return value


class IncomeSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()

    class Meta:
        model = Income
        fields = [
            "id",
            "user",
            "category",
            "category_name",
            "amount",
            "description",
            "date",
            "payment_method",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]

    def get_category_name(self, obj):
        return obj.category.name


class BudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Budget
        fields = ["id", "month", "year", "amount", "created_at", "updated_at"]
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class CategoryBudgetSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()

    class Meta:
        model = CategoryBudget
        fields = ["id", "category", "category_name", "month", "year", "amount"]
        read_only_fields = ["id", "user"]

    def get_category_name(self, obj):
        return obj.category.name


class SavingsGoalSerializer(serializers.ModelSerializer):
    progress = serializers.SerializerMethodField()

    class Meta:
        model = SavingsGoal
        fields = ["id", "name", "target_amount", "current_amount", "target_date", "description", "progress", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_progress(self, obj):
        if obj.target_amount == 0:
            return 0
        return round((float(obj.current_amount) / float(obj.target_amount)) * 100, 2)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "message", "is_read", "created_at"]
        read_only_fields = ["id", "created_at"]
