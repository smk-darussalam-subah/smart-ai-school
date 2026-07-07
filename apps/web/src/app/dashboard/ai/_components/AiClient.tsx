'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

interface Message { role: 'user' | 'assistant'; content: string; sources?: { title: string }[]; }

export default function AiClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // R-33: Restore sessionId from localStorage on mount and fetch chat history
  useEffect(() => {
    const savedSessionId = localStorage.getItem('diis-ai-session-id');
    if (savedSessionId) {
      setSessionId(savedSessionId);
      fetch(`/api/backend/ai/chat/${savedSessionId}/history`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setMessages(
              data.map((m: { role: string; content: string }) => ({
                role: m.role === 'user' ? 'user' as const : 'assistant' as const,
                content: m.content,
              })),
            );
          }
        })
        .catch(() => { /* session may have expired */ });
    }
  }, []);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setLoading(true);

    try {
      const res = await fetch('/api/backend/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, ...(sessionId ? { sessionId } : {}) }),
      });
      const data = await res.json();
      // R-30: Backend returns { answer, sources, sessionId }
      const answer: string = data.answer || 'Maaf, tidak ada respons.';
      const sources: { title: string }[] | undefined = Array.isArray(data.sources) ? data.sources : undefined;
      // R-33: Save sessionId for persistent chat history
      if (data.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem('diis-ai-session-id', data.sessionId);
      }
      setMessages(prev => [...prev, { role: 'assistant', content: answer, sources }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Gagal menghubungi AI. Coba lagi.' }]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-gray-900">🤖 AI Asisten</h1>
      <Card className="flex flex-col h-[calc(100vh-220px)]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <p className="text-4xl mb-3">🤖</p>
              <p className="text-lg font-medium">AI Asisten DIIS</p>
              <p className="text-sm">Tanyakan tentang jadwal, nilai, informasi sekolah, dan lainnya.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${m.role === 'user' ? 'bg-smk-blue text-white' : 'bg-gray-100 text-gray-900'}`}>
                {m.content}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-2 border-t border-gray-200 pt-1.5 text-[11px] text-gray-500">
                    <span className="font-semibold">Sumber: </span>
                    {m.sources.map((s, si) => (
                      <span key={si}>{si > 0 ? ', ' : ''}{s.title}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-xl px-4 py-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t p-3 flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Ketik pertanyaan..."
            onKeyDown={e => e.key === 'Enter' && send()} disabled={loading} />
          <Button onClick={send} disabled={loading || !input.trim()} className="bg-smk-blue hover:bg-primary-700">Kirim</Button>
        </div>
      </Card>
    </div>
  );
}
