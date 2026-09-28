import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BanknoteArrowUp, CalendarDays, CirclePlus, CreditCard, ListChecks, PiggyBank, ReceiptText, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';

export default function DashboardPage() {
  const { language, t } = useLanguage();
  const currency = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const formatMoney = (amount) => currency.format(Number(amount) || 0);
  const [data, setData] = useState({
    total_income: 0,
    total_expense: 0,
    balance: 0,
    monthly_budget: 0,
    budget_remaining: 0,
    today_expense: 0,
    current_month_expense: 0,
    expense_count: 0,
    income_count: 0,
    recent_transactions: [],
    category_breakdown: [],
    highest_expenses: [],
    monthly_trend: [],
  });
  const [groupSummary, setGroupSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchDashboard = async () => {
      const [dashboardResult, groupResult] = await Promise.allSettled([
        api.get('/dashboard/'),
        api.get('/settlements/summary/'),
      ]);
      if (!active) return;
      if (dashboardResult.status === 'fulfilled') {
        setData(dashboardResult.value.data);
        setLoadError('');
      } else {
        setLoadError(t('Dashboard data is unavailable. Check your connection and retry.'));
      }
      if (groupResult.status === 'fulfilled') setGroupSummary(groupResult.value.data);
      setLoading(false);
    };
    fetchDashboard();
    return () => { active = false; };
  }, [refreshKey, t]);

  const spent = Number(data.current_month_expense) || 0;
  const budget = Number(data.monthly_budget) || 0;
  const remaining = Number(data.budget_remaining) || 0;
  const budgetUsed = budget > 0 ? (spent / budget) * 100 : 0;
  const progressWidth = Math.min(100, budgetUsed);
  const transactions = data.recent_transactions || [];
  const chartData = [
    { name: t('Income'), amount: Number(data.total_income) || 0, fill: '#67b99a' },
    { name: t('Expenses'), amount: Number(data.total_expense) || 0, fill: '#ef967b' },
  ];
  const trendData = data.monthly_trend?.length ? data.monthly_trend : [
    { month: 'Jan', income: 0, expense: 0 },
    { month: 'Feb', income: 0, expense: 0 },
    { month: 'Mar', income: 0, expense: 0 },
  ];
  const categoryColors = ['#32866b', '#e17d56', '#d0a344', '#6782ad', '#a46c86', '#75a7a0'];

  const currentDate = new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 pb-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">{t('Your financial overview')}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">{t('Dashboard')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="inline-flex items-center gap-2 text-sm text-slate-500"><CalendarDays className="h-4 w-4" />{currentDate}</p>
          <Link to="/daily-expenses" className="inline-flex items-center gap-2 rounded-lg bg-[#173d32] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#205440]">
            <CirclePlus className="h-4 w-4" /> {t('Add expense')}
          </Link>
          <Link to="/income" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50">
            <CirclePlus className="h-4 w-4" /> {t('Add income')}
          </Link>
        </div>
      </div>

      {loadError && <div role="alert" className="flex flex-col justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center"><span>{loadError}</span><button type="button" onClick={() => { setLoading(true); setRefreshKey((key) => key + 1); }} className="min-h-10 rounded-lg border border-rose-300 px-3 font-semibold hover:bg-rose-100">{t('Retry')}</button></div>}
      {loading && <p role="status" className="text-sm text-slate-500">{t('Loading dashboard...')}</p>}

      {groupSummary && Number(groupSummary.total_group_expenses) > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-slate-500">{t('Shared group view')}</p><h2 className="mt-1 text-xl font-semibold text-slate-950">{t('Your group settlement')}</h2></div><Link to="/group-expenses" className="text-sm font-semibold text-[#287253]">{t('Open group expenses')}</Link></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ['Total group expenses', groupSummary.total_group_expenses],
              ['Your contribution', groupSummary.your_contribution],
              ['Your share', groupSummary.your_share],
              ['You need to pay', groupSummary.you_need_to_pay],
              ['You need to receive', groupSummary.you_need_to_receive],
              ['Net balance', groupSummary.net_balance],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t(label)}</p><p className={`mt-1 text-base font-semibold ${label === 'You need to pay' ? 'text-rose-700' : label === 'You need to receive' ? 'text-emerald-700' : 'text-slate-950'}`}>{formatMoney(value)}</p></div>)}
          </div>
        </section>
      )}

      <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="relative isolate overflow-hidden rounded-2xl bg-[#173d32] p-6 text-white shadow-sm sm:p-8">
          <div className="absolute -right-14 -top-28 -z-10 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-2 -top-16 -z-10 h-56 w-56 rounded-full border border-white/10" />
          <div className="flex h-full flex-col justify-between gap-8">
            <div>
              <p className="text-sm font-medium text-emerald-100/75">{t('Available balance')}</p>
              <p className="mt-3 text-4xl font-semibold sm:text-5xl">{formatMoney(data.balance)}</p>
              <p className="mt-3 text-sm text-emerald-100/70">{t('Net total across all recorded income and expenses')}</p>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-4 border-t border-white/15 pt-5">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-100/70"><ArrowDownLeft className="h-3.5 w-3.5" /> {t('Total income')}</p>
                <p className="mt-1.5 text-lg font-semibold">{formatMoney(data.total_income)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-100/70"><ArrowUpRight className="h-3.5 w-3.5" /> {t('Total expenses')}</p>
                <p className="mt-1.5 text-lg font-semibold">{formatMoney(data.total_expense)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">{t('Monthly budget')}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMoney(budget)}</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ee] text-[#25664e]"><PiggyBank className="h-5 w-5" /></span>
          </div>
          <div className="mt-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">{t('Spent this month')}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(spent)}</p>
            </div>
            <p className={`text-sm font-semibold ${remaining < 0 ? 'text-rose-600' : 'text-[#287253]'}`}>
              {budget > 0 ? `${Math.round(budgetUsed)}% ${t('used')}` : t('No budget set')}
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Monthly budget used" aria-valuenow={Math.round(progressWidth)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full transition-all ${remaining < 0 ? 'bg-rose-500' : 'bg-[#4c9a75]'}`} style={{ width: `${progressWidth}%` }} />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
            <span className="text-slate-500">{t(remaining < 0 ? 'Over budget' : 'Remaining')}</span>
            <span className={`font-semibold ${remaining < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatMoney(Math.abs(remaining))}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Total income', value: data.total_income, icon: BanknoteArrowUp, tone: 'text-[#287253] bg-[#e8f3ee]' },
          { label: 'Total expenses', value: data.total_expense, icon: CreditCard, tone: 'text-[#b85c49] bg-[#fff0eb]' },
          { label: 'Spent today', value: data.today_expense, icon: Wallet, tone: 'text-[#9a6a24] bg-[#fbf2df]' },
          { label: 'Expense count', value: data.expense_count, icon: ListChecks, tone: 'text-[#426b91] bg-[#eaf1f7]', count: true },
          { label: 'Income count', value: data.income_count, icon: ListChecks, tone: 'text-[#806249] bg-[#f4eee7]', count: true },
        ].map(({ label, value, icon: Icon, tone, count }) => (
          <div key={label} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-sm text-slate-500">{t(label)}</p>
              <p className="mt-0.5 truncate text-xl font-semibold text-slate-950">{count ? Number(value) || 0 : formatMoney(value)}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{t('Category-wise expenses')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('Your spending by category')}</p>
        </div>
        {data.category_breakdown.length ? (
          <div className="mt-3 h-72 min-w-0" aria-label={t('Pie chart of expenses by category')}>
            <PieChart responsive style={{ width: '100%', height: '100%' }}>
                <Pie data={data.category_breakdown} dataKey="total" nameKey="category__name" innerRadius={58} outerRadius={96} paddingAngle={3}>
                  {data.category_breakdown.map((item, index) => <Cell key={item.category__name} fill={categoryColors[index % categoryColors.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Legend />
            </PieChart>
          </div>
        ) : <p className="py-12 text-center text-sm text-slate-500">{t('No expenses to chart yet.')}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-base font-semibold text-slate-950">{t('Highest expenses')}</h2><p className="mt-1 text-sm text-slate-500">{t('Your largest recorded expenses')}</p></div>
          <Link to="/expenses" className="text-sm font-semibold text-[#287253] hover:text-[#173d32]">{t('View all')}</Link>
        </div>
        {data.highest_expenses.length ? <div className="mt-3 divide-y divide-slate-100">
          {data.highest_expenses.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{item.description || item.category}</p><p className="mt-0.5 truncate text-xs text-slate-500">{item.category} · {item.date}</p></div><p className="shrink-0 text-sm font-semibold text-slate-900">{formatMoney(item.amount)}</p></div>)}
        </div> : <p className="py-8 text-center text-sm text-slate-500">{t('No expenses recorded yet.')}</p>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{t('Income vs expenses')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('All recorded activity')}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-500"><ReceiptText className="h-4 w-4" /></span>
          </div>
          <div className="mt-4 h-56 min-w-0" aria-label="Bar chart comparing total income and expenses">
            <BarChart responsive style={{ width: '100%', height: '100%' }} data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf0ee" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64716b', fontSize: 12 }} />
                <YAxis hide />
                <Tooltip formatter={(value) => formatMoney(value)} cursor={{ fill: '#f5f7f5' }} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]} barSize={52}>
                  {chartData.map((item) => <Cell key={item.name} fill={item.fill} />)}
                </Bar>
            </BarChart>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{t('Monthly trend')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('Income vs spending')}</p>
            </div>
            <Link to="/reports" className="shrink-0 text-sm font-semibold text-[#287253] hover:text-[#173d32]">{t('View report')}</Link>
          </div>
          <div className="mt-4 h-56 min-w-0">
            <BarChart responsive style={{ width: '100%', height: '100%' }} data={trendData} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf0ee" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64716b', fontSize: 12 }} />
                <YAxis hide />
                <Tooltip formatter={(value) => formatMoney(value)} />
                <Bar dataKey="income" fill="#67b99a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" fill="#ef967b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
              <h2 className="text-base font-semibold text-slate-950">{t('Recent activity')}</h2>
              <p className="mt-1 text-sm text-slate-500">{t('Your latest income and expenses')}</p>
          </div>
          <Link to="/expenses" className="shrink-0 text-sm font-semibold text-[#287253] hover:text-[#173d32]">{t('View all')}</Link>
        </div>
        {transactions.length > 0 ? (
          <div className="mt-3 divide-y divide-slate-100">
            {transactions.slice(0, 5).map((item) => {
              const isExpense = item.type === 'Expense';
              const Icon = isExpense ? ArrowUpRight : ArrowDownLeft;
              return (
                <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isExpense ? 'bg-[#fff0eb] text-[#b85c49]' : 'bg-[#e8f3ee] text-[#287253]'}`}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{item.description || item.category || item.type}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{item.category || t(item.type)} · {item.date}</p>
                    </div>
                  </div>
                  <p className={`shrink-0 text-sm font-semibold ${isExpense ? 'text-slate-900' : 'text-[#287253]'}`}>{isExpense ? '−' : '+'}{formatMoney(item.amount)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-400"><ReceiptText className="h-5 w-5" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">{t('No transactions yet')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('Add your first expense to get started.')}</p>
            <Link to="/daily-expenses" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#287253] hover:text-[#173d32]"><CirclePlus className="h-4 w-4" /> {t('Add expense')}</Link>
          </div>
        )}
      </section>
    </div>
  );
}
