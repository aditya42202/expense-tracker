import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

const paymentOptions = ['Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Wallet', 'Other'];

export default function DailyExpensesPage({ onExpenseChange = () => {} }) {
  const { language, t } = useLanguage();
  const localizedMoney = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const [categories, setCategories] = useState([]);
  const [people, setPeople] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [newPersonName, setNewPersonName] = useState('');
  const [summary, setSummary] = useState({ today_expense: 0, current_month_expense: 0, monthly_budget: 0, budget_remaining: 0 });
  const [form, setForm] = useState({ amount: '', category: '', person: '', description: '', date: new Date().toISOString().slice(0, 10), payment_method: 'UPI' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    try {
      const [categoryRes, dashboardRes, peopleRes, expenseRes] = await Promise.all([
        api.get('/categories/'),
        api.get('/dashboard/'),
        api.get('/people/'),
        api.get('/expenses/'),
      ]);
      setCategories(categoryRes.data.filter((item) => item.type === 'EXPENSE'));
      setPeople(peopleRes.data);
      setExpenses(expenseRes.data);
      setSummary({
        today_expense: dashboardRes.data.today_expense || 0,
        current_month_expense: dashboardRes.data.current_month_expense || 0,
        monthly_budget: dashboardRes.data.monthly_budget || 0,
        budget_remaining: dashboardRes.data.budget_remaining || 0,
      });
    } catch (error) {
      console.error('Category load failed', error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedDateExpenses = expenses.filter((expense) => expense.date === form.date);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await api.post('/expenses/', {
        ...form,
        amount: Number(form.amount),
        category: Number(form.category),
        person: form.person ? Number(form.person) : null,
      });
      onExpenseChange();
      setMessage('Expense added successfully.');
      setForm({ amount: '', category: '', person: '', description: '', date: new Date().toISOString().slice(0, 10), payment_method: 'UPI' });
      await loadData();
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Unable to save expense.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPerson = async () => {
    const name = newPersonName.trim();
    if (!name) return;
    try {
      const { data } = await api.post('/people/', { name });
      setPeople((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((current) => ({ ...current, person: String(data.id) }));
      setNewPersonName('');
      setMessage('Person added.');
    } catch (error) {
      setMessage(error.response?.data?.name?.[0] || 'Unable to add person.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white shadow-lg">
        <p className="text-sm uppercase tracking-[0.2em] text-indigo-100">{t('Daily Expense')}</p>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="mt-2 text-3xl font-bold">{t('Track today’s spending')}</h1><p className="mt-2 text-sm text-indigo-100">{t('Personal expense ya group expense, dono yahin se add karein.')}</p></div><Link to="/group-expenses" className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50">{t('Add group expense')}</Link></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('Amount')}</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('Category')}</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" required>
                <option value="">{t('Select category')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Description')}</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder={t('Potato + Onion')} required />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Paid by')}</label>
            <select value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" required>
              <option value="">{t('Select who paid')}</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <div className="mt-2 flex gap-2">
              <input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} placeholder={t("Add person's name")} maxLength={200} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              <button type="button" onClick={handleAddPerson} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{t('Add person')}</button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('Date')}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('Payment Method')}</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" required>
                {paymentOptions.map((method) => (
                  <option key={method} value={method}>{t(method)}</option>
                ))}
              </select>
            </div>
          </div>

          {message && <p className="text-sm text-slate-600">{t(message)}</p>}

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-400">
            {loading ? t('Saving...') : t('Add Expense')}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">{t('Today’s Snapshot')}</h2>
          <div className="mt-5 space-y-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">{t('Today’s total')}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{localizedMoney.format(Number(summary.today_expense || 0))}</p>
            </div>
            <div className="rounded-xl bg-sky-50 p-4">
              <p className="text-sm text-sky-700">{t('Spent this month')}</p>
              <p className="mt-2 text-2xl font-bold text-sky-900">{localizedMoney.format(Number(summary.current_month_expense || 0))}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">{t('Monthly budget')}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-800">{localizedMoney.format(Number(summary.monthly_budget || 0))}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-sm text-amber-700">{t('Remaining')}</p>
              <p className="mt-2 text-2xl font-bold text-amber-800">{localizedMoney.format(Number(summary.budget_remaining || 0))}</p>
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('Expenses for ')}{form.date}</h2>
            <p className="text-sm text-slate-500">{selectedDateExpenses.length} {t(selectedDateExpenses.length === 1 ? 'expense' : 'expenses')}</p>
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {t('Total: ')}{localizedMoney.format(selectedDateExpenses.reduce((total, expense) => total + Number(expense.amount), 0))}
          </p>
        </div>

        {selectedDateExpenses.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{t('No expenses recorded for this date.')}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-3">{t('Paid by')}</th>
                  <th className="px-3 py-3">{t('Description')}</th>
                  <th className="px-3 py-3">{t('Category')}</th>
                  <th className="px-3 py-3">{t('Payment')}</th>
                  <th className="px-3 py-3 text-right">{t('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {selectedDateExpenses.map((expense) => (
                  <tr key={expense.id} className="border-t border-slate-200">
                    <td className="px-3 py-3 font-medium text-slate-900">{expense.person_name || '-'}</td>
                    <td className="px-3 py-3">{expense.description || '-'}</td>
                    <td className="px-3 py-3">{expense.category_name}</td>
                    <td className="px-3 py-3">{expense.payment_method}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">{localizedMoney.format(Number(expense.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
