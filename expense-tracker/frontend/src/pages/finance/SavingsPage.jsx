import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';

export default function SavingsPage() {
  const { language, t } = useLanguage();
  const localizedNumber = new Intl.NumberFormat(language === 'hi' ? 'hi-IN' : 'en-IN');
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    const loadGoals = async () => {
      try {
        const { data } = await api.get('/goals/');
        setGoals(data);
      } catch (error) {
        console.error('Failed to load savings goals', error);
      }
    };
    loadGoals();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-white shadow-lg">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-100">{t('Savings')}</p>
        <h1 className="mt-2 text-3xl font-bold">{t('Build your financial cushion')}</h1>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {goals.length ? goals.map((goal) => (
          <div key={goal.id} className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">{goal.name}</h3>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">{goal.progress}%</span>
            </div>
            <p className="mt-3 text-sm text-slate-600">{goal.description || t('Emergency fund goal')}</p>
            <div className="mt-4 h-2.5 rounded-full bg-slate-100">
              <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(goal.progress || 0, 100)}%` }} />
            </div>
            <div className="mt-4 flex justify-between text-sm text-slate-600">
              <span>{t('Saved')}</span>
              <span>{localizedNumber.format(Number(goal.current_amount || 0))}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm text-slate-600">
              <span>{t('Target')}</span>
              <span>{localizedNumber.format(Number(goal.target_amount || 0))}</span>
            </div>
          </div>
        )) : <p className="text-slate-500">{t('No savings goals yet.')}</p>}
      </div>
    </div>
  );
}
