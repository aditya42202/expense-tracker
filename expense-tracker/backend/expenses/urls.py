from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BudgetViewSet,
    CategoryBudgetViewSet,
    CategoryViewSet,
    DashboardViewSet,
    ExpenseViewSet,
    IncomeViewSet,
    GroupExpenseViewSet,
    GroupMemberViewSet,
    NotificationViewSet,
    PersonViewSet,
    ProfileViewSet,
    SavingsGoalViewSet,
    SettlementViewSet,
)

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"people", PersonViewSet, basename="person")
router.register(r"expenses", ExpenseViewSet, basename="expense")
router.register(r"income", IncomeViewSet, basename="income")
router.register(r"budgets", BudgetViewSet, basename="budget")
router.register(r"category-budgets", CategoryBudgetViewSet, basename="category-budget")
router.register(r"goals", SavingsGoalViewSet, basename="goal")
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"dashboard", DashboardViewSet, basename="dashboard")
router.register(r"profile", ProfileViewSet, basename="profile")
router.register(r"group-members", GroupMemberViewSet, basename="group-member")
router.register(r"group-expenses", GroupExpenseViewSet, basename="group-expense")
router.register(r"settlements", SettlementViewSet, basename="settlement")

urlpatterns = [
    path("", include(router.urls)),
]
