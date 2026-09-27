import { useEffect, useState } from 'react';
import { PencilLine, Plus, Search, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

const paymentOptions = ['Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Wallet', 'Other'];

export default function IncomePage() {
  const { language, t } = useLanguage();
  const localizedMoney = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const [income, setIncome] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ id: null, category: '', amount: '', description: '', date: new Date().toISOString().slice(0, 10), payment_method: 'UPI' });

  const loadData = async () => {
    try {
      const [incomeRes, categoryRes] = await Promise.all([
        api.get('/income/'),
        api.get('/categories/'),
      ]);
      setIncome(incomeRes.data);
      setCategories(categoryRes.data.filter((item) => item.type === 'INCOME'));
    } catch {
      setError('Unable to load income records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredIncome = income.filter((item) => {
    const search = query.trim().toLowerCase();
    if (!search) return true;
    return [item.category_name, item.description, item.payment_method].join(' ').toLowerCase().includes(search);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        category: Number(form.category),
        amount: Number(form.amount),
        description: form.description,
        date: form.date,
        payment_method: form.payment_method,
      };

      if (form.id) {
        await api.put(`/income/${form.id}/`, payload);
      } else {
        await api.post('/income/', payload);
      }

      setForm({ id: null, category: '', amount: '', description: '', date: new Date().toISOString().slice(0, 10), payment_method: 'UPI' });
      loadData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to save income record.');
    }
  };

  const handleEdit = (item) => {
    setForm({
      id: item.id,
      category: item.category,
      amount: item.amount,
      description: item.description || '',
      date: item.date,
      payment_method: item.payment_method,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this income record?')) return;
    try {
      await api.delete(`/income/${id}/`);
      loadData();
    } catch {
      setError('Unable to delete income record.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">{t('Cashflow')}</p>
            <h1 className="text-3xl font-bold text-slate-900">{t('Income')}</h1>
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
            <Plus className="h-4 w-4" /> {t('Add income')}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">{t(form.id ? 'Edit income' : 'Add income')}</h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Category')}</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:border-emerald-400" required>
              <option value="">{t('Select category')}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Amount')}</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:border-emerald-400" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Description')}</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:border-emerald-400" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('Date')}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:border-emerald-400" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('Payment method')}</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus:border-emerald-400" required>
                {paymentOptions.map((method) => <option key={method} value={method}>{t(method)}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
            {t(form.id ? 'Update income' : 'Save income')}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search income')} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm focus:border-emerald-400" />
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-slate-500">{t('Loading income...')}</div>
          ) : error ? (
            <div className="py-10 text-center text-rose-600">{t(error)}</div>
          ) : filteredIncome.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-lg font-semibold text-slate-900">{t('No income records')}</p>
              <p className="mt-1 text-sm text-slate-500">{t('Create your first income source.')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIncome.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{item.category_name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{item.description || t('Income entry')}</p>
                    </div>
                    <span className="text-lg font-bold text-emerald-600">{localizedMoney.format(Number(item.amount))}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>{item.date}</span>
                    <span>{item.payment_method}</span>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => handleEdit(item)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"><PencilLine className="h-4 w-4" /></button>
                    <button type="button" onClick={() => handleDelete(item.id)} className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
