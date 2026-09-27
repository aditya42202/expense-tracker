import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

export default function ReportsPage() {
  const { language, t } = useLanguage();
  const localizedMoney = useMemo(() => new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), [language]);
  const [report, setReport] = useState({
    summary: { total_income: 0, total_expense: 0, balance: 0, monthly_budget: 0, budget_remaining: 0 },
    category_breakdown: [],
    monthly_trend: [],
    recent_transactions: [],
  });

  useEffect(() => {
    const loadReports = async () => {
      try {
        const { data } = await api.get('/dashboard/reports/');
        setReport(data);
      } catch (error) {
        console.error('Reports fetch failed:', error);
      }
    };
    loadReports();
  }, []);

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
