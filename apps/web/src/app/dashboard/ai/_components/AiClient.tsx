'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { setupAiChatMountedGuard, shouldApplyAiChatResponse, shouldSendChatKey } from '../ai-chat-ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string }[];
}

interface ChatSessionSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface SessionListResponse {
  data?: ChatSessionSummary[];
}

interface HistoryResponse {
  messages?: Array<{ role: string; content: string }>;
}

async function parseError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null) as { message?: string; error?: string } | null;
  return data?.message ?? data?.error ?? 'Permintaan gagal diproses.';
}

export default function AiClient({ initialQuestion = '' }: { initialQuestion?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const sendControllerRef = useRef<AbortController | null>(null);
  const historyControllerRef = useRef<AbortController | null>(null);
  const requestEpochRef = useRef(0);

  useEffect(() => {
    return setupAiChatMountedGuard(mountedRef, () => {
      sendControllerRef.current?.abort();
      historyControllerRef.current?.abort();
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const loadSessions = async (signal?: AbortSignal) => {
    const res = await fetch('/api/backend/ai/chat/sessions?limit=20', { cache: 'no-store', signal });
    if (!res.ok) throw new Error(await parseError(res));
    const data = await res.json() as SessionListResponse;
    if (signal?.aborted || !mountedRef.current) return;
    setSessions(data.data ?? []);
  };

  const invalidateActiveRequests = () => {
    requestEpochRef.current += 1;
    sendControllerRef.current?.abort();
    historyControllerRef.current?.abort();
    sendControllerRef.current = null;
    historyControllerRef.current = null;
    inFlightRef.current = false;
    setLoading(false);
  };

  const loadHistory = async (id: string, signal?: AbortSignal) => {
    invalidateActiveRequests();
    const epoch = requestEpochRef.current;
    const controller = signal ? null : new AbortController();
    const activeSignal = signal ?? controller!.signal;
    if (controller) historyControllerRef.current = controller;
    setSessionLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/backend/ai/chat/${id}/history`, { cache: 'no-store', signal: activeSignal });
      if (!res.ok) throw new Error(await parseError(res));
      const data = await res.json() as HistoryResponse;
      if (!shouldApplyAiChatResponse({ requestEpoch: epoch, currentEpoch: requestEpochRef.current, aborted: activeSignal.aborted, mounted: mountedRef.current })) return;
      setMessages((data.messages ?? []).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })));
      setSessionId(id);
      localStorage.setItem('diis-ai-session-id', id);
    } catch (err) {
      if (!shouldApplyAiChatResponse({ requestEpoch: epoch, currentEpoch: requestEpochRef.current, aborted: activeSignal.aborted, mounted: mountedRef.current })) return;
      setError(err instanceof Error ? err.message : 'Gagal memuat riwayat chat.');
      localStorage.removeItem('diis-ai-session-id');
    } finally {
      if (historyControllerRef.current === controller) historyControllerRef.current = null;
      if (shouldApplyAiChatResponse({ requestEpoch: epoch, currentEpoch: requestEpochRef.current, aborted: activeSignal.aborted, mounted: mountedRef.current })) setSessionLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const init = async () => {
      try {
        const prefill = initialQuestion.trim().slice(0, 500);
        const savedSessionId = localStorage.getItem('diis-ai-session-id');
        const res = await fetch('/api/backend/ai/chat/sessions?limit=20', { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(await parseError(res));
        const data = await res.json() as SessionListResponse;
        if (controller.signal.aborted || !mountedRef.current) return;
        const nextSessions = data.data ?? [];
        setSessions(nextSessions);
        if (prefill) {
          setSessionId(null);
          setMessages([]);
          setInput(prefill);
          localStorage.removeItem('diis-ai-session-id');
          return;
        }
        const targetId = savedSessionId && nextSessions.some((session) => session.id === savedSessionId)
          ? savedSessionId
          : nextSessions[0]?.id;
        if (targetId) await loadHistory(targetId, controller.signal);
      } catch (err) {
        if (!controller.signal.aborted && mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Gagal memuat daftar chat.');
        }
      }
    };
    void init();
    return () => { controller.abort(); };
  }, [initialQuestion]);

  const startNew = () => {
    invalidateActiveRequests();
    setSessionId(null);
    setMessages([]);
    setError('');
    localStorage.removeItem('diis-ai-session-id');
  };

  const deleteSession = async (id: string) => {
    if (!window.confirm('Hapus riwayat chat ini?')) return;
    invalidateActiveRequests();
    setDeletingId(id);
    setError('');
    try {
      const res = await fetch(`/api/backend/ai/chat/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await parseError(res));
      if (sessionId === id) startNew();
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus chat.');
    } finally {
      setDeletingId(null);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || inFlightRef.current) return;
    inFlightRef.current = true;
    const epoch = requestEpochRef.current + 1;
    requestEpochRef.current = epoch;
    setLoading(true);
    setError('');
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const controller = new AbortController();
      sendControllerRef.current = controller;
      const res = await fetch('/api/backend/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, ...(sessionId ? { sessionId } : {}) }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(await parseError(res));
      const data = await res.json() as { answer?: string; sources?: { title: string }[]; sessionId?: string };
      if (!shouldApplyAiChatResponse({ requestEpoch: epoch, currentEpoch: requestEpochRef.current, aborted: controller.signal.aborted, mounted: mountedRef.current })) return;
      const nextSessionId = data.sessionId ?? sessionId;
      if (nextSessionId) {
        setSessionId(nextSessionId);
        localStorage.setItem('diis-ai-session-id', nextSessionId);
      }
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.answer ?? 'Tidak ada respons.',
        sources: Array.isArray(data.sources) ? data.sources : undefined,
      }]);
      await loadSessions(controller.signal);
    } catch (err) {
      if (!shouldApplyAiChatResponse({ requestEpoch: epoch, currentEpoch: requestEpochRef.current, mounted: mountedRef.current }) || (err instanceof DOMException && err.name === 'AbortError')) return;
      setInput(text);
      setError(err instanceof Error ? err.message : 'Gagal menghubungi AI. Coba lagi.');
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Gagal menghubungi AI. Pertanyaan dikembalikan ke kotak input untuk dicoba lagi.' }]);
    } finally {
      if (shouldApplyAiChatResponse({ requestEpoch: epoch, currentEpoch: requestEpochRef.current, mounted: mountedRef.current })) {
        inFlightRef.current = false;
        sendControllerRef.current = null;
        if (mountedRef.current) setLoading(false);
      }
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">AI Asisten</h1>
          <Button type="button" size="icon" variant="outline" onClick={startNew} aria-label="Chat baru">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Card className="max-h-[calc(100vh-190px)] overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">Belum ada riwayat chat.</div>
          ) : sessions.map((session) => (
            <div key={session.id} className={`mb-1 rounded-lg border ${session.id === sessionId ? 'border-smk-blue bg-blue-50' : 'border-transparent'}`}>
              <button
                type="button"
                onClick={() => loadHistory(session.id)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{session.title ?? 'Chat tanpa judul'}</span>
              </button>
              <div className="flex justify-end px-2 pb-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={deletingId === session.id}
                  onClick={() => deleteSession(session.id)}
                  aria-label="Hapus chat"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </aside>

      <Card className="flex h-[calc(100vh-155px)] min-h-[560px] flex-col">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">{sessionId ? 'Percakapan aktif' : 'Chat baru'}</div>
          {error && <div className="mt-1 text-sm font-medium text-red-600">{error}</div>}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sessionLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Memuat riwayat...</div>
          ) : messages.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <p className="text-lg font-medium">AI Asisten DIIS</p>
              <p className="text-sm">Tanyakan informasi sekolah, pembelajaran, atau operasional yang tersedia di knowledge base.</p>
            </div>
          ) : messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-lg px-4 py-2 text-sm ${message.role === 'user' ? 'bg-smk-blue text-white' : 'bg-gray-100 text-gray-900'}`}>
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 border-t border-gray-200 pt-1.5 text-[11px] text-gray-500">
                    <span className="font-semibold">Sumber: </span>
                    {message.sources.map((source, idx) => (
                      <span key={`${source.title}-${idx}`}>{idx > 0 ? ', ' : ''}{source.title}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-muted-foreground">Menunggu respons AI...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ketik pertanyaan..."
              rows={2}
              onKeyDown={(event) => {
                if (shouldSendChatKey(event)) {
                  event.preventDefault();
                  void send();
                }
              }}
              disabled={loading || sessionLoading}
            />
            <Button type="button" onClick={() => void send()} disabled={loading || sessionLoading || !input.trim()} className="bg-smk-blue hover:bg-primary-700">
              <Send className="mr-2 h-4 w-4" />
              Kirim
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
