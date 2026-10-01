import { useState } from 'react';
import { Copy, ExternalLink, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

export default function ExpenseShareActions({ expense }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const entryUrl = `${window.location.origin}/expenses?view=ledger&entry=${expense.id}`;
  const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(expense.amount));
  const message = [
    `${t('Expense')}: ${expense.description || expense.category_name || t('Expense')}`,
    `${t('Amount')}: ${amount}`,
    `${t('Category')}: ${expense.category_name || '-'}`,
    `${t('Date')}: ${expense.date}`,
    `${t('Paid by')}: ${expense.person_name || t('Not specified')}`,
    `${t('View expense')}: ${entryUrl}`,
  ].join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entryUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-label={t('Share expense')}>
      <p className="text-sm font-semibold text-emerald-950">{t('Expense added successfully.')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#168653] px-3 py-2 text-sm font-semibold text-white hover:bg-[#116d43]">
          <MessageCircle className="h-4 w-4" />{t('Share on WhatsApp')}
        </a>
        <button type="button" onClick={handleCopy}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
          <Copy className="h-4 w-4" />{t(copied ? 'Link copied' : 'Copy link')}
        </button>
        <Link to={`/expenses?view=ledger&entry=${expense.id}`}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
          <ExternalLink className="h-4 w-4" />{t('View entry')}
        </Link>
      </div>
    </section>
  );
}