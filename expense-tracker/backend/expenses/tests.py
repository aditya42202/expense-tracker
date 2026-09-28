from datetime import date
from typing import Any, cast

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from .models import Category, Expense, Income


class ExpenseApiTests(TestCase):
    def setUp(self):
        self.owner = cast(Any, User.objects).create_user(
            email="owner@example.com",
            name="Owner",
            password="StrongPass123",
        )
        self.other_user = cast(Any, User.objects).create_user(
            email="other@example.com",
            name="Other",
            password="StrongPass123",
        )
        self.category, _ = cast(Any, Category.objects).get_or_create(user=self.owner, name="Food", type="EXPENSE")
        self.other_category, _ = cast(Any, Category.objects).get_or_create(user=self.other_user, name="Food", type="EXPENSE")
        self.income_category, _ = cast(Any, Category.objects).get_or_create(user=self.owner, name="Salary", type="INCOME")
        self.client: Any = APIClient()
        self.client.force_authenticate(user=self.owner)

    def test_health_check_is_public(self):
        response: Any = APIClient().get("/api/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_expense_crud_filters_and_owner_isolation(self):
        response: Any = self.client.post(
            "/api/expenses/",
            {
                "category": self.category.id,
                "amount": "18.50",
                "description": "Market vegetables",
                "notes": "Weekly shop",
                "date": "2026-09-10",
                "payment_method": "UPI",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        expense_id = response.json()["id"]

        cast(Any, Expense.objects).create(
            user=self.other_user,
            category=self.other_category,
            amount="250.00",
            description="Private purchase",
            date=date(2026, 9, 11),
        )
        filtered: Any = self.client.get(
            "/api/expenses/",
            {"search": "vegetables", "date_from": "2026-09-01", "category": self.category.id},
        )
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual([row["id"] for row in filtered.json()], [expense_id])
        self.assertEqual(filtered.json()[0]["notes"], "Weekly shop")

        self.assertEqual(self.client.get(f"/api/expenses/{expense_id}/").status_code, 200)
        other_client: Any = APIClient()
        other_client.force_authenticate(user=self.other_user)
        self.assertEqual(other_client.get(f"/api/expenses/{expense_id}/").status_code, 404)

        updated: Any = self.client.patch(f"/api/expenses/{expense_id}/", {"notes": "Updated note"}, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["notes"], "Updated note")
        self.assertEqual(self.client.delete(f"/api/expenses/{expense_id}/").status_code, 204)

    def test_income_crud_and_dashboard_reports_are_user_scoped(self):
        income_response: Any = self.client.post(
            "/api/income/",
            {
                "category": self.income_category.id,
                "amount": "3000.00",
                "description": "Monthly salary",
                "notes": "September payroll",
                "date": "2026-09-01",
                "payment_method": "UPI",
            },
            format="json",
        )
        self.assertEqual(income_response.status_code, 201)
        income_id = income_response.json()["id"]
        expense: Any = cast(Any, Expense.objects).create(
            user=self.owner,
            category=self.category,
            amount="100.00",
            description="Dinner",
            date=date(2026, 9, 12),
        )

        dashboard: Any = self.client.get("/api/dashboard/")
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.json()["expense_count"], 1)
        self.assertEqual(dashboard.json()["income_count"], 1)
        self.assertEqual(dashboard.json()["highest_expenses"][0]["id"], expense.id)
        self.assertEqual(self.client.get("/api/dashboard/monthly/?months=3").status_code, 200)
        category_report: Any = self.client.get("/api/dashboard/categories/?date_from=2026-09-01")
        self.assertEqual(category_report.status_code, 200)
        self.assertEqual(category_report.json()["category_breakdown"][0]["total"], 100)
        income_update: Any = self.client.patch(
            f"/api/income/{income_id}/",
            {"notes": "Updated payroll note"},
            format="json",
        )
        self.assertEqual(income_update.status_code, 200)
        self.assertEqual(income_update.json()["notes"], "Updated payroll note")
        self.assertEqual(self.client.delete(f"/api/income/{income_id}/").status_code, 204)

    def test_invalid_expense_filters_return_validation_error(self):
        response: Any = self.client.get("/api/expenses/?date_from=not-a-date")

        self.assertEqual(response.status_code, 400)
        self.assertIn("date_from", response.json())

    def test_transactions_reject_invalid_amounts_and_foreign_categories(self):
        expense_response: Any = self.client.post(
            "/api/expenses/",
            {
                "category": self.category.id,
                "amount": "0",
                "date": "2026-09-10",
                "payment_method": "Cash",
            },
            format="json",
        )
        income_response: Any = self.client.post(
            "/api/income/",
            {
                "category": self.other_category.id,
                "amount": "10.00",
                "date": "2026-09-10",
                "payment_method": "Cash",
            },
            format="json",
        )

        self.assertEqual(expense_response.status_code, 400)
        self.assertIn("amount", expense_response.json())
        self.assertEqual(income_response.status_code, 400)
        self.assertIn("category", income_response.json())