import { useEffect, useState } from 'react';
import { BrainCircuit, ChartNoAxesCombined, CircleAlert, FileText, PiggyBank, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function getErrorMessage(error) {
  if (error.response?.data?.detail) return error.response.data.detail;
  return 'The AI request failed. Please try again later.';
}

export default function AIInsightsPage() {
  const [dashboard, setDashboard] = useState(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [consent, setConsent] = useState(false);
  const [insights, setInsights] = useState('');
  const [report, setReport] = useState('');
  const [aiConfigured, setAiConfigured] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [requesting, setRequesting] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    Promise.all([
      api.get('/dashboard/'),
      api.get('/dashboard/categories/', { params: { date_from: monthStart, date_to: today } }),
      api.get('/ai/status/'),
    ])
      .then(([dashboardResponse, categoryResponse, statusResponse]) => {
        if (!active) return;
        setDashboard(dashboardResponse.data);
        setCategoryBreakdown(categoryResponse.data.category_breakdown);
        setAiConfigured(statusResponse.data.configured);
      })
      .catch(() => { if (active) setError('Financial dashboard data could not be loaded.'); })
      .finally(() => { if (active) setLoadingDashboard(false); });
    return () => { active = false; };
  }, []);

  const generate = async (feature, endpoint) => {
    if (!consent) {
      setError('Confirm consent before sending financial data to the AI provider.');
      return;
    }
    setRequesting(feature);
    setError('');
    try {
      const { data } = await api.post(endpoint, { consent: true });
      if (feature === 'insights') setInsights(data.content);
      else setReport(data.content);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setRequesting('');
    }
  };

  const health = dashboard?.financial_health;
  const forecast = dashboard?.expense_forecast;
  const analysisCards = [
    { title: 'Monthly spending analysis', value: money.format(dashboard?.current_month_expense || 0), icon: ChartNoAxesCombined, detail: `${dashboard?.expense_count || 0} recorded expenses` },
    { title: 'Expense prediction', value: forecast?.projected_month_end != null ? money.format(forecast.projected_month_end) : 'Not enough data', icon: TrendingUp, detail: forecast?.message || 'Estimate based on recorded spending.' },
    { title: 'Data-derived financial health score', value: health?.score == null ? 'Not enough data' : `${health.score}/100`, icon: BrainCircuit, detail: health?.category || 'Score requires sufficient income and budget data.' },
    { title: 'Monthly budget', value: dashboard?.monthly_budget ? money.format(dashboard.monthly_budget) : 'Not set', icon: PiggyBank, detail: dashboard?.monthly_budget ? `${money.format(dashboard.budget_remaining)} remaining` : 'Add a monthly budget for budget recommendations.' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-2xl bg-[#173d32] p-6 text-white sm:p-8">
        <p className="text-sm text-emerald-100/75">MoneyMind</p>
        <h1 className="mt-1 text-3xl font-semibold">AI Insights</h1>
        <p className="mt-2 max-w-2xl text-sm text-emerald-100/80">Understand spending patterns and get recommendations grounded in your recorded financial data.</p>
      </header>

      <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>I agree to send my account summary, recent expense descriptions and amounts, and savings goals to OpenAI, as configured by MoneyMind, to generate these results. The AI output is educational and may be incomplete.</span>
      </label>
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {aiConfigured === false && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">AI generation is not configured. Ask your administrator to set OPENAI_API_KEY on the backend. Data-derived dashboard metrics remain available.</div>}

      {loadingDashboard ? <p role="status" className="text-sm text-slate-500">Loading your financial data...</p> : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {analysisCards.map(({ title, value, icon: Icon, detail }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Icon className="h-5 w-5 text-emerald-700" />
                <h2 className="mt-3 text-sm font-medium text-slate-500">{title}</h2>
                <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-950">Spending pattern and unusual expenses</h2>
              {categoryBreakdown.length ? (
                <ul className="mt-3 space-y-2">
                  {categoryBreakdown.map((category) => <li key={category.category__name} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{category.category__name}</span><strong>{money.format(category.total)}</strong></li>)}
                </ul>
              ) : <p className="mt-3 text-sm text-slate-500">No expense categories have been recorded yet.</p>}
              <p className="mt-3 text-xs text-slate-500">These totals are calculated from your account. Unusual spending is not inferred unless generated insights are available.</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-950">Budget, savings, and goal recommendations</h2>
              <p className="mt-2 text-sm text-slate-600">Recommendations are generated only when you request them and the server has an AI provider configured.</p>
              <button type="button" disabled={requesting !== ''} onClick={() => generate('insights', '/ai/insights/')} className="mt-4 min-h-10 rounded-lg bg-[#173d32] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {requesting === 'insights' ? 'Generating insights...' : 'Generate AI insights'}
              </button>
              {insights && <div className="mt-4 whitespace-pre-wrap rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">{insights}</div>}
            </article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><h2 className="font-semibold text-slate-950">AI monthly report</h2><p className="mt-1 text-sm text-slate-500">Monthly totals, spending comparison, savings opportunities, and recommendations.</p></div>
              <button type="button" disabled={requesting !== ''} onClick={() => generate('report', '/ai/report/')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
                <FileText className="h-4 w-4" />{requesting === 'report' ? 'Generating report...' : 'Generate report'}
              </button>
            </div>
            {report && <div className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800">{report}</div>}
          </section>
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-emerald-800">
            <Link to="/ai-assistant" className="underline underline-offset-4">Open MoneyMind AI Assistant</Link>
            <Link to="/reports" className="underline underline-offset-4">View financial reports</Link>
          </div>
        </>
      )}
    </div>
  );
}
