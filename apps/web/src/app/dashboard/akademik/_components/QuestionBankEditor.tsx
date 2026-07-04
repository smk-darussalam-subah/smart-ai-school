'use client';

// QuestionBankEditor — CRUD soal via /questions API (P20 — W3-2).
// Supports: multiple_choice, essay, true_false.
// AI Generate button calls /ai/generate-questions (rate-limited 10/min).

import { useState, useTransition, useEffect } from 'react';
import { Database, Plus, Trash2, Pencil, X, Sparkles, Loader2, Check, AlertTriangle, Download, Upload } from 'lucide-react';
import clsx from 'clsx';
import {
  fetchQuestions, createQuestion, updateQuestion, deleteQuestion,
  aiGenerateQuestions, exportQuestionsCsv, importQuestionsCsv,
  type QuestionData, type EssayRubricCriteria,
} from '../actions';

interface Question extends QuestionData {
  id: string;
}

interface Props {
  subject: string;
  onClose: () => void;
}

const FIELD = 'w-full rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[13px] text-[#0f2e25] outline-none focus:border-emerald-400';
const BTN = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold transition-colors';
const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'PG',
  essay: 'Essay',
  true_false: 'B/S',
};
const DIFF_LABELS: Record<string, string> = {
  easy: 'Mudah',
  medium: 'Sedang',
  hard: 'Sulit',
};

