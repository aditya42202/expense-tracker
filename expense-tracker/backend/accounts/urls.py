from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    LoginView,
    LogoutView,
    ProfileView,
    RegisterView,
    ResendEmailOTPView,
    ResendLoginOTPView,
    VerifyEmailOTPView,
    VerifyLoginOTPView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("verify-otp/", VerifyEmailOTPView.as_view(), name="verify_otp"),
    path("resend-otp/", ResendEmailOTPView.as_view(), name="resend_otp"),
    path("login/", LoginView.as_view(), name="login"),
    path("login/verify-otp/", VerifyLoginOTPView.as_view(), name="login_verify_otp"),
    path("login/resend-otp/", ResendLoginOTPView.as_view(), name="login_resend_otp"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("change-password/", ChangePasswordView.as_view(), name="change_password"),
]
