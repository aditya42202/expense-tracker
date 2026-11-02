from django.contrib import admin

from .models import ChatMessage, ExpensePayment, ExpenseShare, Group, Membership, Settlement, SharedExpense

admin.site.register([Group, Membership, SharedExpense, ExpenseShare, ExpensePayment, Settlement, ChatMessage])