export default function QuestionBankEditor({ subject, onClose }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const [aiLoading, startAi] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fType, setFType] = useState<QuestionData['type']>('multiple_choice');
  const [fBody, setFBody] = useState('');
  const [fOptions, setFOptions] = useState<string[]>(['', '', '', '']);
  const [fAnswer, setFAnswer] = useState('');
  const [fDifficulty, setFDifficulty] = useState<QuestionData['difficulty']>('medium');
  // U2 Wave 2: essay rubrik state
  const [fRubric, setFRubric] = useState<EssayRubricCriteria[]>([]);
  // U2 Wave 4: CSV import state
  const [csvResult, setCsvResult] = useState<{ imported: number; errors: Array<{ row: number; message: string }> } | null>(null);
  const [csvLoading, startCsv] = useTransition();

  // Load questions on mount
  useEffect(() => {
    startLoad(async () => {
      const res = await fetchQuestions(subject);
      if (res.success && res.data) {
        // API returns { data: [...], total } or array
        const data = Array.isArray(res.data) ? res.data : (res.data as { data: Question[] }).data ?? [];
        setQuestions(data);
      } else {
        setErr(res.error ?? 'Gagal memuat soal.');
      }
    });
  }, [subject]);

  const resetForm = () => {
    setFType('multiple_choice');
    setFBody('');
    setFOptions(['', '', '', '']);
    setFAnswer('');
    setFDifficulty('medium');
    setFRubric([]); // U2 Wave 2
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (q: Question) => {
    setEditingId(q.id);
    setFType(q.type);
    setFBody(q.body);
    setFOptions(q.options ?? ['', '', '', '']);
    setFAnswer(q.answer ?? '');
    setFDifficulty(q.difficulty);
    setFRubric(q.rubric ?? []); // U2 Wave 2
    setShowForm(true);
  };

  const handleSave = () => {
    setErr(null);
    if (fBody.trim().length < 5) {
      setErr('Isi soal minimal 5 karakter.');
      return;
    }
    if (fType === 'multiple_choice' && fOptions.filter((o) => o.trim()).length < 2) {
      setErr('PG minimal 2 opsi.');
      return;
    }

    const data: QuestionData = {
      subject,
      type: fType,
      body: fBody.trim(),
      difficulty: fDifficulty,
      ...(fType === 'multiple_choice' ? { options: fOptions.filter((o) => o.trim()), answer: fAnswer } : {}),
      ...(fType === 'essay' ? { answer: fAnswer, ...(fRubric.length > 0 ? { rubric: fRubric } : {}) } : {}),
      ...(fType === 'true_false' ? { answer: fAnswer || 'true' } : {}),
    };

    startSave(async () => {
      if (editingId) {
        const res = await updateQuestion(editingId, data);
        if (!res.success) { setErr(res.error ?? 'Gagal menyimpan.'); return; }
        setQuestions((prev) => prev.map((q) => q.id === editingId ? { ...q, ...data } : q));
      } else {
        const res = await createQuestion(data);
        if (!res.success) { setErr(res.error ?? 'Gagal membuat soal.'); return; }
        if (res.data) setQuestions((prev) => [...prev, res.data as Question]);
      }
      resetForm();
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Hapus soal ini?')) return;
    startSave(async () => {
      const res = await deleteQuestion(id);
      if (!res.success) { setErr(res.error ?? 'Gagal menghapus.'); return; }
      setQuestions((prev) => prev.filter((q) => q.id !== id));
    });
  };

  const handleAiGenerate = () => {
    setErr(null);
    startAi(async () => {
      const res = await aiGenerateQuestions({
        rppBody: fBody || subject,
        subject,
        count: 5,
        type: fType,
      });
      if (!res.success) {
        const msg = res.error ?? 'Gagal generate AI.';
        setErr(msg.includes('429') ? 'Rate limit tercapai (10/menit). Coba lagi nanti.' : msg);
        return;
      }
      // AI returns generated questions — add to list as draft
      const aiData = res.data as { output: Question[] };
      if (aiData?.output && Array.isArray(aiData.output)) {
        setQuestions((prev) => [...prev, ...aiData.output.map((q) => ({ ...q, id: `ai-${Date.now()}-${Math.random()}` }))]);
      }
    });
  };

  // U2 Wave 4: Export CSV handler
  const handleExportCsv = () => {
    setErr(null);
    startCsv(async () => {
      const res = await exportQuestionsCsv(subject || undefined);
      if (res.success && res.data) {
        const csv = (res.data as { csv: string }).csv;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `soal-${subject || 'all'}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setErr(res.error ?? 'Gagal export CSV.');
      }
    });
  };

  // U2 Wave 4: Import CSV handler
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvResult(null);
    setErr(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? '';
      // Simple CSV parser — handles quoted fields
      const lines: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (inQuotes) {
          if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
          else if (ch === '"') { inQuotes = false; }
          else { current += ch; }
        } else {
          if (ch === '"') { inQuotes = true; }
          else if (ch === '\n') { lines.push(current); current = ''; }
          else if (ch !== '\r') { current += ch; }
        }
      }
      if (current) lines.push(current);

      // Skip header row, parse data rows
      const dataLines = lines.slice(1).filter((l) => l.trim());
      const rows = dataLines.map((line) => {
        const cells: string[] = [];
        let cell = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]!;
          if (inQ) {
            if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') { inQ = false; }
            else { cell += ch; }
          } else {
            if (ch === '"') { inQ = true; }
            else if (ch === ',') { cells.push(cell); cell = ''; }
            else { cell += ch; }
          }
        }
        cells.push(cell);
        return {
          type: cells[0]?.trim() ?? 'multiple_choice',
          body: cells[1]?.trim() ?? '',
          options: cells[2]?.trim() || undefined,
          answer: cells[3]?.trim() || undefined,
          difficulty: (cells[4]?.trim() || 'medium') as 'easy' | 'medium' | 'hard',
          tags: cells[5]?.trim() || undefined,
        };
      }).filter((r) => r.body.length >= 3);

      if (rows.length === 0) {
        setErr('CSV tidak memiliki baris data yang valid.');
        return;
      }

      startCsv(async () => {
        const res = await importQuestionsCsv(subject, rows);
        if (res.success && res.data) {
 setCsvResult(res.data as { imported: number; errors: Array<{ row: number; message: string }> });
          // Reload questions
          const fetchRes = await fetchQuestions(subject);
          if (fetchRes.success && fetchRes.data) {
            const data = Array.isArray(fetchRes.data) ? fetchRes.data : (fetchRes.data as { data: Question[] }).data ?? [];
            setQuestions(data);
          }
        } else {
          setErr(res.error ?? 'Gagal import CSV.');
        }
      });
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Bank Soal" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-[#0f2e25]">
            <Database className="h-5 w-5 text-emerald-600" />Bank Soal — {subject || 'Semua'}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error */}
        {err && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">
            <AlertTriangle className="h-3 w-3" />{err}
          </div>
        )}

        {/* Question list */}
        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="grid h-32 place-items-center text-[12.5px] text-[#9bb0a8]">
              <Loader2 className="h-5 w-5 animate-spin" /> Memuat soal...
            </div>
          ) : questions.length === 0 ? (
            <div className="grid h-32 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
              Belum ada soal. Klik &quot;Tambah Soal&quot; atau &quot;Generate AI&quot; untuk memulai.
            </div>
          ) : (
            questions.map((q, idx) => (
              <div key={q.id} className="rounded-xl border border-[#e6efea] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{TYPE_LABELS[q.type] ?? q.type}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{DIFF_LABELS[q.difficulty] ?? q.difficulty}</span>
                      <span className="text-[10px] text-[#9bb0a8]">#{idx + 1}</span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-[#0f2e25]">{q.body}</p>
                    {q.type === 'multiple_choice' && q.options && (
                      <div className="mt-1.5 space-y-0.5">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-1.5 text-[11.5px]">
                            <span className={clsx('flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
                              q.answer === opt ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500')}>
                              {q.answer === opt ? <Check className="h-2.5 w-2.5" /> : String.fromCharCode(65 + oi)}
                            </span>
                            <span className={q.answer === opt ? 'font-bold text-emerald-700' : 'text-[#355a4e]'}>{opt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {q.answer && q.type !== 'multiple_choice' && (
                      <p className="mt-1 text-[11px] font-semibold text-emerald-700">Jawaban: {q.answer}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => startEdit(q)} className="rounded-lg p-1.5 text-[#6b8079] hover:bg-[#f4f7f5]" aria-label="Edit soal">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(q.id)} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50" aria-label="Hapus soal">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
            <h4 className="mb-3 text-[13px] font-bold text-[#0f2e25]">{editingId ? 'Edit Soal' : 'Tambah Soal'}</h4>
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <select value={fType} onChange={(e) => setFType(e.target.value as QuestionData['type'])} className={FIELD} style={{ maxWidth: '160px' }}>
                  <option value="multiple_choice">Pilihan Ganda</option>
                  <option value="essay">Essay</option>
                  <option value="true_false">Benar/Salah</option>
                </select>
                <select value={fDifficulty} onChange={(e) => setFDifficulty(e.target.value as QuestionData['difficulty'])} className={FIELD} style={{ maxWidth: '140px' }}>
                  <option value="easy">Mudah</option>
                  <option value="medium">Sedang</option>
                  <option value="hard">Sulit</option>
                </select>
              </div>
              <textarea
                value={fBody}
                onChange={(e) => setFBody(e.target.value)}
                placeholder="Tulis pertanyaan di sini..."
                className={FIELD}
                rows={3}
              />
              {fType === 'multiple_choice' && (
                <div className="space-y-1.5">
                  {fOptions.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFAnswer(opt)}
                        className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                          fAnswer === opt ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500')}
                        aria-label={`Set ${String.fromCharCode(65 + oi)} sebagai jawaban benar`}
                      >
                        {fAnswer === opt ? <Check className="h-3 w-3" /> : String.fromCharCode(65 + oi)}
                      </button>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => setFOptions((prev) => prev.map((o, i) => i === oi ? e.target.value : o))}
                        placeholder={`Opsi ${String.fromCharCode(65 + oi)}`}
                        className={FIELD}
                      />
                    </div>
                  ))}
                  <p className="text-[10.5px] text-[#9bb0a8]">Klik lingkaran untuk menandai jawaban benar.</p>
                </div>
              )}
              {fType === 'essay' && (
                <>
                  <input
                    type="text"
                    value={fAnswer}
                    onChange={(e) => setFAnswer(e.target.value)}
                    placeholder="Kunci jawaban (opsional untuk essay)"
                    className={FIELD}
                  />
                  {/* U2 Wave 2: Rubric builder */}
                  <div className="rounded-lg border border-[#e6efea] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#6b8079]">Rubrik Penilaian (opsional)</span>
                      {fRubric.length > 0 && (
                        <span className={clsx('text-[10px] font-bold',
                          Math.abs(fRubric.reduce((s, c) => s + c.weight, 0) - 1) < 0.01 ? 'text-emerald-600' : 'text-amber-600')}>
                          Total bobot: {fRubric.reduce((s, c) => s + c.weight, 0).toFixed(2)}
                          {Math.abs(fRubric.reduce((s, c) => s + c.weight, 0) - 1) < 0.01 ? ' ✓' : ' ⚠ idealnya 1.0'}
                        </span>
                      )}
                    </div>
                    {fRubric.map((c, ci) => (
                      <div key={ci} className="mb-2 flex items-start gap-2">
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => setFRubric((prev) => prev.map((x, i) => i === ci ? { ...x, name: e.target.value } : x))}
                          placeholder="Nama kriteria"
                          className={clsx(FIELD, 'flex-1')}
                        />
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={c.weight}
                          onChange={(e) => setFRubric((prev) => prev.map((x, i) => i === ci ? { ...x, weight: Number(e.target.value) } : x))}
                          placeholder="Bobot"
                          className={clsx(FIELD, 'w-16')}
                        />
                        <input
                          type="number"
                          min="1"
                          value={c.maxScore}
                          onChange={(e) => setFRubric((prev) => prev.map((x, i) => i === ci ? { ...x, maxScore: Number(e.target.value) } : x))}
                          placeholder="Max"
                          className={clsx(FIELD, 'w-16')}
                        />
                        <button
                          type="button"
                          onClick={() => setFRubric((prev) => prev.filter((_, i) => i !== ci))}
                          className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50"
                          aria-label="Hapus kriteria"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFRubric((prev) => [...prev, { id: `c${prev.length + 1}`, name: '', weight: 0, maxScore: 100, description: '' }])}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"
                    >
                      <Plus className="h-3 w-3" />Tambah Kriteria
                    </button>
                  </div>
                </>
              )}
              {fType === 'true_false' && (
                <select value={fAnswer} onChange={(e) => setFAnswer(e.target.value)} className={FIELD} style={{ maxWidth: '120px' }}>
                  <option value="true">Benar</option>
                  <option value="false">Salah</option>
                </select>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={resetForm} className={clsx(BTN, 'border border-[#e6efea] bg-white text-[#355a4e] hover:bg-[#f4f7f5]')}>Batal</button>
                <button type="button" onClick={handleSave} disabled={saving} className={clsx(BTN, 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50')}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {editingId ? 'Simpan' : 'Tambah'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer buttons */}
        {!showForm && (
          <div className="mt-4">
            {/* U2 Wave 4: CSV import result */}
            {csvResult && (
              <div className="mb-3 rounded-lg border border-[#e6efea] bg-[#f9fbfa] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-700">
                  <Check className="h-3.5 w-3.5" />Import berhasil: {csvResult.imported} soal ditambahkan
                </div>
                {csvResult.errors.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {csvResult.errors.slice(0, 5).map((e, i) => (
                      <div key={i} className="text-[10.5px] text-rose-600">Baris {e.row}: {e.message}</div>
                    ))}
                    {csvResult.errors.length > 5 && (
                      <div className="text-[10.5px] text-[#9bb0a8]">+{csvResult.errors.length - 5} error lainnya...</div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* U2 Wave 4: hidden file input for import */}
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCsv}
              className="hidden"
              id="csv-import-input"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={handleExportCsv} disabled={csvLoading || loading} className={clsx(BTN, 'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-50')}>
                {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export CSV
              </button>
              <button type="button" onClick={() => document.getElementById('csv-import-input')?.click()} disabled={csvLoading} className={clsx(BTN, 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50')}>
                {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import CSV
              </button>
              <button type="button" onClick={onClose} className={clsx(BTN, 'border border-[#e6efea] bg-white text-[#355a4e] hover:bg-[#f4f7f5]')}>Tutup</button>
              <button type="button" onClick={handleAiGenerate} disabled={aiLoading} className={clsx(BTN, 'border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50')}>
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate AI
              </button>
              <button type="button" onClick={() => { resetForm(); setShowForm(true); }} className={clsx(BTN, 'bg-emerald-600 text-white hover:bg-emerald-700')}>
                <Plus className="h-4 w-4" />Tambah Soal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
