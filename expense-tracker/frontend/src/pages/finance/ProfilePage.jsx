import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

export default function ProfilePage() {
  const { user } = useAuth();
  const { language, t } = useLanguage();

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t('Profile')}</h1>
        <div className="mt-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="text-xl font-semibold text-slate-900">{user?.name || 'User'}</p>
            <p className="text-sm text-slate-500">{user?.email || 'user@example.com'}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">{t('Member since')}</p>
            <p className="mt-2 font-semibold text-slate-900">{user?.created_at ? new Date(user.created_at).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN') : t('N/A')}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">{t("Person's group")}</p>
            <p className="mt-2 font-semibold text-slate-900">{user?.group || t('Personal')}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">{t('Status')}</p>
            <p className="mt-2 font-semibold text-emerald-600">{t('Active')}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">{t('Security')}</h2>
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">{t('Password')}</p>
            <p className="mt-2 text-sm font-medium text-slate-700">{t('Password changes are managed securely through the authenticated reset flow.')}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">{t('Two-step verification')}</p>
            <p className="mt-2 font-semibold text-slate-900">{t('Enabled')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
