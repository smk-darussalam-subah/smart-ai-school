'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  activateRemedialSession,
  cancelRemedialSession,
  createRemedialSession,
  fetchQuestions,
  fetchRemedialCandidates,
  fetchRemedialSessions,
  finalizeRemedialParticipant,
  retryRemedialParticipant,
  type AssessmentSessionData,
  type QuestionSelectionData,
  type RemedialCandidateData,
} from '../actions';

interface Props {
  subject: string;
  classId: string;
  className: string;
  academicYear: string;
  semester: number;
}

interface QuestionOption {
  id: string;
  type: string;
  body: string;
  difficulty: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  active: 'Aktif',
  completed: 'Selesai',
  cancelled: 'Batal',
};

const PARTICIPANT_LABEL: Record<string, string> = {
  assigned: 'Ditugaskan',
  in_progress: 'Dikerjakan',
  submitted: 'Terkirim',
  passed: 'Lulus',
  needs_retry: 'Perlu retry',
  cancelled: 'Batal',
};

function toWibIso(localValue: string): string | undefined {
  if (!localValue) return undefined;
  return new Date(`${localValue}:00+07:00`).toISOString();
}

function shortText(value: string, max = 110): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

export default function RemedialPanel({ subject, classId, className, academicYear, semester }: Props) {
  const ready = subject !== 'all' && classId !== 'all';
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidates, setCandidates] = useState<RemedialCandidateData[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [sessions, setSessions] = useState<AssessmentSessionData[]>([]);
  const [questions, setQuestions] = useState<QuestionOption[]>([]);
  const [selectedGradeIds, setSelectedGradeIds] = useState<string[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const requestSeq = useRef(0);

  const questionSelections = useMemo<QuestionSelectionData[]>(() =>
    selectedQuestionIds.map((questionId, order) => ({ questionId, order, points: 10 })),
  [selectedQuestionIds]);

  const refresh = useCallback(async () => {
    if (!ready) {
      setCandidates([]);
      setSessions([]);
      setQuestions([]);
      return;
    }
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    setLoading(true);
    setError('');
    try {
      const [candidateRes, sessionRes, questionRes] = await Promise.all([
        fetchRemedialCandidates({ classId, subject, academicYear, semester, search: candidateSearch, limit: 50 }),
        fetchRemedialSessions({ classId, subject, academicYear, semester, limit: 50 }),
        fetchQuestions(subject, { limit: 50 }),
      ]);
      if (requestSeq.current !== requestId) return;
      if (!candidateRes.success) setError(candidateRes.error ?? 'Gagal memuat kandidat remedial.');
      if (!sessionRes.success) setError(sessionRes.error ?? 'Gagal memuat sesi remedial.');
      if (!questionRes.success) setError(questionRes.error ?? 'Gagal memuat Bank Soal.');
      setCandidates(candidateRes.data?.data ?? []);
      setCandidateTotal(candidateRes.data?.total ?? 0);
      setSessions(sessionRes.data?.data ?? []);
      const questionData = (questionRes.data as { data?: QuestionOption[] } | undefined)?.data ?? [];
      setQuestions(questionData);
    } catch {
      if (requestSeq.current === requestId) setError('Gagal memuat data remedial.');
    } finally {
      if (requestSeq.current === requestId) setLoading(false);
    }
  }, [academicYear, candidateSearch, classId, ready, semester, subject]);

  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, candidateSearch ? 300 : 0);
    return () => clearTimeout(timer);
  }, [refresh, candidateSearch]);

  useEffect(() => {
    setSelectedGradeIds([]);
    setSelectedQuestionIds([]);
    setTitle(subject !== 'all' ? `Remedial ${subject} ${className}` : '');
    setMessage('');
  }, [className, classId, subject]);

  const toggle = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, successText: string) => {
    setError('');
    setMessage('');
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error ?? 'Aksi remedial gagal.');
        return;
      }
      setMessage(successText);
      await refresh();
    });
  };

  const create = () => {
    run(async () => {
      const result = await createRemedialSession({
        title: title.trim(),
        sourceGradeIds: selectedGradeIds,
        questionSelections,
        ...(dueAt ? { dueAt: toWibIso(dueAt) } : {}),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        durationMinutes: 60,
        randomizeOrder: true,
      });
      if (result.success) {
        setSelectedGradeIds([]);
        setSelectedQuestionIds([]);
      }
      return result;
    }, 'Sesi remedial dibuat sebagai draft.');
  };

  if (!ready) {
    return (
      <div className="rounded-xl border border-dashed border-[#dfe9e4] p-6 text-center text-[12.5px] font-semibold text-[#6b8079]">
        Pilih mapel dan kelas terlebih dahulu untuk membuka workflow remedial.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
        Remedial memakai Assessment Runtime yang sama. Nilai hanya dinaikkan ke KKTP setelah guru memfinalisasi hasil lulus.
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</p>}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-bold text-[#0f2e25]">Kandidat di bawah KKTP</h4>
              <p className="text-xs font-semibold text-[#6b8079]">{candidates.length} tampil dari {candidateTotal} kandidat</p>
            </div>
            <div className="relative sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#8aa096]" />
              <Input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} className="pl-8" placeholder="Cari siswa..." />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-[#e6efea]">
            {loading ? (
              <div className="p-5 text-center text-sm text-muted-foreground">Memuat...</div>
            ) : candidates.length === 0 ? (
              <div className="p-5 text-center text-sm text-muted-foreground">Tidak ada kandidat remedial untuk filter ini.</div>
            ) : candidates.map((candidate) => (
              <label key={candidate.gradeId} className="flex cursor-pointer items-center gap-3 border-b border-[#eef4f1] px-3 py-2 last:border-b-0">
                <input
                  type="checkbox"
                  checked={selectedGradeIds.includes(candidate.gradeId)}
                  onChange={() => toggle(candidate.gradeId, selectedGradeIds, setSelectedGradeIds)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#0f2e25]">{candidate.studentName}</span>
                  <span className="block text-xs font-semibold text-[#6b8079]">
                    {candidate.nis} | {candidate.type.toUpperCase()} | nilai {candidate.score} / KKTP {candidate.kktpValue} ({candidate.kktpProvenance})
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-[#e6efea] p-3">
          <h4 className="text-sm font-bold text-[#0f2e25]">Buat sesi remedial</h4>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Judul sesi remedial" />
          <Input type="datetime-local" step={60} value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            maxLength={2000}
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Instruksi untuk siswa..."
          />
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-[#6b8079]">Soal dari Bank Soal</div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-[#e6efea]">
              {questions.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Belum ada soal untuk mapel ini.</div>
              ) : questions.map((question) => (
                <label key={question.id} className="flex cursor-pointer gap-2 border-b border-[#eef4f1] px-3 py-2 text-xs last:border-b-0">
                  <input
                    type="checkbox"
                    checked={selectedQuestionIds.includes(question.id)}
                    onChange={() => toggle(question.id, selectedQuestionIds, setSelectedQuestionIds)}
                  />
                  <span>
                    <span className="font-bold text-[#0f2e25]">{question.type} | {question.difficulty}</span>
                    <span className="block text-[#6b8079]">{shortText(question.body)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Button
            type="button"
            disabled={pending || selectedGradeIds.length === 0 || selectedQuestionIds.length === 0 || title.trim().length < 3}
            onClick={create}
            className="w-full"
          >
            Buat Draft Remedial
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-bold text-[#0f2e25]">Registry remedial</h4>
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#dfe9e4] p-5 text-center text-sm text-muted-foreground">Belum ada sesi remedial.</div>
        ) : sessions.map((session) => (
          <article key={session.id} className="rounded-xl border border-[#e6efea] p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-bold text-[#0f2e25]">{session.title}</div>
                <div className="text-xs font-semibold text-[#6b8079]">
                  {session.teachingAssignment?.subject ?? subject} | {session.class?.name ?? className} | jatuh tempo {session.dueAt ? new Date(session.dueAt).toLocaleString('id-ID') : '-'}
                </div>
              </div>
              <Badge variant={session.status === 'active' ? 'default' : session.status === 'cancelled' ? 'destructive' : 'secondary'}>{STATUS_LABEL[session.status] ?? session.status}</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {(session.remedialParticipants ?? []).map((participant) => (
                <div key={participant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f8fbf9] px-3 py-2">
                  <div className="text-xs">
                    <div className="font-bold text-[#0f2e25]">{participant.student.user.fullName} ({participant.student.nis})</div>
                    <div className="font-semibold text-[#6b8079]">
                      sumber {Number(participant.sourceScore)} | hasil {participant.rawScore ?? '-'} | KKTP {Number(participant.kktpValue)} | {PARTICIPANT_LABEL[participant.status] ?? participant.status}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {participant.status === 'submitted' && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => finalizeRemedialParticipant(session.id, participant.id), 'Peserta remedial difinalisasi.')}>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Finalisasi
                      </Button>
                    )}
                    {participant.status === 'needs_retry' && selectedQuestionIds.length > 0 && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryRemedialParticipant(session.id, {
                        participantId: participant.id,
                        questionSelections,
                        title: `Retry ${session.title}`,
                        ...(dueAt ? { dueAt: toWibIso(dueAt) } : {}),
                        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
                      }), 'Retry remedial dibuat.')}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Retry
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {session.status === 'draft' && (
                <Button size="sm" disabled={pending} onClick={() => run(() => activateRemedialSession(session.id), 'Sesi remedial diaktifkan.')}>Aktifkan</Button>
              )}
              {(session.status === 'draft' || session.status === 'active') && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => cancelRemedialSession(session.id, 'Dibatalkan dari panel remedial'), 'Sesi remedial dibatalkan.')}>
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />Batalkan
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>

      {selectedQuestionIds.length === 0 && (
        <div className="flex gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Pilih soal dari Bank Soal untuk membuat sesi baru atau retry peserta.
        </div>
      )}
    </div>
  );
}
