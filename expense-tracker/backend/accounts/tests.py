import re

from django.core import mail
from django.test import TestCase
from django.test.utils import override_settings
from rest_framework.test import APIClient

from accounts.models import User
from expenses.models import Category
from expenses.models import Notification


class AuthFlowTests(TestCase):
    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_registration_creates_default_categories(self):
        client = APIClient()
        payload = {
            "name": "Jane Doe",
            "email": "jane@example.com",
            "password": "StrongPass123",
            "confirm_password": "StrongPass123",
        }

        response = client.post("/api/auth/register/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertGreaterEqual(Category.objects.filter(user__email="jane@example.com").count(), 2)
        user = User.objects.get(email="jane@example.com")
        category_names = set(Category.objects.filter(user=user).values_list("name", flat=True))
        self.assertTrue(
            {
                "Grocery",
                "Vegetables",
                "Fruits",
                "Snacks",
                "Food",
                "Rent",
                "Electricity",
                "Transport",
                "Shopping",
                "Medical",
                "Education",
                "Entertainment",
                "Bills",
                "Other",
                "Salary",
                "Freelancing",
                "Business",
                "Bonus",
                "Other income",
            }.issubset(category_names)
        )
        self.assertFalse(user.is_active)
        self.assertEqual(client.post("/api/auth/login/", {"email": payload["email"], "password": payload["password"]}, format="json").status_code, 400)

        code = re.search(r"\b(\d{6})\b", mail.outbox[0].body).group(1)
        verify_response = client.post(
            "/api/auth/verify-otp/",
            {"email": payload["email"], "otp": code},
            format="json",
        )

        self.assertEqual(verify_response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertEqual(client.post("/api/auth/login/", {"email": payload["email"], "password": payload["password"]}, format="json").status_code, 200)

    def test_new_person_creates_notification_for_authenticated_user(self):
        user = User.objects.create_user(
            email="owner@example.com",
            name="Owner",
            password="StrongPass123",
        )
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post("/api/people/", {"name": "Sam"}, format="json")

        self.assertEqual(response.status_code, 201)
        notification = Notification.objects.get(user=user)
        self.assertEqual(notification.title, "Person added")
        self.assertIn("Sam", notification.message)

    def test_logout_blacklists_refresh_token(self):
        user = User.objects.create_user(
            email="logout@example.com",
            name="Logout User",
            password="StrongPass123",
        )
        client = APIClient()
        login = client.post(
            "/api/auth/login/",
            {"email": user.email, "password": "StrongPass123"},
            format="json",
        )
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['access']}")

        logout = client.post(
            "/api/auth/logout/",
            {"refresh": login.json()["refresh"]},
            format="json",
        )
        refresh = client.post(
            "/api/auth/refresh/",
            {"refresh": login.json()["refresh"]},
            format="json",
        )

        self.assertEqual(login.status_code, 200)
        self.assertEqual(logout.status_code, 200)
        self.assertEqual(refresh.status_code, 401)
