from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers

from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "name", "email", "group", "password", "confirm_password"]

    def validate(self, attrs):
        password = attrs.get("password")
        confirm_password = attrs.get("confirm_password")

        if password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        try:
            password_validation.validate_password(
                password,
                user=User(name=attrs.get("name", ""), email=attrs.get("email", "")),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages})

        email = attrs.get("email")
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({"email": "A user with this email already exists."})

        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        password = validated_data.pop("password")
        email = validated_data["email"]
        try:
            with transaction.atomic():
                return User.objects.create_user(password=password, is_active=False, **validated_data)
        except IntegrityError:
            if User.objects.filter(email__iexact=email).exists():
                raise serializers.ValidationError({"email": "A user with this email already exists."})
            raise


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = (attrs.get("email") or "").strip()
        if not email:
            raise serializers.ValidationError({"email": "Email is required."})

        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.check_password(attrs["password"]):
            raise serializers.ValidationError({"non_field_errors": ["Invalid email or password."]})

        if not user.is_active:
            raise serializers.ValidationError({"non_field_errors": ["This account is inactive."]})

        return {"user": user}


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "name", "email", "group", "profile_image", "created_at", "updated_at"]
        read_only_fields = ["id", "email", "created_at", "updated_at"]


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=8)
    confirm_password = serializers.CharField(required=True)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Current password is incorrect."})

        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        try:
            password_validation.validate_password(attrs["new_password"], user=user)
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages})

        return attrs
