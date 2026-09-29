import { Eye, EyeOff, Mail, ShieldCheck, UserRound, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const strengthConfig = [
  { label: 'Weak', color: 'bg-rose-500' },
  { label: 'Fair', color: 'bg-amber-500' },
  { label: 'Good', color: 'bg-emerald-500' },
  { label: 'Strong', color: 'bg-emerald-600' },
];

const firstErrorMessage = (value) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(firstErrorMessage).find(Boolean) || '';
  if (value && typeof value === 'object') return Object.values(value).map(firstErrorMessage).find(Boolean) || '';
  return '';
};

export default function RegisterPage() {
  const { language, setLanguage, t } = useLanguage();
  const [form, setForm] = useState({ name: '', email: '', group: 'Personal', password: '', confirm_password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState(() => sessionStorage.getItem('pending_verification_email') || '');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register, verifyEmail, resendOtp } = useAuth();
  const navigate = useNavigate();

  const passwordScore = useMemo(() => {
    const value = form.password;
    if (!value) return 0;
    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return Math.min(score, 4);
  }, [form.password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (form.password !== form.confirm_password) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const result = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        group: form.group,
        password: form.password,
        confirm_password: form.confirm_password,
      });
      setVerificationEmail(result.email || form.email.trim());
      // Temporarily disabled; keep the email-verification flow here for later.
      // const email = result.email || form.email.trim();
      // setVerificationEmail(email);
      // sessionStorage.setItem('pending_verification_email', email);
      // setVerificationPending(true);
      sessionStorage.removeItem('pending_verification_email');
      setSuccess(result.message || 'Account created successfully. You can now log in.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      const backendError = firstErrorMessage(err.response?.data);
      setError(backendError || (err.response ? 'Registration failed.' : 'Unable to connect to the server. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setVerificationMessage('');
    try {
      const result = await verifyEmail({ email: verificationEmail, otp: verificationCode });
      sessionStorage.removeItem('pending_verification_email');
      setSuccess(`${result.message} Redirecting to login...`);
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to verify the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResending(true);
    setError('');
    setVerificationMessage('');
    try {
      const result = await resendOtp({ email: verificationEmail });
      setVerificationMessage(result.message);
    } catch {
      setError('Unable to resend the code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#eef2ff,_#f8fafc_40%,_#eef6ff_100%)] p-4 md:p-8">
      <label className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
        {t('Select language')}
        <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('Select language')} className="bg-transparent font-medium text-slate-900">
          <option value="en">English</option><option value="hi">हिन्दी</option>
        </select>
      </label>
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_35px_80px_-30px_rgba(15,23,42,0.28)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden bg-slate-950 p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.35),_transparent_42%)]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-xl shadow-indigo-950/40">
                <WalletCards className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-indigo-200">{t('Get started')}</p>
                <h1 className="mt-1 text-2xl font-bold">Pennywise</h1>
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-8">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-indigo-200">{t('Create your account')}</p>
              <h2 className="mt-4 max-w-md text-4xl font-semibold leading-tight">{t('Build a stronger financial future with smarter tracking.')}</h2>
            </div>

            <div className="space-y-3">
              {['Set monthly budgets', 'Monitor income and expenses', 'Reach savings goals faster'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-200">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <span className="text-sm text-slate-100">{t(item)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:text-left">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">{t('New here?')}</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">{t(verificationPending ? 'Verify your email' : 'Create your account')}</h3>
            </div>

            {verificationPending ? (
              <form onSubmit={handleVerifyEmail} className="space-y-5">
                <p className="text-sm text-slate-600">{t('Enter the six-digit code sent to')} <span className="font-semibold text-slate-900">{verificationEmail}</span>.</p>
                <div>
                  <label htmlFor="verification-code" className="mb-2 block text-sm font-medium text-slate-700">{t('Email verification code')}</label>
                  <input
                    id="verification-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xl font-semibold tracking-[0.3em] text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100"
                    placeholder="000000"
                    required
                  />
                </div>
                {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{t(error)}</p>}
                {success && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t(success)}</p>}
                {verificationMessage && <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">{verificationMessage}</p>}
                <button type="submit" disabled={loading || verificationCode.length !== 6} className="flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                  {loading ? t('Verifying...') : t('Verify email')}
                </button>
                <button type="button" onClick={handleResendCode} disabled={resending} className="w-full py-2 text-sm font-semibold text-indigo-600 hover:text-indigo-500 disabled:text-slate-400">
                  {resending ? t('Sending...') : t('Resend verification code')}
                </button>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('Full name')}</label>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                  <UserRound className="h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border-0 bg-transparent py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    placeholder={t('Your full name')}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('Email address')}</label>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border-0 bg-transparent py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    placeholder={t('you@example.com')}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t("Person's group")}</label>
                <select
                  value={form.group}
                  onChange={(e) => setForm({ ...form, group: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100"
                >
                  <option value="Personal">{t('Personal')}</option>
                  <option value="Family">{t('Family')}</option>
                  <option value="Friends">{t('Friends')}</option>
                  <option value="Business">{t('Business')}</option>
                  <option value="Team">{t('Team')}</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('Password')}</label>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full border-0 bg-transparent py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    placeholder={t('Create a strong password')}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-slate-500 hover:text-slate-700" aria-label={t('Toggle password visibility')}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-3">
                  <div className="mb-2 flex gap-2">
                    {[1, 2, 3, 4].map((step) => (
                      <span key={step} className={`h-1.5 flex-1 rounded-full ${step <= passwordScore ? strengthConfig[passwordScore - 1]?.color || 'bg-emerald-500' : 'bg-slate-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">{t('Use at least 8 characters, including uppercase, numbers, and symbols.')}</p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('Confirm password')}</label>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={form.confirm_password}
                    onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                    className="w-full border-0 bg-transparent py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    placeholder={t('Confirm your password')}
                    required
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="text-slate-500 hover:text-slate-700" aria-label={t('Toggle confirm password visibility')}>
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{t(error)}</p>}
              {success && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t(success)}</p>}

              <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                {loading ? t('Creating account...') : t('Create account')}
              </button>
            </form>
            )}

            <p className="mt-7 text-center text-sm text-slate-600">
              {t('Already have an account?')}{' '}
              <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">{t('Login')}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
