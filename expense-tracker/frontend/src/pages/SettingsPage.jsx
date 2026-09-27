import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">{t('Account')}</p>
        <h1 className="text-3xl font-bold text-slate-900">{t('Settings')}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">{t('Profile settings')}</h2>
          <div className="mt-5 space-y-4 text-sm text-slate-700">
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="block text-slate-500">{t('Name')}</span>
              <span className="mt-1 block font-semibold text-slate-900">{user?.name || t('Not available')}</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="block text-slate-500">{t('Email')}</span>
              <span className="mt-1 block font-semibold text-slate-900">{user?.email || t('Not available')}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">{t('Preferences')}</h2>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
            {t('Select language')}
            <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('Select language')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800">
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
          </label>
          <div className="mt-5 space-y-3">
            {[
              'Currency format: INR',
              'Default view: Dashboard',
              'Budget reminders: Enabled',
              'Two-factor auth: Coming soon',
            ].map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                {t(item)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
