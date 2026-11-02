import calendar
from datetime import date
from datetime import timedelta
from decimal import Decimal
from typing import Any, cast
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from .models import (
    Budget,
    AIInsight,
    Category,
    Expense,
    ExpenseSubmission,
    GroupExpense,
    GroupExpenseParticipant,
    GroupMember,
    Income,
    SavingsContribution,
    SavingsGoal,
    SettlementTransaction,
)


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
                "merchant_name": "Fresh Mart",
                "notes": "Weekly shop",
                "date": "2026-09-10",
                "payment_method": "UPI",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        expense_id = response.json()["id"]
        self.assertEqual(response.json()["merchant_name"], "Fresh Mart")

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

    def test_expense_idempotency_key_prevents_duplicate_submissions(self):
        payload = {
            "category": self.category.id,
            "amount": "18.50",
            "description": "Market vegetables",
            "date": "2026-09-10",
            "payment_method": "UPI",
        }
        first = self.client.post(
            "/api/expenses/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="expense-submit-1",
        )
        retry = self.client.post(
            "/api/expenses/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="expense-submit-1",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json()["id"], first.json()["id"])
        self.assertEqual(Expense.objects.filter(user=self.owner).count(), 1)
        self.assertEqual(ExpenseSubmission.objects.filter(user=self.owner).count(), 1)
        self.assertEqual(self.owner.notifications.filter(title="Expense added").count(), 1)

        payload["amount"] = "19.50"
        mismatch = self.client.post(
            "/api/expenses/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="expense-submit-1",
        )
        self.assertEqual(mismatch.status_code, 409)

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
        reports: Any = self.client.get("/api/dashboard/reports/")
        self.assertEqual(reports.status_code, 200)
        self.assertEqual(reports.json()["income_count"], 1)
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

    def test_monthly_budget_remaining_updates_when_current_month_expense_is_added(self):
        today = timezone.localdate()
        Budget.objects.create(user=self.owner, month=today.month, year=today.year, amount="1000.00")

        Expense.objects.create(
            user=self.owner,
            category=self.category,
            amount="125.50",
            description="First expense",
            date=today,
        )
        first_summary: Any = self.client.get("/api/dashboard/")
        self.assertEqual(first_summary.status_code, 200)
        self.assertEqual(first_summary.json()["monthly_budget"], 1000)
        self.assertEqual(first_summary.json()["current_month_expense"], 125.5)
        self.assertEqual(first_summary.json()["budget_remaining"], 874.5)

        Expense.objects.create(
            user=self.owner,
            category=self.category,
            amount="74.50",
            description="Second expense",
            date=today,
        )
        updated_summary: Any = self.client.get("/api/dashboard/")
        self.assertEqual(updated_summary.json()["current_month_expense"], 200)
        self.assertEqual(updated_summary.json()["budget_remaining"], 800)

    def test_dashboard_returns_data_derived_health_and_expense_forecast(self):
        today = timezone.localdate()
        Budget.objects.create(user=self.owner, month=today.month, year=today.year, amount="1000.00")
        Income.objects.create(
            user=self.owner,
            category=self.income_category,
            amount="2000.00",
            description="Salary",
            date=today,
        )
        Expense.objects.create(
            user=self.owner,
            category=self.category,
            amount="400.00",
            description="Groceries",
            date=today,
        )
        previous_month_day = today.replace(day=1) - timedelta(days=1)
        Expense.objects.create(
            user=self.owner,
            category=self.category,
            amount="20000.00",
            description="Previous month groceries",
            date=previous_month_day,
        )

        response: Any = self.client.get("/api/dashboard/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["savings_rate"], 80.0)
        self.assertIsNotNone(data["financial_health"]["score"])
        self.assertEqual(data["financial_health"]["category"], "Excellent")
        self.assertIsNone(next(factor for factor in data["financial_health"]["factors"] if factor["key"] == "debt_management")["earned_points"])
        self.assertEqual(data["expense_forecast"]["month_to_date"], 400)
        self.assertTrue(data["expense_forecast"]["is_estimate"])
        self.assertEqual(data["expense_forecast"]["highest_spending_category"], "Food")

    def test_savings_goal_contributions_are_user_scoped_and_do_not_create_transactions(self):
        today = timezone.localdate()
        target_month_index = today.month - 1 + 6
        target_year = today.year + target_month_index // 12
        target_month = target_month_index % 12 + 1
        target_day = min(today.day, calendar.monthrange(target_year, target_month)[1])
        target_date = date(target_year, target_month, target_day)
        response: Any = self.client.post(
            "/api/goals/",
            {
                "name": "Laptop",
                "target_amount": "60000.00",
                "current_amount": "15000.00",
                "target_date": target_date.isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        goal_id = response.json()["id"]
        self.assertEqual(response.json()["remaining_amount"], 45000)
        self.assertEqual(response.json()["required_monthly_savings"], 7500)

        contribution: Any = self.client.post(f"/api/goals/{goal_id}/add-money/", {"amount": "45000.00"}, format="json")
        self.assertEqual(contribution.status_code, 200)
        self.assertEqual(contribution.json()["current_amount"], "60000.00")
        self.assertTrue(contribution.json()["is_completed"])
        self.assertEqual(SavingsContribution.objects.filter(goal_id=goal_id).count(), 1)
        self.assertEqual(Expense.objects.filter(user=self.owner).count(), 0)
        self.assertEqual(Income.objects.filter(user=self.owner).count(), 0)

        other_client: Any = APIClient()
        other_client.force_authenticate(user=self.other_user)
        self.assertEqual(other_client.get(f"/api/goals/{goal_id}/").status_code, 404)

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

    def test_combined_settlement_offsets_expenses_and_already_paid_transfers(self):
        members = {
            name: cast(Any, GroupMember.objects).create(owner=self.owner, name=name)
            for name in ("Alice", "Bob", "Carol")
        }
        first_expense = cast(Any, GroupExpense.objects).create(
            owner=self.owner,
            title="First trip",
            amount="100.00",
            date=date(2026, 9, 10),
        )
        second_expense = cast(Any, GroupExpense.objects).create(
            owner=self.owner,
            title="Second trip",
            amount="100.00",
            date=date(2026, 9, 11),
        )
        cast(Any, GroupExpenseParticipant.objects).bulk_create([
            GroupExpenseParticipant(expense=first_expense, member=members["Alice"], paid_amount="100.00", share_amount="50.00"),
            GroupExpenseParticipant(expense=first_expense, member=members["Bob"], paid_amount="0.00", share_amount="50.00"),
            GroupExpenseParticipant(expense=second_expense, member=members["Bob"], paid_amount="100.00", share_amount="50.00"),
            GroupExpenseParticipant(expense=second_expense, member=members["Carol"], paid_amount="0.00", share_amount="50.00"),
        ])
        cast(Any, SettlementTransaction.objects).create(
            expense=first_expense,
            from_member=members["Bob"],
            to_member=members["Alice"],
            amount="20.00",
            status="SETTLED",
            settled_at=timezone.now(),
        )

        response: Any = self.client.get("/api/settlements/combined/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(str(response.json()["total_group_expenses"])), Decimal("200.00"))
        self.assertEqual(
            [
                (transfer["from_name"], transfer["to_name"], Decimal(str(transfer["amount"])))
                for transfer in response.json()["transfers"]
            ],
            [("Carol", "Alice", Decimal("30.00")), ("Carol", "Bob", Decimal("20.00"))],
        )

    @patch("expenses.ai_views._request_ai", return_value="Your recorded category totals are available.")
    def test_ai_insights_require_consent_and_store_only_generated_output(self, request_ai):
        Expense.objects.create(
            user=self.owner,
            category=self.category,
            amount="12.00",
            description="Owner grocery",
            date=date(2026, 9, 10),
        )
        Expense.objects.create(
            user=self.other_user,
            category=self.other_category,
            amount="999.00",
            description="Other private expense",
            date=date(2026, 9, 10),
        )
        denied = self.client.post("/api/ai/insights/", {"consent": False}, format="json")
        self.assertEqual(denied.status_code, 400)
        request_ai.assert_not_called()

        response = self.client.post("/api/ai/insights/", {"consent": True}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["content"], "Your recorded category totals are available.")
        self.assertEqual(AIInsight.objects.filter(user=self.owner, feature="insights").count(), 1)
        recent_expenses = request_ai.call_args.args[1]["financial_data"]["recent_expenses"]
        self.assertEqual([expense["description"] for expense in recent_expenses], ["Owner grocery"])

    @patch.dict("os.environ", {"OPENAI_API_KEY": ""})
    def test_ai_endpoint_reports_missing_provider_configuration(self):
        status_response = self.client.get("/api/ai/status/")
        response = self.client.post("/api/ai/report/", {"consent": True}, format="json")

        self.assertEqual(status_response.status_code, 200)
        self.assertFalse(status_response.json()["configured"])
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "ai_not_configured")

    @patch("expenses.ai_views._request_ai", return_value="Food")
    def test_ai_categorization_is_restricted_to_account_categories(self, request_ai):
        response = self.client.post(
            "/api/ai/categorize/",
            {"description": "Groceries", "consent": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["content"], "Food")
        request_ai.assert_called_once()
        self.assertEqual(request_ai.call_args.args[1]["merchant_name"], "")

    @patch("expenses.ai_views._request_ai", return_value="A category that does not exist")
    def test_ai_categorization_rejects_unavailable_categories(self, request_ai):
        response = self.client.post(
            "/api/ai/categorize/",
            {"description": "Groceries", "consent": True},
            format="json",
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["code"], "ai_invalid_response")
        self.assertFalse(AIInsight.objects.filter(user=self.owner, feature="categorization").exists())