import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Plus, ReceiptText, Trash2, Users } from 'lucide-react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

const today = new Date().toISOString().slice(0, 10);

const blankForm = () => ({ title: '', amount: '', date: today, category: '', participants: [], payers: [{ member: '', amount: '' }] });

export default function GroupExpensePage({ onExpenseChange = () => {} }) {
  const { language, t } = useLanguage();
  const money = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(blankForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [memberResponse, expenseResponse, historyResponse] = await Promise.all([api.get('/group-members/'), api.get('/group-expenses/'), api.get('/settlements/')]);
      setMembers(memberResponse.data);
      setExpenses(expenseResponse.data);
      setHistory(historyResponse.data);
      setForm((current) => ({ ...current, participants: current.participants.length ? current.participants : memberResponse.data.map((item) => item.id), payers: current.payers[0].member ? current.payers : [{ member: memberResponse.data[0]?.id || '', amount: '' }] }));
    } catch {
      setError('Unable to load your group workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleParticipant = (id) => setForm((current) => ({ ...current, participants: current.participants.includes(id) ? current.participants.filter((item) => item !== id) : [...current.participants, id] }));
  const updatePayer = (index, key, value) => setForm((current) => ({ ...current, payers: current.payers.map((payer, payerIndex) => payerIndex === index ? { ...payer, [key]: value } : payer) }));

  const paidTotal = useMemo(() => form.payers.reduce((sum, payer) => sum + Number(payer.amount || 0), 0), [form.payers]);
  const participantShare = form.participants.length ? Number(form.amount || 0) / form.participants.length : 0;

  const addMember = async (event) => {
    event.preventDefault();
    const name = newMemberName.trim();
    if (!name) return;
    try {
      const { data } = await api.post('/group-members/', { name });
      setMembers((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((current) => ({ ...current, participants: [...current.participants, data.id], payers: current.payers[0].member ? current.payers : [{ member: data.id, amount: '' }] }));
      setNewMemberName('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.name?.[0] || 'Unable to add group member.');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (Number(form.amount) <= 0 || !form.participants.length) {
      setError('Enter an amount greater than zero and select at least one participant.');
      return;
    }
    if (Math.abs(paidTotal - Number(form.amount)) > 0.005) {
      setError('Payer amounts must add up to the total expense.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/group-expenses/', { ...form, amount: Number(form.amount), participants: form.participants, payers: form.payers.map((payer) => ({ member: Number(payer.member), amount: Number(payer.amount) })) });
      onExpenseChange();
      setForm({ ...blankForm(), participants: members.map((item) => item.id), payers: [{ member: members[0]?.id || '', amount: '' }] });
      setMessage('Group expense saved.');
      await load();
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat()?.[0] || 'Unable to save group expense.');
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (id) => {
    if (!window.confirm(t('Delete this group expense and its settlement records?'))) return;
    await api.delete(`/group-expenses/${id}/`);
    onExpenseChange();
    load();
  };

  const settle = async (id) => { await api.post(`/settlements/${id}/mark-settled/`); load(); };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div className="rounded-2xl bg-[#173d32] p-6 text-white shadow-sm sm:p-8">
        <p className="text-sm font-medium text-emerald-100/75">{t('Shared money, made clear')}</p>
        <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="text-3xl font-semibold">{t('Group expenses')}</h1><p className="mt-2 max-w-xl text-sm text-emerald-100/70">{t('Split fairly, then see exactly who pays whom.')}</p></div><Users className="h-10 w-10 text-emerald-200/70" /></div>
      </div>
      {(error || message) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{t(error || message)}</div>}

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div><h2 className="text-lg font-semibold text-slate-950">{t('New shared expense')}</h2><p className="mt-1 text-sm text-slate-500">{t('The payer is always treated as a participant.')}</p></div>
          <input required placeholder={t('Expense title or description')} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
          <div className="grid gap-4 sm:grid-cols-2"><input required type="number" min="0.01" step="0.01" placeholder={t('Amount')} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" /><input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" /></div>
          <input placeholder={t('Category (optional)')} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
          <fieldset><div className="flex items-center justify-between gap-3"><legend className="text-sm font-semibold text-slate-800">{t('Participants')}</legend><button type="button" onClick={() => setForm((current) => ({ ...current, participants: members.map((member) => member.id) }))} className="text-xs font-semibold text-[#287253] hover:text-[#173d32]">{t('Select all')} ({members.length})</button></div><p className="mt-1 text-xs text-slate-500">{form.participants.length} {t('people included · each share is ')}{money.format(participantShare)}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{members.map((member) => <label key={member.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><input type="checkbox" checked={form.participants.includes(member.id)} onChange={() => toggleParticipant(member.id)} />{member.name}</label>)}</div><div className="mt-2 flex gap-2"><input value={newMemberName} onChange={(event) => setNewMemberName(event.target.value)} placeholder={t('Add group member')} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /><button type="button" onClick={addMember} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Plus className="h-4 w-4" /> {t('Add')}</button></div></fieldset>
          <fieldset><div className="flex items-center justify-between"><legend className="text-sm font-semibold text-slate-800">{t('Paid by')}</legend><span className="text-xs text-slate-500">{money.format(paidTotal)} / {money.format(Number(form.amount || 0))}</span></div><div className="mt-2 space-y-2">{form.payers.map((payer, index) => <div key={index} className="flex gap-2"><select required value={payer.member} onChange={(event) => updatePayer(index, 'member', event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><option value="">{t('Select payer')}</option>{members.filter((member) => form.participants.includes(member.id)).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><input required type="number" min="0" step="0.01" placeholder={t('Paid')} value={payer.amount} onChange={(event) => updatePayer(index, 'amount', event.target.value)} className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />{form.payers.length > 1 && <button type="button" onClick={() => setForm((current) => ({ ...current, payers: current.payers.filter((_, payerIndex) => payerIndex !== index) }))} className="rounded-xl border border-rose-200 p-2 text-rose-600" aria-label={t('Remove payer')}><Trash2 className="h-4 w-4" /></button>}</div>)}</div><button type="button" onClick={() => setForm((current) => ({ ...current, payers: [...current.payers, { member: '', amount: '' }] }))} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#287253]"><Plus className="h-4 w-4" /> {t('Add another payer')}</button></fieldset>
          <button disabled={saving || loading} className="w-full rounded-xl bg-[#173d32] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? t('Saving...') : t('Save group expense')}</button>
        </form>

        <section className="space-y-5">{loading ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading group expenses...</div> : expenses.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center"><ReceiptText className="h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-slate-800">No shared expenses yet</p><p className="mt-1 text-sm text-slate-500">Create one to see the settlement plan.</p></div> : expenses.map((expense) => <article key={expense.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{expense.date} {expense.category && `· ${expense.category}`}</p><h2 className="mt-1 text-lg font-semibold text-slate-950">{expense.title}</h2></div><button onClick={() => deleteExpense(expense.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${expense.title}`}><Trash2 className="h-4 w-4" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Total expense</p><p className="mt-1 font-semibold">{money.format(expense.amount)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Per-person share</p><p className="mt-1 font-semibold">{money.format(expense.participant_details[0]?.share || 0)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Participants</p><p className="mt-1 font-semibold">{expense.participant_details.length}</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{expense.participant_details.map((person) => <div key={person.id} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between gap-3"><span className="font-semibold text-slate-900">{person.name}</span><span className={`text-sm font-semibold ${person.status === 'receive' ? 'text-emerald-700' : person.status === 'pay' ? 'text-rose-700' : 'text-slate-500'}`}>{person.status === 'receive' ? 'Receives' : person.status === 'pay' ? 'Owes' : 'Settled'} {money.format(Math.abs(person.net))}</span></div><p className="mt-1 text-xs text-slate-500">Paid {money.format(person.paid)} · Share {money.format(person.share)}</p></div>)}</div><div className="mt-5 border-t border-slate-100 pt-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">Who pays whom</h3><p className="mt-1 text-xs text-slate-500">Each row shows the exact payment needed to settle this expense.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{expense.settlements.length} payment{expense.settlements.length === 1 ? '' : 's'}</span></div>{expense.settlements.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{expense.settlements.map((transfer) => <div key={transfer.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">Pays</p><p className="mt-1 font-semibold text-slate-950">{transfer.from}</p></div><ArrowRight className="h-5 w-5 shrink-0 text-slate-400" /><div className="text-right"><p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Receives</p><p className="mt-1 font-semibold text-slate-950">{transfer.to}</p></div></div><p className="mt-3 border-t border-slate-100 pt-3 text-right text-lg font-bold text-[#287253]">{money.format(transfer.amount)}</p></div>)}</div> : <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">Everyone is settled. No payment is due.</p>}</div></article>)}</section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Check className="h-5 w-5 text-[#287253]" /><h2 className="text-lg font-semibold text-slate-950">{t('Settlement history')}</h2></div>{history.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t('Settlements will appear here after a group expense is created.')}</p> : <div className="mt-4 divide-y divide-slate-100">{history.map((item) => <div key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-900">{item.from_name} {t('paid')} {item.to_name} {money.format(item.amount)}</p><p className="text-xs text-slate-500">{item.expense_name} · {item.date}</p></div>{item.status === 'SETTLED' ? <span className="text-xs font-semibold text-emerald-700">{t('Settled')}</span> : <button onClick={() => settle(item.id)} className="inline-flex items-center gap-1 self-start rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 sm:self-auto"><Check className="h-3.5 w-3.5" /> {t('Mark paid')}</button>}</div>)}</div>}</section>
    </div>
  );
}