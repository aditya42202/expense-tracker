import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import api from '../services/api';
import { useLanguage } from '../context/LanguageContext';

export default function NotificationsPage() {
  const { language, t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      const { data } = await api.get('/notifications/');
      setNotifications(data);
    } catch (error) {
      console.error('Notifications fetch failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markAsRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/mark-read/`);
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{t('Activity')}</p>
            <h1 className="text-3xl font-bold text-slate-900">{t('Notifications')}</h1>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Bell className="h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? (
          <p className="py-10 text-center text-slate-500">{t('Loading notifications...')}</p>
        ) : notifications.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-4 text-lg font-semibold text-slate-800">{t('No notifications yet')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('Your financial activity will appear here.')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => (
              <div key={item.id} className={`rounded-xl border p-4 ${item.is_read ? 'border-slate-200 bg-slate-50' : 'border-indigo-200 bg-indigo-50/40'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    <p className="mt-2 text-xs text-slate-500">{new Date(item.created_at).toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN')}</p>
                  </div>
                  {!item.is_read && (
                    <button type="button" onClick={() => markAsRead(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
                      <CheckCheck className="h-3.5 w-3.5" /> {t('Mark read')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
