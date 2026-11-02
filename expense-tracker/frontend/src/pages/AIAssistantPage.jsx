import { useEffect, useState } from 'react';
import { Bot, Send } from 'lucide-react';
import api from '../services/api';

export default function AIAssistantPage() {
  const [question, setQuestion] = useState('');
  const [consent, setConsent] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [aiConfigured, setAiConfigured] = useState(null);

  useEffect(() => {
    let active = true;
    api.get('/ai/status/')
      .then(({ data }) => { if (active) setAiConfigured(data.configured); })
      .catch(() => { if (active) setAiConfigured(false); });
    return () => { active = false; };
  }, []);

  const send = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || sending) return;
    if (!consent) {
      setError('Confirm consent before sending your financial summary to the AI provider.');
      return;
    }
    setSending(true);
    setError('');
    setMessages((current) => [...current, { role: 'user', content: text }]);
    setQuestion('');
    try {
      const { data } = await api.post('/ai/assistant/', { question: text, consent: true });
      setMessages((current) => [...current, { role: 'assistant', content: data.content }]);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail || 'The AI provider could not answer. Please try again later.';
      setError(detail);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="bg-[#173d32] p-5 text-white">
        <div className="flex items-center gap-3"><Bot className="h-6 w-6" /><div><h1 className="text-xl font-semibold">MoneyMind AI Assistant</h1><p className="mt-1 text-sm text-emerald-100/75">Ask about your spending, budgets, or savings goals.</p></div></div>
      </header>
      <label className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>I agree to send my question, account summary, recent expense descriptions and amounts, and savings goals to OpenAI, as configured by MoneyMind. Do not include information you do not want processed.</span>
      </label>
      {aiConfigured === false && <p role="status" className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">AI generation is not configured. Ask your administrator to set OPENAI_API_KEY on the backend.</p>}
      <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6" aria-live="polite">
        {!messages.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Ask a question such as “Where am I spending the most this month?” Answers use only the financial summary available to your account.</p>}
        {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'ml-auto bg-emerald-800 text-white' : 'bg-slate-100 text-slate-800'}`}><span className="mb-1 block text-xs font-semibold opacity-70">{message.role === 'user' ? 'You' : 'MoneyMind AI Assistant'}</span>{message.content}</div>)}
        {sending && <p role="status" className="text-sm text-slate-500">MoneyMind AI is preparing a response...</p>}
      </div>
      {error && <p role="alert" className="mx-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-4">
        <label className="sr-only" htmlFor="assistant-question">Ask MoneyMind AI Assistant</label>
        <textarea id="assistant-question" rows="2" maxLength="1000" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} placeholder="Ask a financial question..." className="min-w-0 flex-1 resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={sending || !question.trim()} aria-label="Send message" className="inline-flex min-h-11 items-center gap-2 self-end rounded-xl bg-[#173d32] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span></button>
      </form>
    </div>
  );
}
