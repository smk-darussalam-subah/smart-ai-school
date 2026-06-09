'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

interface Message { role: 'user' | 'assistant'; content: string; }

export default function AiClient(_props: { isAuthenticated: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setLoading(true);

    try {
      const res = await fetch('/api/backend/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: input }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.message || 'Maaf, tidak ada respons.' }]);
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
              </div>
            </div>
          ))}
          {loading && <div className="text-sm text-muted-foreground">AI sedang berpikir...</div>}
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
