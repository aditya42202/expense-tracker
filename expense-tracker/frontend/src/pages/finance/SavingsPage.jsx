import { useEffect, useState } from 'react';
import { Check, CirclePlus, Pencil, PiggyBank, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

const emptyForm = { name: '', target_amount: '', current_amount: '0', target_date: '', description: '' };

export default function SavingsPage() {
  const { language, t } = useLanguage();
  const currency = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
  const formatMoney = (amount) => currency.format(Number(amount) || 0);
  const [goals, setGoals] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingGoal, setEditingGoal] = useState(null);
  const [contributionAmounts, setContributionAmounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadGoals = async () => {
    setError('');
    try {
      const { data } = await api.get('/goals/');
      setGoals(data);
    } catch (requestError) {
      console.error('Failed to load savings goals:', requestError);
      setError(t('Could not load savings goals. Please retry.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api.get('/goals/')
      .then(({ data }) => {
        if (active) setGoals(data);
      })
      .catch((requestError) => {
        console.error('Failed to load savings goals:', requestError);
        if (active) setError(t('Could not load savings goals. Please retry.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [t]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingGoal(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        target_amount: Number(form.target_amount),
        current_amount: Number(form.current_amount),
        target_date: form.target_date || null,
      };
      if (!payload.name.trim() || !Number.isFinite(payload.target_amount) || payload.target_amount <= 0
        || !Number.isFinite(payload.current_amount) || payload.current_amount < 0) {
        setError(t('Enter a goal name, a target above zero, and valid current savings.'));
        return;
      }
      if (editingGoal) {
        await api.patch(`/goals/${editingGoal}/`, payload);
        setNotice(t('Savings goal updated.'));
      } else {
        await api.post('/goals/', payload);
        setNotice(t('Savings goal created.'));
      }
      resetForm();
      await loadGoals();
    } catch (requestError) {
      console.error('Failed to save savings goal:', requestError);
      setError(t('Could not save this goal. Check the details and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (goal) => {
    setEditingGoal(goal.id);
    setForm({
      name: goal.name,
      target_amount: String(goal.target_amount),
      current_amount: String(goal.current_amount),
      target_date: goal.target_date || '',
      description: goal.description || '',
    });
    setError('');
    setNotice('');
  };

  const addContribution = async (goal) => {
    const amount = Number(contributionAmounts[goal.id]);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('Enter a contribution greater than zero.'));
      return;
    }
    setError('');
    setNotice('');
    try {
      await api.post(`/goals/${goal.id}/add-money/`, { amount });
      setContributionAmounts((values) => ({ ...values, [goal.id]: '' }));
      setNotice(t('Savings contribution recorded. No income or expense transaction was changed.'));
      await loadGoals();
    } catch (requestError) {
      console.error('Failed to add savings contribution:', requestError);
      setError(t('Could not add this contribution. Please try again.'));
    }
  };

  const deleteGoal = async (goal) => {
    if (!window.confirm(t(`Delete the savings goal “${goal.name}”?`))) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/goals/${goal.id}/`);
      if (editingGoal === goal.id) resetForm();
      setNotice(t('Savings goal deleted.'));
      await loadGoals();
    } catch (requestError) {
      console.error('Failed to delete savings goal:', requestError);
      setError(t('Could not delete this goal. Please try again.'));
    }
  };

  const activeGoals = goals.filter((goal) => !goal.is_completed);
  const completedGoals = goals.filter((goal) => goal.is_completed);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-linear-to-r from-emerald-700 to-teal-600 p-6 text-white shadow-sm sm:p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-100">{t('Savings')}</p>
        <h1 className="mt-2 text-3xl font-bold">{t('Build your financial cushion')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-emerald-50">{t('Set a target, track contributions, and see the pace needed to reach your goal.')}</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><CirclePlus className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold text-slate-950">{t(editingGoal ? 'Edit savings goal' : 'Create a savings goal')}</h2>
            <p className="text-sm text-slate-500">{t('Goal contributions are tracked separately and never change your transactions.')}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-medium text-slate-700">
            {t('Goal name')}
            <input required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            {t('Target amount')}
            <input required min="0.01" step="0.01" type="number" value={form.target_amount} onChange={(event) => setForm({ ...form, target_amount: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            {t('Already saved')}
            <input min="0" step="0.01" type="number" value={form.current_amount} onChange={(event) => setForm({ ...form, current_amount: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            {t('Target date')}
            <input type="date" value={form.target_date} onChange={(event) => setForm({ ...form, target_date: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-1">
            {t('Description')}
            <input maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
          </label>
          <div className="flex gap-2 sm:col-span-2 xl:col-span-5">
            <button disabled={saving} type="submit" className="min-h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
              {saving ? t('Saving...') : t(editingGoal ? 'Save changes' : 'Create goal')}
            </button>
            {editingGoal && <button type="button" onClick={resetForm} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">{t('Cancel')}</button>}
          </div>
        </form>
      </section>

      {loading ? <p role="status" className="text-sm text-slate-500">{t('Loading savings goals...')}</p> : (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-950">{t('Active goals')}</h2>
            {activeGoals.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {activeGoals.map((goal) => (
                  <article key={goal.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><PiggyBank className="h-5 w-5" /></span>
                        <div className="min-w-0"><h3 className="truncate font-semibold text-slate-950">{goal.name}</h3><p className="text-xs text-slate-500">{goal.target_date || t('No target date')}</p></div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => startEditing(goal)} aria-label={t(`Edit ${goal.name}`)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => deleteGoal(goal)} aria-label={t(`Delete ${goal.name}`)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {goal.description && <p className="mt-3 text-sm text-slate-600">{goal.description}</p>}
                    <div className="mt-4 flex justify-between text-sm"><span className="text-slate-500">{t('Saved')} {formatMoney(goal.current_amount)}</span><span className="font-medium text-slate-800">{formatMoney(goal.target_amount)}</span></div>
                    <div className="mt-2 h-2.5 rounded-full bg-slate-100" role="progressbar" aria-label={`${goal.name} ${t('progress')}`} aria-valuenow={Math.round(goal.progress)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-2.5 rounded-full bg-emerald-600 transition-all" style={{ width: `${Math.min(goal.progress || 0, 100)}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-medium text-emerald-800">{goal.progress}% · {t('Remaining')}: {formatMoney(goal.remaining_amount)}</p>
                    {goal.required_monthly_savings != null && goal.required_weekly_savings != null ? (
                      <p className="mt-1 text-xs text-slate-500">{t('To meet your date')}: {formatMoney(goal.required_monthly_savings)} / {t('month')} · {formatMoney(goal.required_weekly_savings)} / {t('week')}</p>
                    ) : <p className="mt-1 text-xs text-slate-500">{t('Add a future target date to calculate a savings pace.')}</p>}
                    <div className="mt-4 flex gap-2">
                      <input type="number" min="0.01" step="0.01" value={contributionAmounts[goal.id] || ''} onChange={(event) => setContributionAmounts((values) => ({ ...values, [goal.id]: event.target.value }))} aria-label={`${t('Contribution amount')} for ${goal.name}`} placeholder={t('Contribution')} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
                      <button type="button" onClick={() => addContribution(goal)} className="min-h-10 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700">{t('Add savings')}</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t('No active savings goals yet. Create one above to get started.')}</p>}
          </section>
          {completedGoals.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-950">{t('Completed goals')}</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {completedGoals.map((goal) => (
                  <article key={goal.id} className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div><h3 className="font-semibold text-emerald-950">{goal.name}</h3><p className="mt-1 text-sm text-emerald-800">{formatMoney(goal.current_amount)} / {formatMoney(goal.target_amount)}</p></div>
                    <Check className="h-5 w-5 shrink-0 text-emerald-700" aria-label={t('Completed')} />
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
