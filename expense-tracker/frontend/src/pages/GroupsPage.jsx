import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, MessageCircle, Plus, Send, Share2, Users } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api, { API_BASE_URL } from '../services/api';
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
  const [messageText, setMessageText] = useState('');
  const [connection, setConnection] = useState('connecting');
  const [reconnectKey, setReconnectKey] = useState(0);
  const [groupsRetryKey, setGroupsRetryKey] = useState(0);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupsError, setGroupsError] = useState('');
  const [chatError, setChatError] = useState('');
  const [notice, setNotice] = useState('');
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const inviteRequestsRef = useRef(new Map());
  const selectedGroup = useMemo(() => groups.find((group) => String(group.id) === String(groupId)), [groups, groupId]);
  const members = selectedGroup?.members || [];
  const myMembership = members.find((member) => member.user_id === user?.id);
  const money = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR' }), []);
  const joiningInvite = Boolean(inviteCodePath || inviteToken);
  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastMessageId]);

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
      const [expenseResponse, balanceResponse, settlementResponse, messageResponse] = await Promise.all([
        api.get(`/groups/${id}/expenses/`),
        api.get(`/groups/${id}/balances/`),
        api.get(`/groups/${id}/settlements/`),
        api.get(`/groups/${id}/chat/?limit=50`),
      ]);
      setExpenses(expenseResponse.data);
      setBalances(balanceResponse.data);
      setSettlements(settlementResponse.data.settlements);
      setMessages(messageResponse.data.results);
      setOlderBefore(messageResponse.data.next_before);
      await api.post(`/groups/${id}/chat/read/`);
      await loadGroups();
    } catch (loadError) {
      setError(displayError(loadError, 'Unable to load this group.'));
    }
  }, [loadGroups]);

  useEffect(() => {
    if (!groupId) return undefined;
    loadWorkspace(groupId);
    let live = true;
    let socket;
    let socketTimeout;
    let reconnectTimer;
    let pollingTimer;
    let retryDelay = 1000;
    let failedAttempts = 0;
    let latestMessageId = 0;

    const pollMessages = async () => {
      try {
        const { data } = await api.get(`/groups/${groupId}/chat/?limit=50`);
        if (!live) return;
        setChatError('');
        setConnection((current) => (
          current === 'disconnected' ? (failedAttempts > 3 ? 'fallback' : 'polling') : current
        ));
        const hasUnreadMessages = data.results.some(
          (message) => message.id > latestMessageId && message.sender_id !== user?.id,
        );
        latestMessageId = Math.max(latestMessageId, ...data.results.map((message) => message.id), 0);
        setMessages((current) => mergeMessages(current, data.results));
        setOlderBefore(data.next_before);
        if (hasUnreadMessages) {
          await api.post(`/groups/${groupId}/chat/read/`);
          await loadGroups();
        }
      } catch (pollError) {
        if (live) {
          setConnection('disconnected');
          setChatError(displayError(pollError, 'Unable to sync group chat. Check the connection and try again.'));
        }
      }
    };

    const startPolling = () => {
      setConnection('polling');
      if (!pollingTimer) {
        pollMessages();
        pollingTimer = window.setInterval(pollMessages, 3000);
      }
    };

    const scheduleReconnect = () => {
      if (!live || reconnectTimer) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    };

    const handleConnectionFailure = () => {
      startPolling();
      failedAttempts += 1;
      if (failedAttempts <= 3) {
        scheduleReconnect();
      } else {
        setConnection('fallback');
      }
    };

    const connect = async () => {
      try {
        const { data } = await api.post(`/groups/${groupId}/chat/ticket/`);
          if (!live) return;
          const apiOrigin = new URL(API_BASE_URL).origin;
          const wsUrl = new URL(`/ws/groups/${groupId}/chat/`, apiOrigin);
          wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl.searchParams.set('ticket', data.ticket);
        socket = new WebSocket(wsUrl.toString());
        socketRef.current = socket;
        socketTimeout = window.setTimeout(() => {
          if (socket?.readyState === WebSocket.CONNECTING) socket.close();
        }, 8000);
        socket.onopen = () => {
          if (!live) return;
          window.clearTimeout(socketTimeout);
          setConnection('connected');
          setChatError('');
          failedAttempts = 0;
          retryDelay = 1000;
          window.clearInterval(pollingTimer);
          pollingTimer = undefined;
          window.clearTimeout(reconnectTimer);
          reconnectTimer = undefined;
        };
        socket.onclose = () => {
          window.clearTimeout(socketTimeout);
          if (!live) return;
          handleConnectionFailure();
        };
        socket.onerror = () => socket?.close();
        socket.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.type !== 'message') return;
          latestMessageId = Math.max(latestMessageId, payload.message.id);
          setMessages((current) => mergeMessages(current, [payload.message]));
          api.post(`/groups/${groupId}/chat/read/`).then(() => loadGroups()).catch((readError) => {
            setError(displayError(readError, 'Unable to update the chat read status.'));
          });
        };
      } catch {
        if (live) handleConnectionFailure();
      }
    };
    connect();
    return () => {
      live = false;
      window.clearTimeout(socketTimeout);
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pollingTimer);
      socket?.close();
      socketRef.current = null;
    };
  }, [groupId, loadWorkspace, loadGroups, user?.id, reconnectKey]);

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
    try {
      const { data, status: responseStatus } = await api.post(`/groups/${groupId}/chat/`, {
        message_type: 'EXPENSE',
        expense_id: expense.id,
      });
      setMessages((current) => mergeMessages(current, [data]));
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
    if (!text) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ text }));
      setMessageText('');
      return;
    }
    try {
      const { data } = await api.post(`/groups/${groupId}/chat/`, { text });
      setMessages((current) => mergeMessages(current, [data]));
      if (data.delivery_status === 'polling') {
        setConnection('polling');
        setChatError('Message saved. Live delivery is temporarily unavailable; chat will sync by polling.');
      }
      setMessageText('');
      setError('');
    } catch (sendError) {
      setError(displayError(sendError, 'Unable to send this message. Check the connection and try again.'));
    }
  };

  const loadOlderMessages = async () => {
    if (!olderBefore) return;
    try {
      const { data } = await api.get(`/groups/${groupId}/chat/?limit=50&before=${olderBefore}`);
      setMessages((current) => mergeMessages(current, data.results));
      setOlderBefore(data.next_before);
    } catch {
      setError('Unable to load older messages.');
    }
  };

  const updateSplitInput = (memberId, value) => {
    if (expenseForm.split_type === 'custom') setCustomShares((current) => ({ ...current, [memberId]: value }));
    else setPercentageShares((current) => ({ ...current, [memberId]: value }));
  };

  const groupTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  if (loading) return <div className="rounded-2xl bg-white p-8 text-slate-600">Loading groups…</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-3xl bg-linear-to-br from-indigo-950 via-indigo-900 to-violet-800 p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-center gap-3"><Users className="h-8 w-8 text-indigo-200" /><div><p className="text-sm text-indigo-200">Shared money, together</p><h1 className="text-3xl font-bold">Groups & chat</h1></div></div>
        <p className="mt-3 max-w-2xl text-sm text-indigo-100">Plan shared spending, keep balances clear, and talk with your group in real time.</p>
      </header>

      {(error || groupsError || chatError || notice || joiningInvite) && <div role={joiningInvite ? 'status' : 'alert'} className={`rounded-xl border px-4 py-3 text-sm ${error || groupsError || chatError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{joiningInvite ? 'Joining group invitation…' : error || groupsError || chatError || notice}{groupsError && <button type="button" disabled={groupsLoading} className="ml-3 font-semibold underline disabled:opacity-50" onClick={() => { setGroupsError(''); setGroupsLoading(true); setGroupsRetryKey((key) => key + 1); }}>{groupsLoading ? 'Retrying…' : 'Retry loading groups'}</button>}<button className="float-right font-semibold" onClick={() => { setError(''); setGroupsError(''); setChatError(''); setNotice(''); }}>Dismiss</button></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,2fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label htmlFor="group-select" className="text-sm font-semibold text-slate-700">Your groups</label>
            <select id="group-select" value={groupId} onChange={(event) => setGroupId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.unread_count ? ` (${group.unread_count} unread)` : ''}</option>)}
              {!groups.length && <option value="">No groups yet</option>}
            </select>
            {selectedGroup && <div className="mt-4 space-y-2">{members.map((member) => <div key={member.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="min-w-0 truncate">{member.name}<span className="block truncate text-xs text-slate-500">{member.email}</span></span><span className="text-xs text-indigo-700">{member.role}</span></div>)}</div>}
          </section>

          <form onSubmit={createGroup} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Create a group</h2>
            <input required maxLength={120} value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="Group name" className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <input value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} placeholder="Description (optional)" className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /> Create group</button>
          </form>

          <form onSubmit={joinGroup} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Join with an invite</h2>
            <label htmlFor="group-invite-code" className="sr-only">Six-digit invitation code</label>
            <input id="group-invite-code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={joinToken} onChange={(event) => setJoinToken(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit invite code" className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono tracking-widest" />
            <button disabled={joinToken.length !== 6} className="w-full rounded-xl border border-indigo-200 px-4 py-2 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50">Join group</button>
          </form>
        </aside>

        {selectedGroup ? <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <form onSubmit={saveGroup} className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <input aria-label="Group name" required maxLength={120} value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} className="rounded-xl border border-slate-300 px-3 py-2 font-semibold" />
                <input aria-label="Group description" value={groupForm.description} onChange={(event) => setGroupForm({ ...groupForm, description: event.target.value })} placeholder="Description" className="rounded-xl border border-slate-300 px-3 py-2" />
                {myMembership?.role === 'admin' && <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save group</button>}
              </form>
              {myMembership?.role === 'admin' && <button onClick={deleteGroup} className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700">Delete group</button>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <form onSubmit={addMember} className="flex gap-2">
                <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Existing user's email" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <button disabled={myMembership?.role !== 'admin'} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add member</button>
              </form>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={createInvite} disabled={myMembership?.role !== 'admin' || inviteLoading} className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-40">{inviteLoading ? 'Generating invitation…' : 'Generate invitation code'}</button>
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

          <section className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 shadow-sm">
            <div>
              <h2 className="font-semibold text-slate-950">AI group insights</h2>
              <p className="mt-1 text-sm text-slate-600">Analyze this group's spending, member contributions, categories, and current balances.</p>
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={aiConsentGroupId === groupId} onChange={(event) => setAiConsentGroupId(event.target.checked ? groupId : '')} />
              <span>I agree to send this group's financial summary to the configured AI provider.</span>
            </label>
            <button type="button" disabled={aiConsentGroupId !== groupId || aiLoading} onClick={generateGroupInsights} className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {aiLoading ? 'Generating insights...' : 'Generate group insights'}
            </button>
            {aiInsight.groupId === groupId && aiInsight.content && <p className="whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-6 text-slate-800">{aiInsight.content}</p>}
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <form onSubmit={createExpense} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Add shared expense</h2><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">{money.format(groupTotal)} total</span></div>
              <input required maxLength={200} value={expenseForm.title} onChange={(event) => setExpenseForm({ ...expenseForm, title: event.target.value })} placeholder="What was it for?" className="w-full rounded-xl border border-slate-300 px-3 py-2.5" />
              <div className="grid grid-cols-2 gap-3"><input type="number" step="0.01" min="0.01" required value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} placeholder="Amount (₹)" className="min-w-0 rounded-xl border border-slate-300 px-3 py-2" /><input type="date" required value={expenseForm.date} onChange={(event) => setExpenseForm({ ...expenseForm, date: event.target.value })} className="min-w-0 rounded-xl border border-slate-300 px-3 py-2" /></div>
              <div className="grid grid-cols-2 gap-3"><input value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} placeholder="Category" className="min-w-0 rounded-xl border border-slate-300 px-3 py-2" /><select value={expenseForm.split_type} onChange={(event) => setExpenseForm({ ...expenseForm, split_type: event.target.value })} className="min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2"><option value="equal">Split equally</option><option value="custom">Custom amounts</option><option value="percentage">Percentages</option></select></div>
              {expenseForm.split_type !== 'equal' && <div className="space-y-2 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">{expenseForm.split_type === 'custom' ? 'Share amounts (must add to total)' : 'Shares (must total 100%)'}</p>{members.map((member) => <label key={member.id} className="flex items-center justify-between gap-3 text-sm"><span>{member.name}</span><input type="number" step={expenseForm.split_type === 'custom' ? '0.01' : '0.001'} min="0" value={(expenseForm.split_type === 'custom' ? customShares : percentageShares)[member.id] || ''} onChange={(event) => updateSplitInput(member.id, event.target.value)} placeholder={expenseForm.split_type === 'custom' ? '₹ amount' : '%'} className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-right" /></label>)}</div>}
              <details className="rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-semibold">Who paid? (defaults to you)</summary><div className="mt-3 space-y-2">{members.map((member) => <label key={member.id} className="flex items-center justify-between gap-3 text-sm"><span>{member.name}</span><input type="number" step="0.01" min="0" value={payerAmounts[member.id] || ''} onChange={(event) => setPayerAmounts({ ...payerAmounts, [member.id]: event.target.value })} placeholder="₹ paid" className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-right" /></label>)}</div></details>
              <button className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700">Save expense</button>
              <div className="space-y-2">{expenses.map((expense) => <article id={`group-expense-${expense.id}`} key={expense.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3"><div className="min-w-0"><p className="truncate font-medium">{expense.title}</p><p className="text-xs text-slate-500">{expense.date} · {expense.category || 'Shared'} · {expense.split_type}</p><p className="mt-1 text-xs text-slate-500">{expense.shares.map((share) => `${share.name}: ${money.format(Number(share.amount))}`).join(' · ')}</p></div><div className="shrink-0 text-right"><p className="font-semibold">{money.format(Number(expense.amount))}</p><div className="mt-1 flex justify-end gap-3"><button onClick={() => shareExpenseToChat(expense)} type="button" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700"><MessageCircle className="h-3.5 w-3.5" /> Share to chat</button><button onClick={() => previewExpenseShare(expense)} type="button" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Share2 className="h-3.5 w-3.5" /> WhatsApp</button><button onClick={() => deleteExpense(expense.id)} type="button" className="text-xs text-rose-600">Delete</button></div></div></article>)}</div>
            </form>

            <section className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Balances & settlements</h2>
                <div className="mt-3 space-y-2">{balances.balances.map((balance) => <div key={balance.membership_id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"><span className="flex items-center gap-2 text-sm">{Number(balance.balance) < 0 ? <ArrowDownLeft className="h-4 w-4 text-rose-600" /> : <ArrowUpRight className="h-4 w-4 text-emerald-600" />}{balance.name}</span><strong className={Number(balance.balance) < 0 ? 'text-rose-700' : 'text-emerald-700'}>{money.format(Number(balance.balance))}</strong></div>)}</div>
                {balances.suggested_transfers.length > 0 && <div className="mt-4 space-y-2"><h3 className="text-sm font-semibold">Suggested transfers</h3>{balances.suggested_transfers.map((transfer) => <div key={`${transfer.from_membership_id}-${transfer.to_membership_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 p-3 text-sm"><span>{transfer.from_name} → {transfer.to_name}: <strong>{money.format(Number(transfer.amount))}</strong></span><button onClick={() => createSettlement(transfer)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Record</button></div>)}</div>}
                <div className="mt-4 space-y-2">{settlements.map((settlement) => <div key={settlement.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm"><span>{settlement.from_member.name} → {settlement.to_member.name} · {money.format(Number(settlement.amount))}<span className="ml-2 text-xs text-slate-500">{settlement.is_settled ? 'Settled' : 'Pending'}</span></span>{!settlement.is_settled && <button onClick={() => markSettled(settlement.id)} className="rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-700">Mark paid</button>}</div>)}</div>
              </div>

              <section className="flex min-h-105 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-indigo-600" /><div><h2 className="font-semibold">Group chat</h2><p className="text-xs text-slate-500">Messages are saved · <span className={connection === 'connected' ? 'text-emerald-600' : connection === 'fallback' ? 'text-rose-600' : 'text-amber-600'}>{connection === 'connected' ? 'live' : connection === 'fallback' ? 'backup mode · live server unavailable' : connection === 'polling' ? 'backup mode · retrying live connection' : connection}</span></p></div></div>{connection === 'fallback' && <button type="button" onClick={() => setReconnectKey((key) => key + 1)} className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Retry live</button>}</header>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {olderBefore && <button onClick={loadOlderMessages} className="w-full rounded-lg bg-slate-50 py-2 text-xs font-medium text-indigo-700">Load older messages</button>}
                  {!messages.length && <p className="py-12 text-center text-sm text-slate-500">Start the conversation.</p>}
                  {messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${message.sender_id === user?.id ? 'ml-auto bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}><p className="mb-1 text-xs font-semibold opacity-75">{message.sender_name}</p>{message.message_type === 'EXPENSE' ? <div className="rounded-xl border border-current/15 bg-white/10 p-3"><p className="font-semibold">{message.expense_title || message.text}</p>{message.expense_amount && <p className="mt-1">{money.format(Number(message.expense_amount))}</p>}{message.expense_id && <button type="button" onClick={() => openChatExpense(message.expense_id)} className="mt-2 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold underline">View expense</button>}</div> : <p className="whitespace-pre-wrap wrap-break-word">{message.text}</p>}<time className="mt-1 block text-right text-[10px] opacity-70">{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-100 p-3"><textarea maxLength={2000} rows={1} value={messageText} onChange={(event) => setMessageText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder="Write a message…" className="min-w-0 flex-1 resize-y rounded-xl border border-slate-300 px-3 py-2" /><button disabled={!messageText.trim()} aria-label="Send message" className="rounded-xl bg-indigo-600 px-4 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button></form>
              </section>
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
