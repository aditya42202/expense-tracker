import { ArrowRight, BarChart3, CircleDollarSign, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

const highlights = [
  { title: 'Expenses', detail: 'Track daily spending by category.', icon: ReceiptText, color: 'text-rose-700 bg-rose-100' },
  { title: 'Budgets', detail: 'See monthly spending and what remains.', icon: CircleDollarSign, color: 'text-emerald-800 bg-emerald-100' },
  { title: 'Reports', detail: 'Review income and expenses over time.', icon: BarChart3, color: 'text-sky-800 bg-sky-100' },
];

export default function HomePage() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7f8f5] text-slate-900">
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Pennywise home">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#173d32] text-white"><WalletCards className="h-5 w-5" /></span>
          <span>
            <span className="block text-[10px] font-semibold uppercase text-[#287253]">{t('Personal finance')}</span>
            <span className="block text-lg font-bold leading-tight">Pennywise</span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('Select language')} className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 sm:px-3">
            <option value="en">English</option><option value="hi">हिन्दी</option>
          </select>
          <Link to="/login" className="min-h-10 content-center rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-white sm:px-3">{t('Login')}</Link>
          <Link to="/register" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#173d32] px-3 text-sm font-semibold text-white hover:bg-[#205440] sm:px-4">{t('Create account')}<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </header>

      <main className="relative mx-auto grid min-h-[calc(100vh-80px)] w-full max-w-7xl items-center gap-12 px-5 pb-12 pt-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pb-20 lg:pt-0">
        <div className="absolute -right-40 top-20 -z-0 h-[30rem] w-[30rem] rounded-full border border-[#dce7dc] sm:right-0" aria-hidden="true" />
        <section className="relative z-10 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#dce7dc] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#287253]">
            <ShieldCheck className="h-4 w-4" /> {t('Your money, in view')}
          </p>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.03] text-slate-950 sm:text-6xl lg:text-7xl">Pennywise</h1>
          <p className="mt-5 max-w-xl text-xl leading-relaxed text-slate-600 sm:text-2xl">{t('A clear place for everyday spending, income, and monthly plans.')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#173d32] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#205440]">{t('Get started')}<ArrowRight className="h-4 w-4" /></Link>
            <Link to="/login" className="inline-flex min-h-12 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50">{t('Sign in to your account')}</Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-slate-500"><ShieldCheck className="h-4 w-4 text-[#287253]" />{t('Sign-in codes are sent to your email.')}</p>
        </section>

        <section className="relative z-10 grid gap-3 sm:grid-cols-3 lg:grid-cols-1" aria-label={t('Pennywise tools')}>
          {highlights.map(({ title, detail, icon: Icon, color }, index) => (
            <article key={title} className={`flex min-h-28 items-center gap-4 border-b border-slate-200 py-4 sm:min-h-36 sm:border-b-0 sm:border-l sm:pl-5 lg:min-h-28 lg:border-b lg:border-l-0 lg:pl-0 ${index === 1 ? 'sm:translate-y-5 lg:translate-y-0' : ''}`}>
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span>
              <span>
                <span className="block text-lg font-semibold">{t(title)}</span>
                <span className="mt-1 block max-w-xs text-sm leading-relaxed text-slate-600">{t(detail)}</span>
              </span>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}