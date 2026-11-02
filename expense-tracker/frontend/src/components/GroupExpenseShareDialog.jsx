import { useState } from 'react';
import { ArrowRightLeft, Check, Clipboard, FileImage, MessageCircle, Pencil, Users, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const avatarColors = [
  'bg-violet-500',
  'bg-cyan-600',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-pink-500',
];

function createReceiptImage(expense, people, money, date, paidBy) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480 + people.length * 52;
  const context = canvas.getContext('2d');

  if (!context) throw new Error('Unable to create the receipt image.');

  context.fillStyle = '#f1f5f9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.fillRect(24, 24, canvas.width - 48, canvas.height - 48);
  context.fillStyle = '#0f172a';
  context.font = 'bold 30px Arial';
  context.fillText('MoneyMind', 56, 82);
  context.fillStyle = '#64748b';
  context.font = '20px Arial';
  context.fillText('Group expense receipt', 56, 116);

  context.strokeStyle = '#cbd5e1';
  context.setLineDash([6, 6]);
  context.beginPath();
  context.moveTo(56, 144);
  context.lineTo(canvas.width - 56, 144);
  context.stroke();
  context.setLineDash([]);

  const details = [
    ['Expense', expense.title],
    ['Date', date],
    ['Paid by', paidBy],
  ];
  context.font = '20px Arial';
  details.forEach(([label, value], index) => {
    const y = 188 + index * 36;
    context.fillStyle = '#64748b';
    context.fillText(label, 56, y);
    context.fillStyle = '#0f172a';
    context.fillText(String(value).slice(0, 42), 220, y);
  });

  const tableTop = 318;
  context.fillStyle = '#f1f5f9';
  context.fillRect(48, tableTop, canvas.width - 96, 38);
  context.fillStyle = '#334155';
  context.font = 'bold 17px Arial';
  context.fillText('Member', 64, tableTop + 25);
  context.textAlign = 'right';
  context.fillText('Share', canvas.width - 64, tableTop + 25);
  context.textAlign = 'left';

  people.forEach((person, index) => {
    const y = tableTop + 72 + index * 52;
    context.fillStyle = '#0f172a';
    context.font = '18px Arial';
    context.fillText(String(person.name).slice(0, 42), 64, y);
    context.textAlign = 'right';
    context.fillText(money.format(Number(person.share)), canvas.width - 64, y);
    context.textAlign = 'left';
    context.strokeStyle = '#e2e8f0';
    context.beginPath();
    context.moveTo(56, y + 16);
    context.lineTo(canvas.width - 56, y + 16);
    context.stroke();
  });

  const totalY = tableTop + 92 + people.length * 52;
  context.fillStyle = '#166534';
  context.font = 'bold 20px Arial';
  context.fillText('Total amount', 64, totalY);
  context.textAlign = 'right';
  context.fillText(money.format(Number(expense.amount)), canvas.width - 64, totalY);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to export the receipt image.'));
    }, 'image/png');
  });
}

