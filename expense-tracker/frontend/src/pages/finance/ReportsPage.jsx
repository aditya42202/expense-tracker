import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

function csvCell(value) {
  const text = String(value ?? '');
  const safeText = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export default function ReportsPage() {
  const { language, t } = useLanguage();
  const localizedMoney = useMemo(() => new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), [language]);
  const [report, setReport] = useState({
    summary: { total_income: 0, total_expense: 0, balance: 0, monthly_budget: 0, budget_remaining: 0 },
    category_breakdown: [],
    monthly_trend: [],
    recent_transactions: [],
  });
  const [groupExpenses, setGroupExpenses] = useState([]);
  const [groupExpensesLoading, setGroupExpensesLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/reports/')
      .then(({ data }) => setReport(data))
      .catch((error) => console.error('Reports fetch failed:', error));
    api.get('/group-expenses/')
      .then(({ data }) => setGroupExpenses(data))
      .catch((error) => console.error('Group expense report fetch failed:', error))
      .finally(() => setGroupExpensesLoading(false));
  }, []);

  const expenseRows = useMemo(() => groupExpenses.flatMap((expense) => {
    const participants = expense.participant_details || [];
    return participants.map((participant) => {
      const outgoing = (expense.settlements || []).filter((settlement) => settlement.from === participant.name);
      return {
        expenseId: expense.id,
        name: participant.name,
        paid: Number(participant.paid || 0),
        description: expense.title,
        due: outgoing.reduce((sum, settlement) => sum + Number(settlement.amount || 0), 0),
        transfers: outgoing.map((settlement) => `${settlement.from} → ${settlement.to}: ${localizedMoney.format(Number(settlement.amount || 0))}`).join('; ') || t('No payment due'),
      };
    });
  }), [groupExpenses, localizedMoney, t]);

  const reportIsFinal = groupExpenses.length > 0 && groupExpenses.every((expense) =>
    (expense.settlements || []).every((settlement) => settlement.status === 'SETTLED'));

  const downloadExpenseReport = () => {
    const headers = ['Sr no', "Person's name", "Person's expenses", 'Expense description', 'Amount to pay', 'Who pays whom'];
    const rows = expenseRows.map((row, index) => [
      index + 1,
      row.name,
      localizedMoney.format(row.paid),
      row.description,
      localizedMoney.format(row.due),
      row.transfers,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'final-expense-report.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const stats = useMemo(() => [
    { label: 'Monthly spend', value: localizedMoney.format(Number(report.summary.total_expense || 0)), tone: 'bg-indigo-50 text-indigo-700' },
    { label: 'Savings rate', value: `${report.summary.total_income > 0 ? Math.round(((report.summary.balance || 0) / report.summary.total_income) * 100) : 0}%`, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Biggest category', value: report.category_breakdown[0]?.category__name || t('No data'), tone: 'bg-amber-50 text-amber-700' },
    { label: 'Budget left', value: localizedMoney.format(Number(report.summary.budget_remaining || 0)), tone: 'bg-violet-50 text-violet-700' },
  ], [report, localizedMoney, t]);

  const maxTrend = useMemo(() => {
    const values = report.monthly_trend.flatMap((item) => [Number(item.income || 0), Number(item.expense || 0)]);
    return Math.max(1, ...values);
  }, [report.monthly_trend]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t('Reports & insights')}</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className={`rounded-xl p-4 ${item.tone}`}>
              <p className="text-sm">{t(item.label)}</p>
              <p className="mt-2 text-2xl font-bold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="final-expense-report-title">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 id="final-expense-report-title" className="text-xl font-bold text-slate-900">{t('Final expense report')}</h2>
            <p className="mt-1 text-sm text-slate-500">{reportIsFinal ? t('All group payments are settled.') : t('Download becomes available after all group payments are settled.')}</p>
          </div>
          <button type="button" onClick={downloadExpenseReport} disabled={!reportIsFinal || groupExpensesLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#287253] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#205b43] disabled:cursor-not-allowed disabled:bg-slate-300">
            <Download className="h-4 w-4" />{t('Download CSV')}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {['Sr no', "Person's name", "Person's expenses", 'Expense description', 'Amount to pay', 'Who pays whom'].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 font-semibold">{t(heading)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenseRows.length ? expenseRows.map((row, index) => (
                <tr key={`${row.expenseId}-${row.name}`}>
                  <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-slate-700">{localizedMoney.format(row.paid)}</td>
                  <td className="px-4 py-3 text-slate-700">{row.description}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{localizedMoney.format(row.due)}</td>
                  <td className="px-4 py-3 text-slate-700">{row.transfers}</td>
                </tr>
              )) : (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">{groupExpensesLoading ? t('Loading expense report...') : t('No group expenses to report yet.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">{t('Expense trend')}</h2>
          <div className="mt-8 flex h-52 items-end gap-3 rounded-xl bg-slate-50 p-4">
            {report.monthly_trend.length ? report.monthly_trend.map((item) => (
              <div key={item.month} className="flex flex-1 items-end justify-center gap-2">
                <div className="w-1/2 rounded-t-xl bg-emerald-500" style={{ height: `${(Number(item.income || 0) / maxTrend) * 100}%` }} />
                <div className="w-1/2 rounded-t-xl bg-indigo-500" style={{ height: `${(Number(item.expense || 0) / maxTrend) * 100}%` }} />
              </div>
            )) : <div className="w-full text-center text-sm text-slate-500">{t('No trend data available yet.')}</div>}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {t('Income')}</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> {t('Expense')}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">{t('Smart suggestions')}</h2>
          <ul className="mt-5 space-y-3 text-sm text-slate-600">
            {report.category_breakdown.length ? report.category_breakdown.slice(0, 3).map((item, index) => (
              <li key={`${item.category__name}-${index}`} className="rounded-xl bg-slate-50 p-3">
                {item.category__name} {t('is your top spending category at ')}{localizedMoney.format(Number(item.total || 0))}.
              </li>
            )) : <li className="rounded-xl bg-slate-50 p-3">{t('Add a few expenses to generate smarter spending insights.')}</li>}
            <li className="rounded-xl bg-slate-50 p-3">{t('Current balance: ')}{localizedMoney.format(Number(report.summary.balance || 0))}.</li>
            <li className="rounded-xl bg-slate-50 p-3">{t('Budget remaining: ')}{localizedMoney.format(Number(report.summary.budget_remaining || 0))}.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
