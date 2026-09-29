from django.core import mail
from django.test import TestCase
from django.test.utils import override_settings
from rest_framework.test import APIClient

from accounts.models import User
from expenses.models import Category
from expenses.models import Notification


class AuthFlowTests(TestCase):
    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_registration_creates_active_user_without_otp(self):
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
        self.assertTrue(user.check_password(payload["password"]))
        self.assertNotEqual(user.password, payload["password"])
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
        self.assertTrue(user.is_active)
        self.assertEqual(mail.outbox, [])
        login_response = client.post(
            "/api/auth/login/",
            {"email": payload["email"], "password": payload["password"]},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertIn("access", login_response.json())
        self.assertIn("refresh", login_response.json())
        self.assertEqual(mail.outbox, [])

    def test_registration_rejects_invalid_inputs_and_duplicate_emails(self):
        User.objects.create_user(
            email="existing@example.com",
            name="Existing User",
            password="StrongPass123",
        )
        base_payload = {
            "name": "Jane Doe",
            "email": "jane@example.com",
            "group": "Personal",
            "password": "StrongPass123",
            "confirm_password": "StrongPass123",
        }
        cases = [
            ("duplicate email", {**base_payload, "email": "Existing@Example.com"}, "email"),
            ("invalid email", {**base_payload, "email": "not-an-email"}, "email"),
            ("weak password", {**base_payload, "password": "password", "confirm_password": "password"}, "password"),
            ("password mismatch", {**base_payload, "confirm_password": "DifferentPass123"}, "confirm_password"),
            ("missing fields", {}, None),
        ]
        client = APIClient()

        for case, payload, expected_field in cases:
            with self.subTest(case=case):
                response = client.post("/api/auth/register/", payload, format="json")
                self.assertEqual(response.status_code, 400)
                if expected_field:
                    self.assertIn(expected_field, response.json())
                else:
                    self.assertTrue({"name", "email", "password", "confirm_password"}.issubset(response.json()))

        self.assertEqual(User.objects.count(), 1)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_login_returns_tokens_without_sending_otp(self):
        user = User.objects.create_user(
            email="two-step@example.com",
            name="Two Step User",
            password="StrongPass123",
        )
        client = APIClient()

        login = client.post(
            "/api/auth/login/",
            {"email": user.email, "password": "StrongPass123"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertIn("access", login.json())
        self.assertIn("refresh", login.json())
        self.assertEqual(mail.outbox, [])

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

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
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
