from django.urls import path

from .ai_views import GroupAIInsightsView
from .views import (
    GroupBalancesView,
    GroupChatReadView,
    GroupChatClearView,
    GroupChatMessageActionView,
    GroupChatReactionView,
    GroupChatView,
    GroupDetailView,
    GroupExpenseDetailView,
    GroupExpensesView,
    GroupInviteView,
    GroupMembersView,
    GroupSettlementDetailView,
    GroupSettlementsView,
    GroupsView,
    JoinGroupView,
)

urlpatterns = [
    path("groups/", GroupsView.as_view(), name="group-list-create"),
    path("groups/join/", JoinGroupView.as_view(), name="group-join"),
    path("groups/<int:group_id>/", GroupDetailView.as_view(), name="group-detail"),
    path("groups/<int:group_id>/members/", GroupMembersView.as_view(), name="group-members"),
    path("groups/<int:group_id>/members/<int:membership_id>/", GroupMembersView.as_view(), name="group-member-detail"),
    path("groups/<int:group_id>/invite/", GroupInviteView.as_view(), name="group-invite"),
    path("groups/<int:group_id>/expenses/", GroupExpensesView.as_view(), name="group-expenses"),
    path("groups/<int:group_id>/expenses/<int:expense_id>/", GroupExpenseDetailView.as_view(), name="group-expense-detail"),
    path("groups/<int:group_id>/balances/", GroupBalancesView.as_view(), name="group-balances"),
    path("groups/<int:group_id>/settlements/", GroupSettlementsView.as_view(), name="group-settlements"),
    path("groups/<int:group_id>/settlements/<int:settlement_id>/settle/", GroupSettlementDetailView.as_view(), name="group-settlement-settle"),
    path("groups/<int:group_id>/chat/", GroupChatView.as_view(), name="group-chat"),
    path("groups/<int:group_id>/chat/clear/", GroupChatClearView.as_view(), name="group-chat-clear"),
    path("groups/<int:group_id>/chat/<int:message_id>/delete/", GroupChatMessageActionView.as_view(), name="group-chat-message-delete"),
    path("groups/<int:group_id>/chat/<int:message_id>/reaction/", GroupChatReactionView.as_view(), name="group-chat-message-reaction"),
    path("groups/<int:group_id>/chat/read/", GroupChatReadView.as_view(), name="group-chat-read"),
    path("groups/<int:group_id>/ai-insights/", GroupAIInsightsView.as_view(), name="group-ai-insights"),
]
