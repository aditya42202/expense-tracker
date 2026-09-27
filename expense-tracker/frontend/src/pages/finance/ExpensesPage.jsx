import { useEffect, useMemo, useState } from 'react';
import { PencilLine, Plus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

const paymentOptions = ['Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Wallet', 'Other'];

export default function ExpensesPage({ onExpenseChange = () => {} }) {
  const { language, t } = useLanguage();
  const localizedMoney = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const localizedPreciseMoney = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [people, setPeople] = useState([]);
  const [newPersonName, setNewPersonName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [form, setForm] = useState({ id: null, category: '', person: '', amount: '', description: '', date: new Date().toISOString().slice(0, 10), payment_method: 'UPI' });

  const loadData = async () => {
    try {
      const [expenseRes, categoryRes, peopleRes] = await Promise.all([
        api.get('/expenses/'),
        api.get('/categories/'),
        api.get('/people/'),
      ]);
      setExpenses(expenseRes.data);
      setCategories(categoryRes.data.filter((item) => item.type === 'EXPENSE'));
      setPeople(peopleRes.data);
      setError('');
    } catch {
      setError('Unable to load expenses. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredExpenses = useMemo(() => {
    const list = [...expenses].filter((item) => {
      const matchesQuery = !query || [item.description, item.category_name, item.person_name, item.payment_method].join(' ').toLowerCase().includes(query.toLowerCase());
      return matchesQuery;
    });

    switch (sort) {
      case 'oldest':
        return list.sort((a, b) => new Date(a.date) - new Date(b.date));
      case 'highest':
        return list.sort((a, b) => Number(b.amount) - Number(a.amount));
      case 'lowest':
        return list.sort((a, b) => Number(a.amount) - Number(b.amount));
      default:
        return list.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  }, [expenses, query, sort]);

  const personTotals = useMemo(() => people.map((person) => {
    const personExpenses = expenses.filter((expense) => expense.person === person.id);
    return {
      ...person,
      count: personExpenses.length,
      total: personExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
    };
  }), [expenses, people]);

  const settlement = useMemo(() => {
    const totalCents = personTotals.reduce((sum, person) => sum + Math.round(person.total * 100), 0);
    const baseShareCents = personTotals.length ? Math.floor(totalCents / personTotals.length) : 0;
    let remainingShareCents = personTotals.length ? totalCents % personTotals.length : 0;
    const peopleWithBalances = personTotals.map((person) => {
      const equalShareCents = baseShareCents + (remainingShareCents > 0 ? 1 : 0);
      remainingShareCents = Math.max(0, remainingShareCents - 1);
      const paidCents = Math.round(person.total * 100);
      const balanceCents = paidCents - equalShareCents;
      return { ...person, equalShare: equalShareCents / 100, balance: balanceCents / 100, balanceCents };
    });

    const creditors = peopleWithBalances
      .filter((person) => person.balanceCents > 0)
      .map((person) => ({ name: person.name, remainingCents: person.balanceCents }));
    const debtors = peopleWithBalances
      .filter((person) => person.balanceCents < 0)
      .map((person) => ({ name: person.name, remainingCents: Math.abs(person.balanceCents) }));
    const transfers = [];
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const amountCents = Math.min(debtors[debtorIndex].remainingCents, creditors[creditorIndex].remainingCents);
      transfers.push({
        from: debtors[debtorIndex].name,
        to: creditors[creditorIndex].name,
        amount: amountCents / 100,
      });
      debtors[debtorIndex].remainingCents -= amountCents;
      creditors[creditorIndex].remainingCents -= amountCents;
      if (debtors[debtorIndex].remainingCents === 0) debtorIndex += 1;
      if (creditors[creditorIndex].remainingCents === 0) creditorIndex += 1;
    }

    return { people: peopleWithBalances, transfers };
  }, [personTotals]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        category: Number(form.category),
        person: form.person ? Number(form.person) : null,
        amount: Number(form.amount),
        description: form.description,
        date: form.date,
        payment_method: form.payment_method,
      };

      if (form.id) {
        await api.put(`/expenses/${form.id}/`, payload);
      } else {
        await api.post('/expenses/', payload);
      }

      onExpenseChange();
      setForm({ id: null, category: '', person: '', amount: '', description: '', date: new Date().toISOString().slice(0, 10), payment_method: 'UPI' });
      loadData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to save expense.');
    }
  };

  const handleAddPerson = async (e) => {
    e.preventDefault();
    const name = newPersonName.trim();
    if (!name) return;
    try {
      const { data } = await api.post('/people/', { name });
      setPeople((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((current) => ({ ...current, person: String(data.id) }));
      setNewPersonName('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.name?.[0] || 'Unable to add person.');
    }
  };

  const handleDeletePerson = async (person) => {
    const confirmed = window.confirm(
      `${t('Delete ')}${person.name}? ${t('Their expenses will remain, but the payer name will be removed.')}`,
    );
    if (!confirmed) return;

    try {
      await api.delete(`/people/${person.id}/`);
      setPeople((current) => current.filter((item) => item.id !== person.id));
      setExpenses((current) => current.map((expense) => (
        expense.person === person.id
          ? { ...expense, person: null, person_name: null }
          : expense
      )));
      if (String(form.person) === String(person.id)) {
        setForm((current) => ({ ...current, person: '' }));
      }
      setError('');
    } catch {
      setError('Unable to delete person. Please try again.');
    }
  };

  const handleEdit = (item) => {
    setForm({
      id: item.id,
      category: item.category,
      person: item.person ? String(item.person) : '',
      amount: item.amount,
      description: item.description || '',
      date: item.date,
      payment_method: item.payment_method,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('Delete this expense?'))) return;
    try {
      await api.delete(`/expenses/${id}/`);
      onExpenseChange();
      loadData();
    } catch {
      setError('Unable to delete expense.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">{t('Expense tracking')}</p>
            <h1 className="text-3xl font-bold text-slate-900">{t('Expenses')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('Personal expenses ke saath group expenses bhi manage karein.')}</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link to="/group-expenses" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#287253] bg-[#e8f3ee] px-4 py-2.5 text-sm font-semibold text-[#287253] hover:bg-[#d8eee3]">{t('Add group expense')}</Link><Link to="/daily-expenses" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> {t('Add expense')}</Link></div>
        </div>
      </div>

      {personTotals.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('Equal split settlement')}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t('Payer-assigned expenses are split across all ')}{people.length}{t(' listed people, including anyone who paid nothing.')}
            </p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">{t('Person')}</th>
                  <th className="px-3 py-2">{t('Expenses')}</th>
                  <th className="px-3 py-2 text-right">{t('Paid')}</th>
                  <th className="px-3 py-2 text-right">{t('Equal share')}</th>
                  <th className="px-3 py-2 text-right">{t('Settlement')}</th>
                  <th className="px-3 py-2 text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {settlement.people.map((person) => (
                  <tr key={person.id} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-medium text-slate-900">{person.name}</td>
                    <td className="px-3 py-2 text-slate-600">{person.count}</td>
                    <td className="px-3 py-2 text-right text-slate-900">{localizedPreciseMoney.format(person.total)}</td>
                    <td className="px-3 py-2 text-right text-slate-900">{localizedPreciseMoney.format(person.equalShare)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${person.balance > 0.005 ? 'text-emerald-700' : person.balance < -0.005 ? 'text-rose-700' : 'text-slate-600'}`}>
                      {person.balance > 0.005
                        ? `${t('Receives ')}${localizedPreciseMoney.format(person.balance)}`
                        : person.balance < -0.005
                          ? `${t('Owes ')}${localizedPreciseMoney.format(Math.abs(person.balance))}`
                          : t('Settled')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeletePerson(person)}
                        className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100"
                        aria-label={`${t('Delete ')}${person.name}`}
                        title={`${t('Delete ')}${person.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="text-base font-semibold text-slate-900">{t('Who pays whom')}</h3>
            {settlement.transfers.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t('Everyone is settled. No payments are due.')}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">{t('Person who pays')}</th>
                      <th className="px-3 py-2">{t('Person who receives')}</th>
                      <th className="px-3 py-2 text-right">{t('Amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlement.transfers.map((transfer, index) => (
                      <tr key={`${transfer.from}-${transfer.to}-${index}`} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-medium text-slate-900">{transfer.from}</td>
                        <td className="px-3 py-2 text-slate-700">{transfer.to}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{localizedPreciseMoney.format(transfer.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">{t(form.id ? 'Edit expense' : 'Create expense')}</h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Category')}</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 focus:border-indigo-400" required>
              <option value="">{t('Select category')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Paid by')}</label>
            <select value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 focus:border-indigo-400" required>
              <option value="">{t('Select who paid')}</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <div className="mt-2 flex gap-2">
              <input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} placeholder={t("Add person's name")} maxLength={200} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400" />
              <button type="button" onClick={handleAddPerson} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Plus className="h-4 w-4" /> {t('Add')}</button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Amount')}</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 focus:border-indigo-400" required />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('Description')}</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 focus:border-indigo-400" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('Date')}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 focus:border-indigo-400" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('Payment method')}</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 focus:border-indigo-400" required>
                {paymentOptions.map((method) => <option key={method} value={method}>{t(method)}</option>)}
              </select>
            </div>
          </div>

          <button type="submit" className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500">
            {t(form.id ? 'Update expense' : 'Save expense')}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search expenses')} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-indigo-400" />
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-400">
              <option value="newest">{t('Newest')}</option>
              <option value="oldest">{t('Oldest')}</option>
              <option value="highest">{t('Highest amount')}</option>
              <option value="lowest">{t('Lowest amount')}</option>
            </select>
          </div>

          {loading ? (
            <div className="py-10 text-center text-slate-500">{t('Loading expenses...')}</div>
          ) : error ? (
            <div className="py-10 text-center text-rose-600">{t(error)}</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-lg font-semibold text-slate-900">{t('No expenses found')}</p>
              <p className="mt-1 text-sm text-slate-500">{t('Add your first expense to start tracking spending.')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-3">{t('Date')}</th>
                    <th className="px-3 py-3">{t('Category')}</th>
                    <th className="px-3 py-3">{t('Paid by')}</th>
                    <th className="px-3 py-3">{t('Description')}</th>
                    <th className="px-3 py-3">{t('Amount')}</th>
                    <th className="px-3 py-3">{t('Payment')}</th>
                    <th className="px-3 py-3 text-right">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="px-3 py-3">{item.date}</td>
                      <td className="px-3 py-3">{item.category_name}</td>
                      <td className="px-3 py-3">{item.person_name || '-'}</td>
                      <td className="px-3 py-3">{item.description || '-'}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{localizedMoney.format(Number(item.amount))}</td>
                      <td className="px-3 py-3">{item.payment_method}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => handleEdit(item)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50" aria-label={t('Edit expense')}>
                            <PencilLine className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => handleDelete(item.id)} className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100" aria-label={t('Delete expense')}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