export default function GroupExpenseShareDialog({ expense, money }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messageType, setMessageType] = useState('expense');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [editedMessage, setEditedMessage] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const people = expense.participant_details || [];
  const paidBy = people.filter((person) => Number(person.paid) > 0).map((person) => person.name).join(', ') || t('Not specified');
  const date = expense.date
    ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${expense.date}T00:00:00`))
    : '-';
  const expenseMessage = [
    '💰 MoneyMind Group Expense',
    '',
    `👥 Group: ${t('Shared expenses')}`,
    `📌 Expense: ${expense.title}`,
    `💵 Total: ${money.format(Number(expense.amount))}`,
    `📅 Date: ${date}`,
    `👤 Paid By: ${paidBy}`,
    '',
    'Member-wise Breakdown:',
    ...people.map((person) => `${person.name}: ${money.format(Number(person.share))}`),
    '',
    'Shared via MoneyMind.',
  ].join('\n');
  const settlementMessage = [
    '↔️ MoneyMind Settlement',
    '',
    `📌 Expense: ${expense.title}`,
    `💵 Total: ${money.format(Number(expense.amount))}`,
    '',
    ...(expense.settlements || []).length
      ? expense.settlements.map((transfer) => `${transfer.from} → ${transfer.to}: ${money.format(Number(transfer.amount))} (${transfer.status === 'SETTLED' ? t('Settled') : t('Pending')})`)
      : [t('Everyone is settled. No payment is due.')],
    '',
    'Shared via MoneyMind.',
  ].join('\n');
  const messageTemplate = `${messageType === 'expense' ? expenseMessage : settlementMessage}${note.trim() ? `\n\n📝 ${t('Note')}: ${note.trim()}` : ''}`;
  const selectedMessage = editedMessage ?? messageTemplate;

  const copyMessage = async () => {
    if (!confirmed) return;
    try {
      await navigator.clipboard.writeText(selectedMessage);
      setError('');
      setStatus(t('Message copied.'));
    } catch {
      setStatus('');
      setError(t('Unable to copy the message. Check your browser clipboard permissions.'));
    }
  };

  const shareReceipt = async () => {
    if (!confirmed) return;
    try {
      const receiptName = `${expense.title || 'group-expense'}-receipt.png`.replace(/[^\w.-]+/g, '-');
      const receipt = await createReceiptImage(expense, people, money, date, paidBy);
      const file = new File([receipt], receiptName, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `${expense.title} receipt`, files: [file] });
        setError('');
        setStatus(t('Receipt shared.'));
        return;
      }

      const url = URL.createObjectURL(receipt);
      const link = document.createElement('a');
      link.href = url;
      link.download = receiptName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
      setStatus(t('Receipt downloaded. You can attach it to your message.'));
    } catch (shareError) {
      if (shareError.name === 'AbortError') return;
      setStatus('');
      setError(t('Unable to share the receipt. Please try again.'));
    }
  };

  const shareToGroup = async () => {
    if (!confirmed) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: expense.title, text: selectedMessage });
        setError('');
        setStatus(t('Choose a group to share this expense.'));
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(selectedMessage)}`, '_blank', 'noopener,noreferrer');
    } catch (shareError) {
      if (shareError.name === 'AbortError') return;
      setStatus('');
      setError(t('Unable to open the share options. Please try again.'));
    }
  };

  const updateMessageType = (type) => {
    setMessageType(type);
    setEditedMessage(null);
    setConfirmed(false);
    setStatus('');
    setError('');
  };

  const updateNote = (value) => {
    setNote(value);
    setEditedMessage(null);
    setConfirmed(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setStatus(''); setError(''); setEditedMessage(null); setConfirmed(false); }}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#168653] px-3 py-2 text-sm font-semibold text-white hover:bg-[#116d43]"
      >
        <MessageCircle className="h-4 w-4" />
        {t('Share Expense on WhatsApp')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-share-title"
            className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-[#f7f8fc] text-slate-900 shadow-2xl dark:bg-[#11151c] dark:text-slate-100 sm:h-auto sm:max-h-[min(90vh,850px)] sm:rounded-3xl"
          >
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-[#171c25]">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="group-share-title" className="font-bold">{t('Share on WhatsApp')}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('Choose message type, review details, and share.')}</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('Close')} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-[#1b2029]">
                <button type="button" onClick={() => updateMessageType('expense')} aria-pressed={messageType === 'expense'} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-xs font-semibold sm:text-sm ${messageType === 'expense' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
                  <Clipboard className="h-4 w-4" />{t('Expense Message')}
                </button>
                <button type="button" onClick={() => updateMessageType('settlement')} aria-pressed={messageType === 'settlement'} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-xs font-semibold sm:text-sm ${messageType === 'settlement' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>
                  <ArrowRightLeft className="h-4 w-4" />{t('Settlement Message')}
                </button>
              </div>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#1a1f28]">
                <h3 className="flex items-center gap-2 font-bold">
                  <span aria-hidden="true">💰</span>
                  {t('MoneyMind Group Expense')}
                </h3>
                <div className="mt-3 space-y-1.5 text-sm">
                  <p><span className="mr-2">👥</span><strong>{t('Group')}:</strong> {t('Shared expenses')}</p>
                  <p><span className="mr-2">📌</span><strong>{t('Expense')}:</strong> {expense.title}</p>
                  <p><span className="mr-2">💵</span><strong>{t('Total')}:</strong> {money.format(Number(expense.amount))}</p>
                  <p><span className="mr-2">📅</span><strong>{t('Date')}:</strong> {date}</p>
                  <p><span className="mr-2">👤</span><strong>{t('Paid By')}:</strong> {paidBy}</p>
                </div>

                <div className="mt-3 border-t border-dashed border-slate-300 pt-3 dark:border-slate-600">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4 text-sky-600" />{t('Member-wise Breakdown')}</h4>
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <span>{t('Member')}</span><span>{t('Share')}</span>
                    </div>
                    {people.map((person, index) => (
                      <div key={person.id} className="flex items-center justify-between border-t border-slate-100 px-2.5 py-1.5 text-xs dark:border-slate-700">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${avatarColors[index % avatarColors.length]}`}>{person.name?.charAt(0)?.toUpperCase()}</span>
                          <span className="truncate">{person.name}</span>
                        </span>
                        <span className="font-medium">{money.format(Number(person.share))}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100">
                    <span>{t('Total Amount')}: {money.format(Number(expense.amount))}</span>
                    <span>{t('Each Share')}: {money.format(Number(people[0]?.share || 0))}</span>
                    <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-3 gap-2">
                <button type="button" disabled={!confirmed} onClick={copyMessage} className="flex min-h-17 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-1 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-[#1b2029] dark:hover:bg-slate-800">
                  <Clipboard className="h-5 w-5 text-violet-600" />{t('Copy Message')}
                </button>
                <button type="button" disabled={!confirmed} onClick={shareReceipt} className="flex min-h-17 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-1 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-[#1b2029] dark:hover:bg-slate-800">
                  <FileImage className="h-5 w-5 text-emerald-600" />{t('Share Receipt')}
                </button>
                <button type="button" onClick={() => setNoteOpen((current) => !current)} aria-expanded={noteOpen} className="flex min-h-17 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1b2029] dark:hover:bg-slate-800">
                  <Pencil className="h-5 w-5 text-amber-500" />{t('Add Note')}
                </button>
              </div>

              {noteOpen && <label className="block">
                <span className="sr-only">{t('Add Note')}</span>
                <textarea value={note} onChange={(event) => updateNote(event.target.value)} rows="2" placeholder={t('Write a note to include with the message')} className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-[#1b2029]" />
              </label>}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('Edit message before sharing')}</span>
                <textarea value={selectedMessage} onChange={(event) => { setEditedMessage(event.target.value); setConfirmed(false); }} rows="8" maxLength="4000" className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-[#1b2029]" />
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                <span>{t('I reviewed this message and confirm that I want to share its financial details.')}</span>
              </label>
              {(status || error) && <p role={error ? 'alert' : 'status'} className={`text-xs ${error ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{error || status}</p>}
            </div>

            <footer className="border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#171c25]">
              <p className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold"><MessageCircle className="h-4 w-4 text-emerald-600" />{t('Share Via WhatsApp')}</p>
              <div className="grid grid-cols-2 gap-2">
                <a href={confirmed ? `https://wa.me/?text=${encodeURIComponent(selectedMessage)}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!confirmed} tabIndex={confirmed ? 0 : -1} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b9a43] px-3 text-center text-xs font-bold text-white hover:bg-[#087c36] sm:text-sm ${confirmed ? '' : 'cursor-not-allowed opacity-50'}`}>
                  <MessageCircle className="h-4 w-4" />{t('Share on WhatsApp')}
                </a>
                <button type="button" disabled={!confirmed} onClick={shareToGroup} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-600 px-3 text-center text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950 sm:text-sm">
                  <Users className="h-4 w-4" />{t('Share to Group')}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
