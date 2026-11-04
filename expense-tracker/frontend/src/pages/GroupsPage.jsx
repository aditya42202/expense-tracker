import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, MessageCircle, Plus, ReceiptText, RefreshCw, Send, Share2, Sparkles, Users, Wallet } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const today = new Date().toISOString().slice(0, 10);
const emptyExpense = () => ({ title: '', amount: '', date: today, category: '', split_type: 'equal' });
const mergeMessages = (current, incoming) => {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messagesById.set(message.id, message));
  return [...messagesById.values()].sort((left, right) => left.id - right.id);
};
const displayError = (error, fallback) => {
  const status = error.response?.status;
  const statusMessages = {
    401: 'Your session has expired. Please sign in again.',
    403: 'You do not have permission to perform this action.',
    404: 'This group or invitation could not be found.',
    500: 'The server could not complete this request. Please try again later.',
  };
  if (statusMessages[status]) return statusMessages[status];
  if (!error.response) return 'Unable to reach the server. Check your internet connection and try again.';
  const payload = error.response.data;
  const details = payload && typeof payload === 'object'
    ? Object.values(payload).flat(Infinity).find((value) => typeof value === 'string')
    : null;
  return details && !details.includes('Traceback') ? details : fallback;
};

export default function GroupsPage() {
  const { user } = useAuth();
  const { code: inviteCodePath } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || '';
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [expenseForm, setExpenseForm] = useState(emptyExpense());
  const [customShares, setCustomShares] = useState({});
  const [percentageShares, setPercentageShares] = useState({});
  const [payerAmounts, setPayerAmounts] = useState({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [invite, setInvite] = useState({ groupId: '', code: '', url: '', expiresAt: '' });
  const [joinToken, setJoinToken] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState({ balances: [], suggested_transfers: [] });
  const [settlements, setSettlements] = useState([]);
  const [messages, setMessages] = useState([]);
  const [aiConsentGroupId, setAiConsentGroupId] = useState('');
  const [aiInsight, setAiInsight] = useState({ groupId: '', content: '' });
  const [aiLoading, setAiLoading] = useState(false);
  const [sharePreview, setSharePreview] = useState('');
  const [chatExpenseDetails, setChatExpenseDetails] = useState(null);
  const [olderBefore, setOlderBefore] = useState(null);
  const [messageDraft, setMessageDraft] = useState({ groupId: '', text: '' });
  const [chatRefreshingGroupId, setChatRefreshingGroupId] = useState('');
  const [chatLoading, setChatLoading] = useState(true);
  const [chatSendingGroupId, setChatSendingGroupId] = useState('');
  const [olderLoadingGroupId, setOlderLoadingGroupId] = useState('');
  const [chatMessagesGroupId, setChatMessagesGroupId] = useState('');
  const [chatErrorState, setChatErrorState] = useState({ groupId: '', message: '' });
  const [groupsRetryKey, setGroupsRetryKey] = useState(0);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupsError, setGroupsError] = useState('');
  const [notice, setNotice] = useState('');
  const chatEndRef = useRef(null);
  const chatRequestRef = useRef(null);
  const groupIdRef = useRef(groupId);
  const inviteRequestsRef = useRef(new Map());
  const selectedGroup = useMemo(() => groups.find((group) => String(group.id) === String(groupId)), [groups, groupId]);
  const members = selectedGroup?.members || [];
  const myMembership = members.find((member) => member.user_id === user?.id);
  const money = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR' }), []);
  const joiningInvite = Boolean(inviteCodePath || inviteToken);
  const messageText = messageDraft.groupId === String(groupId) ? messageDraft.text : '';
  const chatRefreshing = chatRefreshingGroupId === String(groupId);
  const chatSending = chatSendingGroupId === String(groupId);
  const olderLoading = olderLoadingGroupId === String(groupId);
  const chatError = chatErrorState.groupId === String(groupId) ? chatErrorState.message : '';
  const visibleMessages = chatMessagesGroupId === String(groupId) ? messages : [];
  const visibleOlderBefore = chatMessagesGroupId === String(groupId) ? olderBefore : null;
  const lastMessageId = visibleMessages[visibleMessages.length - 1]?.id;
  const lastMessageIdRef = useRef(lastMessageId);
  const chatMessagesGroupIdRef = useRef(chatMessagesGroupId);

  useEffect(() => {
    lastMessageIdRef.current = lastMessageId;
    chatMessagesGroupIdRef.current = chatMessagesGroupId;
  }, [chatMessagesGroupId, lastMessageId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastMessageId]);

  useEffect(() => {
    groupIdRef.current = groupId;
  }, [groupId]);

  const loadGroups = useCallback(async () => {
    const { data } = await api.get('/groups/');
    setGroups(data);
    setGroupId((current) => current && data.some((group) => String(group.id) === String(current)) ? current : String(data[0]?.id || ''));
    setGroupsError('');
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    loadGroups()
      .catch((loadError) => active && setGroupsError(displayError(loadError, 'Unable to load groups.')))
      .finally(() => {
        if (active) {
          setLoading(false);
          setGroupsLoading(false);
        }
      });
    return () => { active = false; };
  }, [groupsRetryKey, loadGroups]);

  useEffect(() => {
    if (!inviteCodePath && !inviteToken) return undefined;
    let active = true;
    const requestKey = inviteCodePath ? `code:${inviteCodePath}` : `token:${inviteToken}`;
    let request = inviteRequestsRef.current.get(requestKey);
    if (!request) {
      request = api.post('/groups/join/', inviteCodePath ? { code: inviteCodePath } : { token: inviteToken });
      inviteRequestsRef.current.set(requestKey, request);
      request.finally(() => {
        if (inviteRequestsRef.current.get(requestKey) === request) {
          inviteRequestsRef.current.delete(requestKey);
        }
      }).catch(() => {});
    }
    request.then(async ({ data }) => {
      if (!active) return;
      setNotice(`Joined ${data.name}.`);
      setGroupId(String(data.id));
      if (inviteCodePath) navigate('/groups', { replace: true });
      else setSearchParams({}, { replace: true });
      try {
        await loadGroups();
        if (active) setGroupId(String(data.id));
      } catch (loadError) {
        if (active) setGroupsError(displayError(loadError, 'You joined the group, but the group list could not be refreshed.'));
      }
    }).catch((joinError) => {
      if (!active) return;
      setError(displayError(joinError, 'Unable to join this group.'));
      if (inviteCodePath) navigate('/groups', { replace: true });
      else setSearchParams({}, { replace: true });
    });
    return () => { active = false; };
  }, [inviteCodePath, inviteToken, loadGroups, navigate, setSearchParams]);

  const loadWorkspace = useCallback(async (id) => {
    if (!id) return;
    try {
      const [expenseResponse, balanceResponse, settlementResponse] = await Promise.all([
        api.get(`/groups/${id}/expenses/`),
        api.get(`/groups/${id}/balances/`),
        api.get(`/groups/${id}/settlements/`),
      ]);
      setExpenses(expenseResponse.data);
      setBalances(balanceResponse.data);
      setSettlements(settlementResponse.data.settlements);
      await loadGroups();
    } catch (loadError) {
      setError(displayError(loadError, 'Unable to load this group.'));
    }
  }, [loadGroups]);

  const loadChat = useCallback(async (id = groupId) => {
    if (!id || chatRequestRef.current) return;
    const controller = new AbortController();
    chatRequestRef.current = controller;
    setChatLoading(true);
    setChatErrorState({ groupId: String(id), message: '' });
    try {
      const { data } = await api.get(`/groups/${id}/chat/?limit=50`, { signal: controller.signal });
      if (groupIdRef.current !== String(id)) return;
      setChatMessagesGroupId(String(id));
      setMessages(data.results);
      setOlderBefore(data.next_before);
      if (data.results.length) {
        await api.post(`/groups/${id}/chat/read/`, {}, { signal: controller.signal });
        if (groupIdRef.current === String(id)) {
          setGroups((current) => current.map((group) => (
            String(group.id) === String(id) ? { ...group, unread_count: 0 } : group
          )));
        }
      }
    } catch (loadError) {
      if (!controller.signal.aborted && groupIdRef.current === String(id)) {
        setChatErrorState({
          groupId: String(id),
          message: displayError(loadError, 'Unable to load group chat. Check the connection and retry.'),
        });
      }
    } finally {
      if (chatRequestRef.current === controller) chatRequestRef.current = null;
      if (groupIdRef.current === String(id)) setChatLoading(false);
    }
  }, [groupId]);

  const refreshChat = useCallback(async (manual = false) => {
    const id = groupId;
    if (!id) return false;
    if (chatMessagesGroupIdRef.current !== String(id)) {
      await loadChat(id);
      return true;
    }
    const after = lastMessageIdRef.current || 0;
    if (chatRequestRef.current) return false;
    const controller = new AbortController();
    chatRequestRef.current = controller;
    if (manual) setChatRefreshingGroupId(String(id));
    try {
      const { data } = await api.get(`/groups/${id}/chat/?after=${after}&limit=100&wait=${manual ? 0 : 20}`, {
        signal: controller.signal,
        timeout: 30000,
      });
      if (groupIdRef.current !== String(id)) return false;
      if (data.results.length) {
        setMessages((current) => mergeMessages(
          chatMessagesGroupIdRef.current === String(id) ? current : [],
          data.results,
        ));
        setChatMessagesGroupId(String(id));
        await api.post(`/groups/${id}/chat/read/`, {}, { signal: controller.signal });
        if (groupIdRef.current === String(id)) {
          setGroups((current) => current.map((group) => (
            String(group.id) === String(id) ? { ...group, unread_count: 0 } : group
          )));
        }
      }
      setChatErrorState({ groupId: String(id), message: '' });
      return true;
    } catch (refreshError) {
      if (!controller.signal.aborted && groupIdRef.current === String(id)) {
        setChatErrorState({
          groupId: String(id),
          message: displayError(refreshError, 'Unable to refresh group chat. Check the connection and retry.'),
        });
      }
      return false;
    } finally {
      if (chatRequestRef.current === controller) chatRequestRef.current = null;
      if (manual && groupIdRef.current === String(id)) setChatRefreshingGroupId('');
    }
  }, [groupId, loadChat]);

  useEffect(() => {
    if (!groupId) return undefined;
    loadWorkspace(groupId);
    loadChat(groupId);
    return () => {
      if (chatRequestRef.current) {
        chatRequestRef.current.abort();
        chatRequestRef.current = null;
      }
    };
  }, [groupId, loadChat, loadWorkspace]);

  useEffect(() => {
    if (!groupId || chatMessagesGroupId !== String(groupId)) return undefined;
    let active = true;
    let timeoutId;
    const poll = async () => {
      const succeeded = await refreshChat();
      if (active) timeoutId = window.setTimeout(poll, succeeded ? 0 : 3000);
    };
    poll();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      if (chatRequestRef.current) {
        chatRequestRef.current.abort();
        chatRequestRef.current = null;
      }
    };
  }, [chatMessagesGroupId, groupId, refreshChat]);

  useEffect(() => {
    setGroupForm({ name: selectedGroup?.name || '', description: selectedGroup?.description || '' });
    setCustomShares({});
    setPercentageShares({});
    setPayerAmounts({});
  }, [groupId, selectedGroup?.name, selectedGroup?.description]);

  const createGroup = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post('/groups/', createForm);
      await loadGroups();
      setGroupId(String(data.id));
      setCreateForm({ name: '', description: '' });
      setNotice('Group created.');
      setError('');
    } catch (saveError) {
      setError(displayError(saveError, 'Unable to create group.'));
    }
  };

  const saveGroup = async (event) => {
    event.preventDefault();
    try {
      await api.patch(`/groups/${groupId}/`, groupForm);
      await loadGroups();
      setNotice('Group details saved.');
      setError('');
    } catch (saveError) {
      setError(displayError(saveError, 'Unable to save group details.'));
    }
  };

  const deleteGroup = async () => {
    if (!window.confirm(`Delete “${selectedGroup.name}” and its group data?`)) return;
    try {
      await api.delete(`/groups/${groupId}/`);
      setGroupId('');
      await loadGroups();
      setNotice('Group deleted.');
    } catch (deleteError) {
      setError(displayError(deleteError, 'Unable to delete group.'));
    }
  };

  const addMember = async (event) => {
    event.preventDefault();
    try {
      await api.post(`/groups/${groupId}/members/`, { email: inviteEmail });
      setInviteEmail('');
      await loadGroups();
      setNotice('Member added.');
      setError('');
    } catch (memberError) {
      setError(displayError(memberError, 'Unable to add this member.'));
    }
  };

  const createInvite = async () => {
    setInviteLoading(true);
    try {
      const { data } = await api.post(`/groups/${groupId}/invite/`);
      const inviteUrl = new URL(`/g/join/${data.code}`, window.location.origin);
      setInvite({ groupId, code: data.code, url: inviteUrl.toString(), expiresAt: data.expires_at });
      setNotice('Invitation code and link created. They expire in 7 days.');
      setError('');
    } catch (inviteError) {
      setError(displayError(inviteError, 'Unable to create an invite.'));
    } finally {
      setInviteLoading(false);
    }
  };

  const shareInvite = async () => {
    const text = `Join ${selectedGroup.name} on MoneyMind with this invite code: ${invite.code}\n${invite.url}\nExpires ${new Date(invite.expiresAt).toLocaleString()}`;
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ title: `Join ${selectedGroup.name} on MoneyMind`, text, url: invite.url });
        return;
      } catch (shareError) {
        if (shareError.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const copyInviteValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
      setError('');
    } catch {
      setError(`Unable to copy the invitation ${label.toLowerCase()}. Check browser clipboard permissions.`);
    }
  };

  const joinGroup = async (event) => {
    event.preventDefault();
    try {
      const { data } = await api.post('/groups/join/', { code: joinToken });
      setJoinToken('');
      await loadGroups();
      setGroupId(String(data.id));
      setNotice(`Joined ${data.name}.`);
      setError('');
    } catch (joinError) {
      setError(displayError(joinError, 'Unable to join this group.'));
    }
  };

  const createExpense = async (event) => {
    event.preventDefault();
    const total = Number(expenseForm.amount);
    let shares;
    if (expenseForm.split_type !== 'equal') {
      shares = members.map((member) => ({
        membership_id: member.id,
        ...(expenseForm.split_type === 'custom'
          ? { amount: Number(customShares[member.id] || 0) }
          : { percentage: Number(percentageShares[member.id] || 0) }),
      }));
    }
    const payments = Object.entries(payerAmounts)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([membership_id, amount]) => ({ membership_id: Number(membership_id), amount: Number(amount) }));
    if (!payments.length && myMembership && total > 0) payments.push({ membership_id: myMembership.id, amount: total });
    try {
      await api.post(`/groups/${groupId}/expenses/`, { ...expenseForm, amount: total, shares, payments });
      setExpenseForm(emptyExpense());
      setCustomShares({});
      setPercentageShares({});
      setPayerAmounts({});
      await loadWorkspace(groupId);
      setNotice('Shared expense added.');
      setError('');
    } catch (saveError) {
      setError(displayError(saveError, 'Unable to add this expense.'));
    }
  };

  const deleteExpense = async (id) => {
    try {
      await api.delete(`/groups/${groupId}/expenses/${id}/`);
      await loadWorkspace(groupId);
    } catch (deleteError) {
      setError(displayError(deleteError, 'Unable to delete this expense.'));
    }
  };

  const previewExpenseShare = (expense) => {
    setSharePreview([
      '💸 MoneyMind group expense',
      `👥 Group: ${selectedGroup.name}`,
      `📌 Expense: ${expense.title}`,
      `💰 Total: ${money.format(Number(expense.amount))}`,
      `📅 Date: ${expense.date}`,
      `🙋 Paid by: ${expense.payments.map((payer) => `${payer.name} (${money.format(Number(payer.amount))})`).join(', ') || 'Not specified'}`,
      'Member shares:',
      ...expense.shares.map((share) => `• ${share.name}: ${money.format(Number(share.amount))}`),
    ].join('\n'));
  };

  const shareExpenseToChat = async (expense) => {
    const id = groupId;
    try {
      const { data, status: responseStatus } = await api.post(`/groups/${id}/chat/`, {
        message_type: 'EXPENSE',
        expense_id: expense.id,
      });
      if (groupIdRef.current === String(id)) {
        setMessages((current) => mergeMessages(
          chatMessagesGroupId === String(id) ? current : [],
          [data],
        ));
        setChatMessagesGroupId(String(id));
      }
      setNotice(responseStatus === 200 ? 'This expense is already shared in the group chat.' : 'Expense shared in the group chat.');
      setError('');
    } catch (shareError) {
      setError(displayError(shareError, 'Unable to share this expense in the group chat.'));
    }
  };

  const openChatExpense = async (expenseId) => {
    try {
      const { data } = await api.get(`/groups/${groupId}/expenses/${expenseId}/`);
      setChatExpenseDetails(data);
    } catch (detailError) {
      setError(displayError(detailError, 'Unable to load this shared expense.'));
    }
  };

  const createSettlement = async (transfer) => {
    try {
      await api.post(`/groups/${groupId}/settlements/`, {
        from_membership_id: transfer.from_membership_id,
        to_membership_id: transfer.to_membership_id,
        amount: transfer.amount,
      });
      await loadWorkspace(groupId);
      setNotice('Settlement recorded. Mark it settled when the transfer is complete.');
    } catch (settlementError) {
      setError(displayError(settlementError, 'Unable to record settlement.'));
    }
  };

  const markSettled = async (settlementId) => {
    try {
      await api.post(`/groups/${groupId}/settlements/${settlementId}/settle/`);
      await loadWorkspace(groupId);
    } catch (settlementError) {
      setError(displayError(settlementError, 'Unable to update settlement.'));
    }
  };

  const generateGroupInsights = async () => {
    if (aiConsentGroupId !== groupId || aiLoading) return;
    setAiLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/groups/${groupId}/ai-insights/`, { consent: true });
      setAiInsight({ groupId, content: data.content });
    } catch (insightError) {
      setError(displayError(insightError, 'Unable to generate group insights.'));
    } finally {
      setAiLoading(false);
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = messageText.trim();
    const id = groupId;
    if (!id || !text || chatSending) return;
    setChatSendingGroupId(String(id));
    setChatErrorState({ groupId: String(id), message: '' });
    try {
      const { data } = await api.post(`/groups/${id}/chat/`, { text });
      if (groupIdRef.current === String(id)) {
        setMessages((current) => mergeMessages(
          chatMessagesGroupId === String(id) ? current : [],
          [data],
        ));
        setChatMessagesGroupId(String(id));
        setMessageDraft((current) => (
          current.groupId === String(id) && current.text === text
            ? { groupId: String(id), text: '' }
            : current
        ));
      }
    } catch (sendError) {
      if (groupIdRef.current === String(id)) {
        setChatErrorState({
          groupId: String(id),
          message: displayError(sendError, 'Unable to send this message. Check the connection and try again.'),
        });
      }
    } finally {
      if (groupIdRef.current === String(id)) setChatSendingGroupId('');
    }
  };

  const loadOlderMessages = async () => {
    if (!visibleOlderBefore || chatRequestRef.current) return;
    const id = groupId;
    const controller = new AbortController();
    chatRequestRef.current = controller;
    setOlderLoadingGroupId(String(id));
    try {
      const { data } = await api.get(`/groups/${id}/chat/?limit=50&before=${visibleOlderBefore}`, {
        signal: controller.signal,
      });
      if (groupIdRef.current === String(id)) {
        setMessages((current) => mergeMessages(
          chatMessagesGroupId === String(id) ? current : [],
          data.results,
        ));
        setChatMessagesGroupId(String(id));
        setOlderBefore(data.next_before);
      }
    } catch (loadError) {
      if (!controller.signal.aborted && groupIdRef.current === String(id)) {
        setChatErrorState({
          groupId: String(id),
          message: displayError(loadError, 'Unable to load older messages.'),
        });
      }
    } finally {
      if (chatRequestRef.current === controller) chatRequestRef.current = null;
      if (groupIdRef.current === String(id)) setOlderLoadingGroupId('');
    }
  };

  const updateSplitInput = (memberId, value) => {
    if (expenseForm.split_type === 'custom') setCustomShares((current) => ({ ...current, [memberId]: value }));
    else setPercentageShares((current) => ({ ...current, [memberId]: value }));
  };

  const groupTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  if (loading) return <div className="rounded-2xl bg-white p-8 text-slate-600">Loading groups…</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-6">
      <header className="overflow-hidden rounded-2xl bg-linear-to-r from-[#21136f] via-[#3b1ab1] to-[#741ee5] px-5 py-4 text-white shadow-lg shadow-violet-200 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20"><Users className="h-6 w-6 text-violet-100" /></span>
          <div><p className="text-xs font-medium text-violet-200">Shared money, together</p><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Groups & Chat</h1></div>
        </div>
        <p className="ml-14 mt-0.5 text-xs text-violet-100 sm:text-sm">Plan shared spending, keep balances clear, and chat with your group.</p>
      </header>

      {(error || groupsError || notice || joiningInvite) && <div role={joiningInvite ? 'status' : 'alert'} className={`rounded-xl border px-4 py-3 text-sm ${error || groupsError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{joiningInvite ? 'Joining group invitation…' : error || groupsError || notice}{groupsError && <button type="button" disabled={groupsLoading} className="ml-3 font-semibold underline disabled:opacity-50" onClick={() => { setGroupsError(''); setGroupsLoading(true); setGroupsRetryKey((key) => key + 1); }}>{groupsLoading ? 'Retrying…' : 'Retry loading groups'}</button>}<button type="button" className="float-right font-semibold" onClick={() => { setError(''); setGroupsError(''); setNotice(''); }}>Dismiss</button></div>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(220px,0.72fr)_minmax(0,2fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm shadow-violet-100/70">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Users className="h-4 w-4 text-violet-700" />Your groups</h2>
            <label htmlFor="group-select" className="sr-only">Select a group</label>
            <select id="group-select" value={groupId} onChange={(event) => setGroupId(event.target.value)} className="mt-2 w-full rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2.5 text-sm font-semibold text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100">
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.unread_count ? ` (${group.unread_count} unread)` : ''}</option>)}
              {!groups.length && <option value="">No groups yet</option>}
            </select>
            {selectedGroup && <div className="mt-3 space-y-2">{members.map((member, index) => <div key={member.id} className="flex items-center justify-between gap-2 rounded-xl bg-violet-50/60 px-2.5 py-2"><span className="flex min-w-0 items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${index % 2 ? 'bg-sky-500' : 'bg-violet-500'}`}>{member.name?.charAt(0)?.toUpperCase()}</span><span className="min-w-0 truncate text-xs font-semibold text-slate-800">{member.name}<span className="block truncate text-[10px] font-normal text-slate-500">{member.email}</span></span></span><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{member.role}</span></div>)}</div>}
          </section>

          <form onSubmit={createGroup} className="space-y-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm shadow-violet-100/70">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Plus className="h-4 w-4 text-violet-700" />Create a group</h2>
            <input required maxLength={120} value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="Group name" className="w-full rounded-xl border border-violet-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100" />
            <input value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} placeholder="Description (optional)" className="w-full rounded-xl border border-violet-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100" />
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-200 transition hover:brightness-105"><Plus className="h-4 w-4" /> Create group</button>
          </form>

          <form onSubmit={joinGroup} className="space-y-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm shadow-violet-100/70">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Share2 className="h-4 w-4 text-violet-700" />Join with an invite</h2>
            <label htmlFor="group-invite-code" className="sr-only">Six-digit invitation code</label>
            <input id="group-invite-code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={joinToken} onChange={(event) => setJoinToken(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit invite code" className="w-full rounded-xl border border-violet-200 px-3 py-2 font-mono text-sm tracking-widest focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100" />
            <button disabled={joinToken.length !== 6} className="w-full rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-2 text-sm font-bold text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50">Join group</button>
          </form>
        </aside>

        {selectedGroup ? <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm shadow-violet-100/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <form onSubmit={saveGroup} className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <label className="sr-only" htmlFor="edit-group-name">Group name</label>
                <input id="edit-group-name" aria-label="Group name" required maxLength={120} value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} className="rounded-xl border border-violet-200 px-3 py-2 text-sm font-semibold focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100" />
                <label className="sr-only" htmlFor="edit-group-description">Group description</label>
                <input id="edit-group-description" aria-label="Group description" value={groupForm.description} onChange={(event) => setGroupForm({ ...groupForm, description: event.target.value })} placeholder="Description" className="rounded-xl border border-violet-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100" />
                {myMembership?.role === 'admin' && <button className="rounded-xl bg-linear-to-r from-violet-700 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-violet-200">Save group</button>}
              </form>
              {myMembership?.role === 'admin' && <button type="button" onClick={deleteGroup} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">Delete group</button>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <form onSubmit={addMember} className="flex gap-2">
                <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Existing user's email" className="min-w-0 flex-1 rounded-xl border border-violet-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
                <button disabled={myMembership?.role !== 'admin'} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-40"><Users className="mr-1 inline h-3.5 w-3.5" />Add member</button>
              </form>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={createInvite} disabled={myMembership?.role !== 'admin' || inviteLoading} className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 disabled:opacity-40">{inviteLoading ? 'Generating invitation…' : 'Generate invitation code'}</button>
                {invite.groupId === groupId && <>
                  <button type="button" onClick={() => copyInviteValue(invite.code, 'Invitation code')} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">Copy code</button>
                  <button type="button" onClick={() => copyInviteValue(invite.url, 'Invitation link')} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">Copy link</button>
                  <button type="button" onClick={shareInvite} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Share on WhatsApp</button>
                </>}
              </div>
              {invite.groupId === groupId && <div className="space-y-2 sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600">Invite code
                  <input readOnly value={invite.code} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
                </label>
                <label className="block text-xs font-semibold text-slate-600">Invitation link
                  <input readOnly value={invite.url} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" />
                </label>
                <p className="text-xs text-slate-500">Expires {invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : 'in 7 days'}. Anyone with this code or link can join before expiry.</p>
              </div>}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-violet-200 bg-linear-to-r from-violet-100 via-purple-100 to-fuchsia-100 p-4 shadow-sm">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-slate-950"><Sparkles className="h-5 w-5 text-violet-700" />AI Group Insights</h2>
              <p className="mt-1 text-sm text-slate-600">Analyze this group's spending, member contributions, categories, and current balances.</p>
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={aiConsentGroupId === groupId} onChange={(event) => setAiConsentGroupId(event.target.checked ? groupId : '')} />
              <span>I agree to send this group's financial summary to the configured AI provider.</span>
            </label>
            <button type="button" disabled={aiConsentGroupId !== groupId || aiLoading} onClick={generateGroupInsights} className="rounded-xl bg-linear-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-200 disabled:cursor-not-allowed disabled:opacity-50">
              {aiLoading ? 'Generating insights...' : 'Generate group insights'}
            </button>
            {aiInsight.groupId === groupId && aiInsight.content && <p className="whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-6 text-slate-800">{aiInsight.content}</p>}
          </section>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <form onSubmit={createExpense} className="space-y-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm shadow-violet-100/70">
              <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><ReceiptText className="h-4 w-4 text-violet-700" />Add shared expense</h2><span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-bold text-violet-800">{money.format(groupTotal)} total</span></div>
              <input required maxLength={200} value={expenseForm.title} onChange={(event) => setExpenseForm({ ...expenseForm, title: event.target.value })} placeholder="What was it for?" className="w-full rounded-xl border border-violet-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
              <div className="grid grid-cols-2 gap-2"><input type="number" step="0.01" min="0.01" required value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} placeholder="Amount (₹)" className="min-w-0 rounded-xl border border-violet-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" /><input type="date" aria-label="Expense date" required value={expenseForm.date} onChange={(event) => setExpenseForm({ ...expenseForm, date: event.target.value })} className="min-w-0 rounded-xl border border-violet-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" /></div>
              <div className="grid grid-cols-2 gap-2"><input value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} placeholder="Category" className="min-w-0 rounded-xl border border-violet-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" /><select aria-label="Split type" value={expenseForm.split_type} onChange={(event) => setExpenseForm({ ...expenseForm, split_type: event.target.value })} className="min-w-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm"><option value="equal">Split equally</option><option value="custom">Custom amounts</option><option value="percentage">Percentages</option></select></div>
              {expenseForm.split_type !== 'equal' && <div className="space-y-2 rounded-xl bg-violet-50 p-3"><p className="text-xs font-semibold text-slate-600">{expenseForm.split_type === 'custom' ? 'Share amounts (must add to total)' : 'Shares (must total 100%)'}</p>{members.map((member) => <label key={member.id} className="flex items-center justify-between gap-3 text-sm"><span>{member.name}</span><input type="number" step={expenseForm.split_type === 'custom' ? '0.01' : '0.001'} min="0" value={(expenseForm.split_type === 'custom' ? customShares : percentageShares)[member.id] || ''} onChange={(event) => updateSplitInput(member.id, event.target.value)} placeholder={expenseForm.split_type === 'custom' ? '₹ amount' : '%'} className="w-28 rounded-lg border border-violet-200 px-2 py-1.5 text-right" /></label>)}</div>}
              <details className="rounded-xl bg-violet-50 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Who paid? (defaults to you)</summary><div className="mt-3 space-y-2">{members.map((member) => <label key={member.id} className="flex items-center justify-between gap-3 text-sm"><span>{member.name}</span><input type="number" step="0.01" min="0" value={payerAmounts[member.id] || ''} onChange={(event) => setPayerAmounts({ ...payerAmounts, [member.id]: event.target.value })} placeholder="₹ paid" className="w-28 rounded-lg border border-violet-200 px-2 py-1.5 text-right" /></label>)}</div></details>
              <button className="w-full rounded-xl bg-linear-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-200 hover:brightness-105">Save expense</button>
              {expenses.length > 0 && <div className="space-y-2 border-t border-violet-100 pt-3"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Recent shared expenses</h3>{expenses.map((expense) => <article id={`group-expense-${expense.id}`} key={expense.id} className="flex items-start justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{expense.title}</p><p className="text-xs text-slate-500">{expense.date} · {expense.category || 'Shared'} · {expense.split_type}</p><p className="mt-1 text-xs text-slate-500">{expense.shares.map((share) => `${share.name}: ${money.format(Number(share.amount))}`).join(' · ')}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold text-slate-900">{money.format(Number(expense.amount))}</p><div className="mt-2 flex flex-wrap justify-end gap-2"><button onClick={() => shareExpenseToChat(expense)} type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700"><MessageCircle className="h-3.5 w-3.5" /> Share to chat</button><button onClick={() => previewExpenseShare(expense)} type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Share2 className="h-3.5 w-3.5" /> WhatsApp</button><button onClick={() => deleteExpense(expense.id)} type="button" className="text-xs font-semibold text-rose-600">Delete</button></div></div></article>)}</div>}
            </form>

            <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm shadow-violet-100/70">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><ArrowUpRight className="h-4 w-4 text-violet-700" />Balances & Settlements</h2>
                <div className="mt-3 space-y-2">{balances.balances.map((balance) => <div key={balance.membership_id} className="flex items-center justify-between rounded-xl bg-violet-50/60 px-3 py-2.5"><span className="flex items-center gap-2 text-sm">{Number(balance.balance) < 0 ? <ArrowDownLeft className="h-4 w-4 text-rose-600" /> : <ArrowUpRight className="h-4 w-4 text-emerald-600" />}{balance.name}</span><strong className={Number(balance.balance) < 0 ? 'rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700' : 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700'}>{money.format(Number(balance.balance))}</strong></div>)}</div>
                {balances.suggested_transfers.length > 0 && <div className="mt-4 space-y-2"><h3 className="text-xs font-bold text-slate-800">Suggested transfers</h3>{balances.suggested_transfers.map((transfer) => <div key={`${transfer.from_membership_id}-${transfer.to_membership_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-100 bg-violet-50/30 p-3 text-xs"><span>{transfer.from_name} → {transfer.to_name}: <strong>{money.format(Number(transfer.amount))}</strong></span><button type="button" onClick={() => createSettlement(transfer)} className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white">Record</button></div>)}</div>}
                <div className="mt-4 space-y-2">{settlements.map((settlement) => <div key={settlement.id} className="flex items-center justify-between gap-2 rounded-xl border border-violet-100 p-3 text-xs"><span className="min-w-0">{settlement.from_member.name} → {settlement.to_member.name} · {money.format(Number(settlement.amount))}<span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${settlement.is_settled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{settlement.is_settled ? 'Settled' : 'Pending'}</span></span>{!settlement.is_settled && <button type="button" onClick={() => markSettled(settlement.id)} className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Mark paid</button>}</div>)}</div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <section className="relative flex min-h-72 flex-col items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-linear-to-br from-white via-violet-50 to-fuchsia-100 p-6 text-center shadow-sm shadow-violet-100/70">
              <span className="absolute right-8 top-8 flex h-16 w-16 rotate-6 items-center justify-center rounded-2xl bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-200"><ReceiptText className="h-9 w-9" /></span>
              <span className="absolute bottom-20 left-8 flex h-12 w-12 -rotate-12 items-center justify-center rounded-xl bg-amber-400 text-white shadow-md"><Wallet className="h-7 w-7" /></span>
              <span className="absolute left-1/4 top-8 text-amber-400"><Sparkles className="h-5 w-5" /></span>
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/80 text-violet-600 shadow-inner shadow-violet-100"><ReceiptText className="h-20 w-20" strokeWidth={1.4} /></div>
              <h2 className="mt-5 text-xl font-extrabold tracking-tight text-violet-700">Track · Split · Settle</h2>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">Add expenses, view balances, and chat with your group — all in one place.</p>
            </section>

            <section className="flex min-h-72 flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm shadow-violet-100/70">
                <header className="flex items-center justify-between border-b border-violet-100 px-4 py-3"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100"><MessageCircle className="h-5 w-5 text-violet-700" /></span><div><h2 className="text-sm font-bold text-slate-900">Group Chat</h2><p className="text-[10px] text-slate-500">Messages are saved · live updates</p></div></div><button type="button" onClick={() => refreshChat(true)} disabled={chatRefreshing || chatLoading} className="flex items-center gap-1.5 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:cursor-wait disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${chatRefreshing ? 'animate-spin' : ''}`} />{chatRefreshing ? 'Refreshing…' : 'Refresh'}</button></header>
                <div className="flex-1 space-y-3 overflow-y-auto bg-linear-to-b from-violet-50/50 to-white p-3">
                  {chatError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{chatError} <button type="button" onClick={() => loadChat(groupId)} disabled={chatLoading} className="ml-2 font-semibold underline">{chatLoading ? 'Retrying…' : 'Retry'}</button></div>}
                  {visibleOlderBefore && <button onClick={loadOlderMessages} disabled={olderLoading} className="w-full rounded-lg bg-slate-50 py-2 text-xs font-medium text-indigo-700 disabled:opacity-50">{olderLoading ? 'Loading older messages…' : 'Load older messages'}</button>}
                  {chatLoading && !visibleMessages.length && <p className="py-12 text-center text-sm text-slate-500">Loading chat…</p>}
                  {!chatLoading && !visibleMessages.length && !chatError && <p className="py-12 text-center text-sm text-slate-500">No messages yet. Start the conversation.</p>}
                  {visibleMessages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${message.sender_id === user?.id ? 'ml-auto bg-linear-to-r from-violet-700 to-fuchsia-600 text-white' : 'bg-white text-slate-800 ring-1 ring-violet-100'}`}><p className="mb-1 text-xs font-semibold opacity-75">{message.sender_name}</p>{message.message_type === 'EXPENSE' ? <div className="rounded-xl border border-current/15 bg-white/10 p-3"><p className="font-semibold">{message.expense_title || message.text}</p>{message.expense_amount && <p className="mt-1">{money.format(Number(message.expense_amount))}</p>}{message.expense_id && <button type="button" onClick={() => openChatExpense(message.expense_id)} className="mt-2 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold underline">View expense</button>}</div> : <p className="whitespace-pre-wrap wrap-break-word">{message.text}</p>}<time className="mt-1 block text-right text-[10px] opacity-70">{new Date(message.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time></div>)}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 border-t border-violet-100 bg-white p-3"><textarea maxLength={2000} rows={1} value={messageText} onChange={(event) => setMessageDraft({ groupId: String(groupId), text: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder="Write a message…" className="min-w-0 flex-1 resize-y rounded-xl border border-violet-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" /><button disabled={!messageText.trim() || chatSending} aria-label="Send message" className="flex items-center gap-2 rounded-xl bg-linear-to-r from-violet-700 to-fuchsia-600 px-4 text-white shadow-sm disabled:opacity-40">{chatSending ? 'Sending…' : <Send className="h-4 w-4" />}</button></form>
              </section>
          </div>
        </div> : <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><Users className="mx-auto h-10 w-10 text-indigo-400" /><h2 className="mt-3 text-xl font-semibold">Your shared space starts here</h2><p className="mt-1 text-sm text-slate-500">Create a group or join using an invite token.</p></section>}
      </div>
      {sharePreview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
          <h2 id="share-dialog-title" className="text-lg font-semibold">Preview WhatsApp message</h2>
          <p className="mt-1 text-sm text-slate-500">Review or edit the message before opening WhatsApp. It will not be sent automatically.</p>
          <textarea autoFocus rows={10} value={sharePreview} onChange={(event) => setSharePreview(event.target.value)} className="mt-4 w-full resize-y rounded-xl border border-slate-300 p-3 text-sm" />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setSharePreview('')} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium">Cancel</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(sharePreview)}`} target="_blank" rel="noopener noreferrer" onClick={() => setSharePreview('')} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Open WhatsApp</a>
          </div>
        </section>
      </div>}
      {chatExpenseDetails && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setChatExpenseDetails(null);
      }}>
        <section role="dialog" aria-modal="true" aria-labelledby="group-chat-expense-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm text-slate-500">Shared group expense</p><h2 id="group-chat-expense-title" className="text-xl font-semibold">{chatExpenseDetails.title}</h2></div>
            <button type="button" onClick={() => setChatExpenseDetails(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">Close</button>
          </div>
          <p className="mt-3 text-lg font-semibold">{money.format(Number(chatExpenseDetails.amount))}</p>
          <p className="text-sm text-slate-500">{chatExpenseDetails.date} · {chatExpenseDetails.category || 'Shared'}</p>
          <h3 className="mt-5 text-sm font-semibold">Participant shares</h3>
          <div className="mt-2 space-y-2">{chatExpenseDetails.shares.map((share) => <div key={share.membership_id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{share.name}</span><span>{money.format(Number(share.amount))}</span></div>)}</div>
          <h3 className="mt-5 text-sm font-semibold">Paid by</h3>
          <div className="mt-2 space-y-2">{chatExpenseDetails.payments.map((payment) => <div key={payment.membership_id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{payment.name}</span><span>{money.format(Number(payment.amount))}</span></div>)}</div>
        </section>
      </div>}
    </div>
  );
}
