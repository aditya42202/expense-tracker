import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone

from .models import EmailOTP, User
from .serializers import ChangePasswordSerializer, LoginSerializer, RegisterSerializer, UserProfileSerializer


def _send_email_otp(user, purpose="registration"):
    code = f"{secrets.randbelow(1_000_000):06d}"
    otp, _ = EmailOTP.objects.update_or_create(
        user=user,
        defaults={
            "code_hash": make_password(code),
            "expires_at": timezone.now() + timedelta(minutes=10),
            "attempts": 0,
            "purpose": purpose,
        },
    )
    try:
        send_mail(
            subject="Your Pennywise login code" if purpose == "login" else "Your Pennywise verification code",
            message=f"Your {'login' if purpose == 'login' else 'verification'} code is {code}. It expires in 10 minutes.",
            from_email=None,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:
        otp.delete()
        raise


def _validate_email_otp(user, code, purpose):
    otp = EmailOTP.objects.filter(user=user, purpose=purpose).first()
    if not otp:
        return Response({"detail": "The code is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
    if otp.expires_at <= timezone.now():
        otp.delete()
        return Response({"detail": "The code is invalid or expired. Request a new code."}, status=status.HTTP_400_BAD_REQUEST)
    if otp.attempts >= 5:
        return Response({"detail": "Too many attempts. Request a new verification code."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    if not check_password(code, otp.code_hash):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        return Response({"detail": "The code is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
    otp.delete()
    return None


def _token_response(user):
    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "user": UserProfileSerializer(user).data,
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        },
        status=status.HTTP_200_OK,
    )


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            try:
                _send_email_otp(user)
                message = "A verification code has been sent to your email."
            except Exception:
                message = "Account created, but the verification email could not be sent. Please try resending the code."
            return Response({"message": message, "email": user.email}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class VerifyEmailOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        code = str(request.data.get("otp") or "").strip()
        if not email or len(code) != 6 or not code.isdigit():
            return Response({"detail": "Enter the six-digit verification code."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email, is_active=False).first()
        if not user:
            return Response({"detail": "The code is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
        error = _validate_email_otp(user, code, "registration")
        if error:
            return error

        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response({"message": "Email verified successfully. You can now log in."})


class ResendEmailOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        user = User.objects.filter(email__iexact=email, is_active=False).first() if email else None
        if user:
            previous_otp = EmailOTP.objects.filter(user=user, purpose="registration").first()
            can_resend = not previous_otp or previous_otp.created_at <= timezone.now() - timedelta(seconds=60)
            if can_resend:
                try:
                    _send_email_otp(user, purpose="registration")
                except Exception:
                    pass
        return Response({"message": "If the account is awaiting verification, a new code has been sent."})


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data["user"]
            otp = EmailOTP.objects.filter(user=user, purpose="login").first()
            can_send = not otp or otp.created_at <= timezone.now() - timedelta(seconds=60)
            if can_send:
                try:
                    _send_email_otp(user, purpose="login")
                except Exception:
                    return Response(
                        {"detail": "Unable to send the login code. Please try again."},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE,
                    )
            return Response(
                {"message": "A login code has been sent to your email.", "email": user.email},
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class VerifyLoginOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        code = str(request.data.get("otp") or "").strip()
        if not email or len(code) != 6 or not code.isdigit():
            return Response({"detail": "Enter the six-digit login code."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return Response({"detail": "The code is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
        error = _validate_email_otp(user, code, "login")
        if error:
            return error
        return _token_response(user)


class ResendLoginOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        user = User.objects.filter(email__iexact=email, is_active=True).first() if email else None
        otp = EmailOTP.objects.filter(user=user, purpose="login").first() if user else None
        can_resend = otp and otp.created_at <= timezone.now() - timedelta(seconds=60)
        if can_resend:
            try:
                _send_email_otp(user, purpose="login")
            except Exception:
                pass
        return Response({"message": "If a login is pending, a new code will be sent when available."})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"message": "Logged out successfully."}, status=status.HTTP_200_OK)
        except Exception:
            return Response({"error": "Invalid refresh token."}, status=status.HTTP_400_BAD_REQUEST)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)

    def put(self, request):
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            request.user.set_password(serializer.validated_data["new_password"])
            request.user.save()
            return Response({"message": "Password changed successfully."})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
