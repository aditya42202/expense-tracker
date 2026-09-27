from django.core.management.base import BaseCommand
from django.core.management.base import CommandError

from accounts.models import User
from expenses.models import Category, Expense, Income


class Command(BaseCommand):
    help = "Seed sample expense tracker data for an existing account"

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="Email address of an account created through signup")

    def handle(self, *args, **options):
        try:
            user = User.objects.get(email__iexact=options["email"])
        except User.DoesNotExist as exc:
            raise CommandError("No account found for that email. Sign up first, then run this command.") from exc

        default_categories = [
            ("Food & Grocery", "Grocery", "EXPENSE", "shopping-bag"),
            ("Food & Grocery", "Vegetables", "EXPENSE", "carrot"),
            ("Food & Grocery", "Milk & Dairy", "EXPENSE", "milk"),
            ("Transport", "Petrol", "EXPENSE", "car"),
            ("Household", "Cleaning", "EXPENSE", "sparkles"),
            ("Bills", "Internet", "EXPENSE", "wifi"),
            ("Income", "Salary", "INCOME", "wallet"),
            ("Income", "Freelancing", "INCOME", "briefcase"),
        ]

        for _, name, ctype, icon in default_categories:
            Category.objects.get_or_create(user=user, name=name, type=ctype, defaults={"icon": icon})

        grocery = Category.objects.get(user=user, name="Grocery", type="EXPENSE")
        vegetables = Category.objects.get(user=user, name="Vegetables", type="EXPENSE")
        petrol = Category.objects.get(user=user, name="Petrol", type="EXPENSE")
        internet = Category.objects.get(user=user, name="Internet", type="EXPENSE")
        salary = Category.objects.get(user=user, name="Salary", type="INCOME")

        Expense.objects.get_or_create(
            user=user,
            category=grocery,
            amount=250,
            description="Weekly grocery shopping",
            date="2026-09-27",
            payment_method="UPI",
        )
        Expense.objects.get_or_create(
            user=user,
            category=vegetables,
            amount=120,
            description="Potato and onion",
            date="2026-09-27",
            payment_method="UPI",
        )
        Expense.objects.get_or_create(
            user=user,
            category=petrol,
            amount=300,
            description="Fuel refill",
            date="2026-09-26",
            payment_method="Debit Card",
        )
        Expense.objects.get_or_create(
            user=user,
            category=internet,
            amount=699,
            description="Monthly internet bill",
            date="2026-09-20",
            payment_method="Net Banking",
        )

        Income.objects.get_or_create(
            user=user,
            category=salary,
            amount=28000,
            description="Monthly salary",
            date="2026-09-01",
            payment_method="Bank Transfer",
        )

        self.stdout.write(self.style.SUCCESS(f"Seeded sample data for {user.email}"))
