from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Category


DEFAULT_CATEGORIES = [
    ("Grocery", "EXPENSE", "shopping-bag"),
    ("Vegetables", "EXPENSE", "carrot"),
    ("Milk & Dairy", "EXPENSE", "milk"),
    ("Petrol", "EXPENSE", "car"),
    ("Cleaning", "EXPENSE", "sparkles"),
    ("Internet", "EXPENSE", "wifi"),
    ("Salary", "INCOME", "wallet"),
    ("Freelancing", "INCOME", "briefcase"),
]


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_default_categories(sender, instance, created, **kwargs):
    if created:
        Category.objects.bulk_create(
            [
                Category(user=instance, name=name, type=category_type, icon=icon)
                for name, category_type, icon in DEFAULT_CATEGORIES
            ]
        )