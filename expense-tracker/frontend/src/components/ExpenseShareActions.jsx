import { useState } from 'react';
import { Copy, ExternalLink, MessageCircle, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

export default function ExpenseShareActions({ expense, compact = false, messageOverride, buttonLabel }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [whatsappOpened, setWhatsappOpened] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const entryUrl = `${window.location.origin}/expenses?view=ledger&entry=${expense.id}`;
  const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(expense.amount));
  const date = expense.date
    ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${expense.date}T00:00:00`))
    : '-';
  const defaultMessage = messageOverride || [
    '◆ MoneyMind Expense Alert',
    '',
    `◆ Expense: ${expense.description || expense.category_name || t('Expense')}`,
    `₹ Amount: ${amount}`,
    `◆ Date: ${date}`,
    `● Category: ${expense.category_name || '-'}`,
    expense.merchant_name ? `● Merchant: ${expense.merchant_name}` : null,
    `● Payment Method: ${expense.payment_method || '-'}`,
    expense.notes ? `◆ Note: ${expense.notes}` : null,
    '',
    'Manage Money. Master Your Future.',
    'Shared via MoneyMind.',
  ].filter(Boolean).join('\n');
  const [message, setMessage] = useState(defaultMessage);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entryUrl);
      setCopied(true);
      setShareStatus('');
    } catch {
      setCopied(false);
      setShareStatus(t('Unable to copy the expense link. Check browser clipboard permissions.'));
    }
  };

  const shareExpense = async () => {
    setShareStatus('');
    try {
      if (navigator.share) {
        await navigator.share({ title: t('MoneyMind Expense'), text: message, url: entryUrl });
        return;
      }
      await navigator.clipboard.writeText(`${message}\n\n${entryUrl}`);
      setShareStatus(t('Expense details copied. Paste them into the app you want to share with.'));
    } catch (shareError) {
      if (shareError.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(`${message}\n\n${entryUrl}`);
        setShareStatus(t('Expense details copied. Paste them into the app you want to share with.'));
      } catch {
        setShareStatus(t('Unable to share or copy the expense. Check browser permissions and try again.'));
      }
    }
  };

  return (
    <section className={compact ? 'inline-block' : 'rounded-xl border border-emerald-200 bg-emerald-50 p-4'} aria-label={t('Share expense')}>
      {!compact && <p className="text-sm font-semibold text-emerald-950">{t('Expense added successfully.')}</p>}
      <div className={`${compact ? '' : 'mt-3'} flex flex-wrap gap-2`}>
        <button type="button" onClick={() => { setMessage(defaultMessage); setWhatsappOpened(false); setPreviewOpen(true); }}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#168653] px-3 py-2 text-sm font-semibold text-white hover:bg-[#116d43]">
          <MessageCircle className="h-4 w-4" />{t(buttonLabel || (compact ? 'Share' : 'Preview WhatsApp message'))}
        </button>
        {!compact && <>
          <button type="button" onClick={handleCopy}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
            <Copy className="h-4 w-4" />{t(copied ? 'Link copied' : 'Copy link')}
          </button>
          <Link to={`/expenses?view=ledger&entry=${expense.id}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
            <ExternalLink className="h-4 w-4" />{t('View entry')}
          </Link>
        </>}
      </div>
      {shareStatus && <p role="status" className="mt-2 text-xs text-rose-700">{shareStatus}</p>}
      {whatsappOpened && <p role="status" className="mt-2 text-xs text-emerald-800">{t('WhatsApp opened in a new tab. Review and send the message there when ready.')}</p>}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPreviewOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="share-expense-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h2 id="share-expense-title" className="text-lg font-semibold text-slate-950">{t('Preview WhatsApp message')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('Review and edit this message before opening WhatsApp.')}</p>
            <label htmlFor="expense-share-message" className="sr-only">{t('WhatsApp message')}</label>
            <textarea id="expense-share-message" rows="7" value={message} onChange={(event) => setMessage(event.target.value)} className="mt-4 w-full resize-y rounded-xl border border-slate-300 p-3 text-sm text-slate-800" />
            <p className="mt-2 text-xs text-slate-500">{t('Sharing sends the details shown above. Review them before continuing.')}</p>
            {shareStatus && <p role="status" className="mt-2 text-xs text-rose-700">{shareStatus}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPreviewOpen(false)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">{t('Cancel')}</button>
              <button type="button" onClick={shareExpense} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50">
                <Share2 className="h-4 w-4" />{t('Share with apps')}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" onClick={() => { setWhatsappOpened(true); setPreviewOpen(false); }}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#168653] px-4 py-2 text-sm font-semibold text-white hover:bg-[#116d43]">
                <MessageCircle className="h-4 w-4" />{t('Open WhatsApp')}
              </a>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}