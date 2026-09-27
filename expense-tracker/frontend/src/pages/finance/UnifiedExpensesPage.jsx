import { CalendarDays, ChevronLeft, ChevronRight, CreditCard, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import DailyExpensesPage from './DailyExpensesPage';
import ExpensesPage from './ExpensesPage';
import GroupExpensePage from './GroupExpensePage';

const views = [
  { id: 'daily', label: 'Add daily expense', icon: CalendarDays },
  { id: 'ledger', label: 'Expense history', icon: CreditCard },
  { id: 'group', label: 'Group & settlement', icon: UsersRound },
];

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPeriodRange(period, weekOffset = 0) {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  let endDate = today;

  if (period === 'week') {
    startDate.setDate(today.getDate() - today.getDay());
    startDate.setDate(startDate.getDate() + (weekOffset * 7));
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
  }

  return { start: toDateString(startDate), end: toDateString(endDate) };
}

export default function UnifiedExpensesPage() {
  const { language, t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const activeView = views.some((view) => view.id === requestedView) ? requestedView : 'ledger';
  const [period, setPeriod] = useState('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [totals, setTotals] = useState({ personal: 0, group: 0, personalCount: 0, groupCount: 0 });
  const [personalEntries, setPersonalEntries] = useState([]);
  const [groupEntries, setGroupEntries] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => toDateString(new Date()));
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [summaryVersion, setSummaryVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const range = getPeriodRange(period, weekOffset);
    setLoading(true);

    Promise.all([api.get('/expenses/'), api.get('/group-expenses/')])
      .then(([personalResponse, groupResponse]) => {
        if (!active) return;
        setPersonalEntries(personalResponse.data);
        setGroupEntries(groupResponse.data);
        const personal = personalResponse.data.filter((item) => item.date >= range.start && item.date <= range.end);
        const group = groupResponse.data.filter((item) => item.date >= range.start && item.date <= range.end);
        setTotals({
          personal: personal.reduce((sum, item) => sum + Number(item.amount), 0),
          group: group.reduce((sum, item) => sum + Number(item.amount), 0),
          personalCount: personal.length,
          groupCount: group.length,
        });
        setSummaryError('');
      })
      .catch(() => {
        if (active) setSummaryError('Period totals are currently unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [period, summaryVersion, weekOffset]);

  const setView = (view) => setSearchParams({ view });
  const refreshSummary = () => setSummaryVersion((version) => version + 1);
  const total = totals.personal + totals.group;
  const localizedMoney = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  });
  const formatMoney = (amount) => localizedMoney.format(amount);
  const periodRange = getPeriodRange(period, weekOffset);
  const weekEndsOn = new Date(`${periodRange.end}T00:00:00`);
  const weekIsFinal = period === 'week' && (weekOffset < 0 || toDateString(new Date()) > periodRange.end);
  const weeklyPendingSettlements = period === 'week'
    ? groupEntries
      .filter((expense) => expense.date >= periodRange.start && expense.date <= periodRange.end)
      .flatMap((expense) => expense.settlements || [])
      .filter((settlement) => settlement.status !== 'SETTLED')
      .reduce((totalsByPair, settlement) => {
        const key = `${settlement.from}\u0000${settlement.to}`;
        const current = totalsByPair.get(key) || { from: settlement.from, to: settlement.to, amountInPaise: 0 };
        current.amountInPaise += Math.round(Number(settlement.amount) * 100);
        totalsByPair.set(key, current);
        return totalsByPair;
      }, new Map())
    : new Map();
  const settlementRows = [...weeklyPendingSettlements.values()];
  const dayActivities = [
    ...personalEntries.filter((entry) => entry.date === selectedDate).map((entry) => ({
      id: `personal-${entry.id}`,
      kind: 'Personal',
      title: entry.description || entry.category_name || 'Expense',
      amount: Number(entry.amount),
      paidBy: entry.person_name || 'Not specified',
      record: entry,
    })),
    ...groupEntries.filter((entry) => entry.date === selectedDate).map((entry) => ({
      id: `group-${entry.id}`,
      kind: 'Group',
      title: entry.title || 'Group expense',
      amount: Number(entry.amount),
      paidBy: (entry.participant_details || [])
        .filter((participant) => Number(participant.paid) > 0)
        .map((participant) => `${participant.name} (${formatMoney(Number(participant.paid))})`)
        .join(', ') || 'Not specified',
      record: entry,
    })),
  ];
  const selectedDayTotal = dayActivities.reduce((sum, activity) => sum + activity.amount, 0);
  const today = toDateString(new Date());
  const moveDate = (days) => {
    const nextDate = new Date(`${selectedDate}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + days);
    setSelectedDate(toDateString(nextDate));
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[#287253]">{t('Expense workspace')}</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-950">{t('Expenses')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('Daily entries, period totals, and group settlement in one place.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {period === 'week' && (
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1">
              <button type="button" onClick={() => setWeekOffset((offset) => offset - 1)} aria-label={t('Previous week')}
                className="rounded-md p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-2 text-xs text-slate-600">{periodRange.start} – {periodRange.end}</span>
              <button type="button" onClick={() => setWeekOffset((offset) => Math.min(0, offset + 1))} disabled={weekOffset === 0} aria-label={t('Next week')}
                className="rounded-md p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
          <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1" aria-label="Summary period">
            {[['week', weekOffset === 0 ? 'This week' : 'Selected week'], ['month', 'This month']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setPeriod(value)} aria-pressed={period === value}
                className={`rounded-md px-3 py-2 text-sm font-medium ${period === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {t(label)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label={`${period === 'week' ? 'Weekly' : 'Monthly'} expense totals`}>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{t('Combined total')}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{loading ? 'Loading...' : formatMoney(total)}</p>
          <p className="mt-1 text-xs text-slate-500">{t('Personal and group expenses')}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{t('Personal · ')}{totals.personalCount}{t(' entries')}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{loading ? 'Loading...' : formatMoney(totals.personal)}</p>
          <p className="mt-1 text-xs text-slate-500">{t('Daily expenses in this period')}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{t('Group · ')}{totals.groupCount}{t(' entries')}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{loading ? 'Loading...' : formatMoney(totals.group)}</p>
          <p className="mt-1 text-xs text-slate-500">{t('Shared expenses in this period')}</p>
        </div>
      </section>
      {period === 'week' && (
        <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="weekly-settlement-title">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div>
              <h2 id="weekly-settlement-title" className="text-lg font-semibold text-slate-950">{t('Weekly final account')}</h2>
              <p className="mt-1 text-sm text-slate-500">{weekIsFinal ? t('This week is final.') : `${t('Week closes on Sunday: ')}${new Date(weekEndsOn.getFullYear(), weekEndsOn.getMonth(), weekEndsOn.getDate() + 1).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN')}`}</p>
            </div>
            <p className="text-sm font-semibold text-slate-700">{t('Pending group payments')}: {formatMoney(settlementRows.reduce((sum, item) => sum + item.amountInPaise, 0) / 100)}</p>
          </div>
          {settlementRows.length === 0 ? (
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">{t('No pending group payments for this week.')}</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              {settlementRows.map((settlement) => (
                <li key={`${settlement.from}-${settlement.to}`} className="flex justify-between gap-4 py-3 text-sm">
                  <span className="text-slate-700">{settlement.from} {t('owes')} {settlement.to}</span>
                  <span className="shrink-0 font-semibold text-slate-950">{formatMoney(settlement.amountInPaise / 100)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">{t('Payments stay pending until marked paid.')}</p>
        </section>
      )}
      {summaryError && <p role="status" className="text-sm text-amber-700">{summaryError}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="day-activity-title">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 id="day-activity-title" className="text-lg font-semibold text-slate-950">{t('Day activity')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('Check what you spent on any previous date.')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => moveDate(-1)} aria-label={t('Previous day')}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input type="date" value={selectedDate} max={today} onChange={(event) => setSelectedDate(event.target.value)}
              aria-label={t('Choose expense date')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800" />
            <button type="button" onClick={() => moveDate(1)} disabled={selectedDate >= today} aria-label={t('Next day')}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-y border-slate-100 py-3 text-sm">
          <span className="text-slate-500">{dayActivities.length}{t(dayActivities.length === 1 ? ' expense on ' : ' expenses on ')}{selectedDate}</span>
          <span className="font-semibold text-slate-950">{t('Total: ')}{formatMoney(selectedDayTotal)}</span>
        </div>
        {dayActivities.length === 0 ? (
          <p className="py-7 text-center text-sm text-slate-500">{t('No personal or group expenses recorded for this date.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {dayActivities.map((activity) => (
              <li key={activity.id} className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{activity.title}</p>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${activity.kind === 'Group' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{t(activity.kind)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{t('Paid by')}: {activity.paidBy}{activity.kind === 'Personal' && activity.record.user_name ? `${t('Recorded by: ')}${activity.record.user_name}` : ''}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-slate-900">{formatMoney(activity.amount)}</p>
                </div>
                <details className="mt-2 text-sm">
                  <summary className="w-fit cursor-pointer text-xs font-semibold text-[#287253]">{t('View full record')}</summary>
                  {activity.kind === 'Personal' ? (
                    <dl className="mt-3 grid gap-x-6 gap-y-2 border-l-2 border-slate-200 pl-3 text-xs sm:grid-cols-2">
                      <div><dt className="text-slate-500">{t('Date')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.date}</dd></div>
                      <div><dt className="text-slate-500">{t('Description')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.description || '-'}</dd></div>
                      <div><dt className="text-slate-500">{t('Category')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.category_name || '-'}</dd></div>
                      <div><dt className="text-slate-500">{t('Payment method')}</dt><dd className="mt-0.5 text-slate-800">{t(activity.record.payment_method || '-')}</dd></div>
                      <div><dt className="text-slate-500">{t('Paid by')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.person_name || t('Not specified')}</dd></div>
                      <div><dt className="text-slate-500">{t('Recorded by')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.user_name || '-'}</dd></div>
                      <div><dt className="text-slate-500">{t('Amount')}</dt><dd className="mt-0.5 text-slate-800">{formatMoney(Number(activity.record.amount))}</dd></div>
                      <div><dt className="text-slate-500">{t('Created')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.created_at ? new Date(activity.record.created_at).toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN') : '-'}</dd></div>
                      <div><dt className="text-slate-500">{t('Last updated')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.updated_at ? new Date(activity.record.updated_at).toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN') : '-'}</dd></div>
                    </dl>
                  ) : (
                    <div className="mt-3 space-y-3 border-l-2 border-slate-200 pl-3 text-xs">
                      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                        <div><dt className="text-slate-500">{t('Date')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.date}</dd></div>
                        <div><dt className="text-slate-500">{t('Category')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.category || '-'}</dd></div>
                        <div><dt className="text-slate-500">{t('Total amount')}</dt><dd className="mt-0.5 text-slate-800">{formatMoney(Number(activity.record.amount))}</dd></div>
                        <div><dt className="text-slate-500">{t('Paid by')}</dt><dd className="mt-0.5 text-slate-800">{activity.paidBy}</dd></div>
                        <div><dt className="text-slate-500">{t('Created')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.created_at ? new Date(activity.record.created_at).toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN') : '-'}</dd></div>
                        <div><dt className="text-slate-500">{t('Last updated')}</dt><dd className="mt-0.5 text-slate-800">{activity.record.updated_at ? new Date(activity.record.updated_at).toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN') : '-'}</dd></div>
                      </dl>
                      <div>
                        <p className="font-semibold text-slate-700">{t('Participants and shares')}</p>
                        <ul className="mt-1 space-y-1 text-slate-600">
                          {(activity.record.participant_details || []).map((participant) => (
                            <li key={participant.id}>{participant.name}: {t('paid')} {formatMoney(Number(participant.paid))}, {t('share')} {formatMoney(Number(participant.share))}, {t(participant.status)}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">{t('Settlement records')}</p>
                        {(activity.record.settlements || []).length ? (
                          <ul className="mt-1 space-y-1 text-slate-600">
                            {activity.record.settlements.map((settlement) => (
                              <li key={settlement.id}>{settlement.from}{t(' pays ')}{settlement.to} {formatMoney(Number(settlement.amount))} · {t(settlement.status)}</li>
                            ))}
                          </ul>
                        ) : <p className="mt-1 text-slate-600">{t('No settlement required.')}</p>}
                      </div>
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Expense views">
        {views.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setView(id)} aria-current={activeView === id ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${activeView === id ? 'border-[#287253] text-[#173d32]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      {activeView === 'daily' && <DailyExpensesPage onExpenseChange={refreshSummary} />}
      {activeView === 'ledger' && <ExpensesPage onExpenseChange={refreshSummary} />}
      {activeView === 'group' && <GroupExpensePage onExpenseChange={refreshSummary} />}
    </div>
  );
}