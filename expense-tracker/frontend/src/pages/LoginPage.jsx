import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function LoginPage() {
  const { language, setLanguage, t } = useLanguage();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [message, setMessage] = useState('');
  const { login, verifyLoginOtp, resendLoginOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = location.state?.from || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const result = await login({ email: form.email.trim(), password: form.password });
      if (!result.access) {
        setError('Login did not return an access token. Please try again.');
        return;
      }
      // Temporarily disabled; keep the OTP screen transition here for later.
      // setForm((current) => ({ ...current, email: result.email || current.email.trim(), password: '' }));
      // setOtpRequested(true);
      // setMessage(result.message || 'A login code has been sent to your email.');
      navigate(destination, { replace: true });
    } catch (err) {
      const responseData = err.response?.data;
      const errorMessage = responseData?.non_field_errors?.[0]
        || responseData?.email?.[0]
        || responseData?.detail
        || 'Login failed.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await verifyLoginOtp({ email: form.email.trim(), otp: otpCode });
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to verify the login code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await resendLoginOtp({ email: form.email.trim() });
      setMessage(result.message);
    } catch {
      setError('Unable to resend the login code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const changeEmail = () => {
    setOtpRequested(false);
    setOtpCode('');
    setError('');
    setMessage('');
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-indigo-200">Finance OS</p>
                <h1 className="mt-1 text-2xl font-bold">Pennywise</h1>
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-8">
            <div>
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-indigo-200">{t('Control your cashflow')}</p>
              <h2 className="mt-4 max-w-md text-4xl font-semibold leading-tight">{t('Track every rupee with clarity and confidence.')}</h2>
            </div>

            <div className="space-y-3">
              {['Real-time budgets', 'Smart savings goals', 'Instant expense insights'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-200">
                    <Sparkles className="h-4 w-4" />
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
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">{t(otpRequested ? 'Email verification' : 'Welcome back')}</p>
              <h3 className="mt-2 text-3xl font-bold text-slate-900">{t(otpRequested ? 'Enter your login code' : 'Sign in to your account')}</h3>
            </div>

            {!otpRequested ? <form onSubmit={handleSubmit} className="space-y-5">
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
                <label className="mb-2 block text-sm font-medium text-slate-700">{t('Password')}</label>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                  <LockKeyhole className="h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full border-0 bg-transparent py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    placeholder={t('Enter your password')}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-slate-500 hover:text-slate-700" aria-label={t('Toggle password visibility')}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="flex items-center gap-2 text-slate-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  {t('Remember me')}
                </label>
                <button type="button" className="font-medium text-indigo-600 hover:text-indigo-500">{t('Forgot password?')}</button>
              </div>

              {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{t(error)}</p>}

              <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                {loading ? t('Signing in...') : t('Login')}
              </button>
            </form> : (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><ShieldCheck className="h-4 w-4" />{t('Check your email')}</p>
                  <p className="mt-1 break-all text-sm text-emerald-800">{form.email}</p>
                  <p className="mt-2 text-xs leading-relaxed text-emerald-800">{t('The six-digit code expires in 10 minutes.')}</p>
                </div>
                <div>
                  <label htmlFor="login-otp" className="mb-2 block text-sm font-medium text-slate-700">{t('Email verification code')}</label>
                  <input
                    id="login-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xl font-semibold tracking-[0.3em] text-slate-900 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100"
                    placeholder="000000"
                    required
                  />
                </div>
                {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{t(error)}</p>}
                {message && <p role="status" className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">{t(message)}</p>}
                <button type="submit" disabled={loading || otpCode.length !== 6} className="flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                  {loading ? t('Verifying...') : t('Verify and sign in')}
                </button>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <button type="button" onClick={changeEmail} className="inline-flex min-h-10 items-center gap-1 font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />{t('Change email or password')}</button>
                  <button type="button" onClick={handleResendOtp} disabled={loading} className="min-h-10 font-semibold text-indigo-600 hover:text-indigo-500 disabled:text-slate-400">{t('Resend code')}</button>
                </div>
              </form>
            )}

            {!otpRequested && <p className="mt-7 text-center text-sm text-slate-600">
              {t('Don’t have an account?')}{' '}
              <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-500">{t('Create one')}</Link>
            </p>}
            <p className="mt-5 text-center text-sm"><Link to="/" className="font-medium text-slate-500 hover:text-slate-800">{t('Back to home')}</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
