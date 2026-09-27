import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

export default function BudgetPage() {
  const { language, t } = useLanguage();
  const localizedMoney = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const today = new Date();
  const [budget, setBudget] = useState({ amount: 0, month: today.getMonth() + 1, year: today.getFullYear() });
  const [categoryBudgets, setCategoryBudgets] = useState([]);
  const [dashboard, setDashboard] = useState({ monthly_budget: 0, current_month_expense: 0, budget_remaining: 0 });
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [budgetRes, dashboardRes, categoryRes] = await Promise.all([
        api.get('/budgets/'),
        api.get('/dashboard/'),
        api.get('/category-budgets/'),
      ]);

      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      const currentBudget = budgetRes.data.find((item) => Number(item.month) === currentMonth && Number(item.year) === currentYear) || { amount: 0, month: currentMonth, year: currentYear };

      setBudget(currentBudget);
      setAmount(String(currentBudget.amount || ''));
      setDashboard(dashboardRes.data);
      setCategoryBudgets(categoryRes.data.filter((item) => Number(item.month) === currentMonth && Number(item.year) === currentYear));
    } catch (err) {
      console.error('Budget load failed', err);
      setError('Unable to load budget data.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalCategoryBudget = useMemo(
    () => categoryBudgets.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [categoryBudgets],
  );

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        month: budget.month || today.getMonth() + 1,
        year: budget.year || today.getFullYear(),
        amount: Number(amount),
      };

      if (budget.id) {
        await api.put(`/budgets/${budget.id}/`, payload);
      } else {
        await api.post('/budgets/', payload);
      }

      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to save monthly budget.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t('Monthly budget')}</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-indigo-50 p-4">
            <p className="text-sm text-indigo-700">{t('Monthly budget')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{localizedMoney.format(Number(dashboard.monthly_budget || 0))}</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-sm text-amber-700">{t('Spent')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{localizedMoney.format(Number(dashboard.current_month_expense || 0))}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-emerald-700">{t('Remaining')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{localizedMoney.format(Number(dashboard.budget_remaining || 0))}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">{t('Set budget')}</h2>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Budget amount')}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 focus:border-indigo-400" required />
          </div>
          <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-400">
            {saving ? t('Saving...') : t('Save monthly budget')}
          </button>
          {error && <p className="mt-3 text-sm text-rose-600">{t(error)}</p>}
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">{t('Category budgets')}</h2>
          {categoryBudgets.length === 0 ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">{t('No category budget limits have been set yet.')}</div>
          ) : (
            <div className="mt-4 space-y-4">
              {categoryBudgets.map((item) => {
                const total = Number(item.amount || 0);
                const percent = total > 0 ? Math.min(100, 100) : 0;
                return (
                  <div key={item.id}>
                    <div className="mb-1 flex justify-between text-sm text-slate-600">
                      <span>{item.category_name}</span>
                      <span>{localizedMoney.format(total)}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100">
                      <div className="h-2.5 rounded-full bg-indigo-600" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-slate-100 pt-3 text-sm text-slate-600">
                {t('Total category budget: ')}<span className="font-semibold text-slate-900">{localizedMoney.format(totalCategoryBudget)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
