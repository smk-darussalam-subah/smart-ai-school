'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AlertTriangle, Check, Copy, Database, Download, Loader2, Pencil, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  createQuestion,
  deleteQuestion,
  exportQuestionsCsv,
  fetchQuestions,
  generateQuestionDrafts,
  importQuestionsCsv,
  acceptQuestionDrafts,
  rejectQuestionDrafts,
  regenerateQuestionDraftItem,
  updateQuestion,
  type AiQuestionDraftItem,
  type EssayRubricCriteria,
  type MatchingPair,
  type QuestionData,
  type QuestionDifficulty,
  type QuestionOption,
  type QuestionType,
} from '../actions';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  COGNITIVE_LEVELS,
  buildAiQuestionDraftRequest,
  isAiDistributionValid,
  normalizeSourceTpOptions,
  type AiCharacter,
  type AiContextMode,
  type AiPurpose,
  type CognitiveDistribution,
  type DifficultyDistribution,
  type QuestionSourceOption,
  type TypeDistribution,
} from './question-bank-ai-request';
import { buildQuestionImportIdentity } from './question-bank-import-identity';

export type { QuestionSourceOption } from './question-bank-ai-request';

interface QuestionRecord {
  id: string;
  subject: string;
  type: QuestionType;
  body: string;
  options?: unknown;
  answer?: unknown;
  pairs?: MatchingPair[];
  difficulty: QuestionDifficulty;
  tags?: string[];
  rubric?: unknown;
}

interface Props {
  subject: string;
  onClose: () => void;
  selectable?: boolean;
  selectedPoints?: Record<string, number>;
  onSelectedPointsChange?: (next: Record<string, number>) => void;
  moduleId?: string;
  rppId?: string;
  defaultTpRefs?: string[];
  sourceOptions?: QuestionSourceOption[];
}

const FIELD = 'w-full rounded-lg border border-[#dfe9e4] bg-white px-3 py-2 text-[13px] text-[#0f2e25] outline-none focus:border-emerald-400';
const BTN = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition-colors disabled:opacity-50';
const TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: 'multiple_choice', label: 'Pilihan ganda' },
  { value: 'true_false', label: 'Benar/salah' },
  { value: 'matching', label: 'Menjodohkan' },
  { value: 'essay', label: 'Esai rubrik' },
];
const TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'PG',
  true_false: 'B/S',
  matching: 'Match',
  essay: 'Esai',
};
const CSV_MAX_ROWS = 500;
const CSV_CHUNK_SIZE = 100;
const QUESTION_PAGE_SIZE = 50;
const DEFAULT_TP_REFS = ['TP 1'];

interface CsvImportError {
  row: number;
  column?: string;
  message: string;
}

interface CsvPreview {
  fileName: string;
  totalRows: number;
  validRows: Array<{ rowNumber: number; data: QuestionData }>;
  parseErrors: CsvImportError[];
}

function optionId(index: number): string {
  return String.fromCharCode(97 + index);
}

function defaultOptions(): QuestionOption[] {
  return [0, 1, 2, 3].map((index) => ({ id: optionId(index), text: '' }));
}

function defaultPairs(): MatchingPair[] {
  return [
    { id: 'p1', prompt: '', match: '' },
    { id: 'p2', prompt: '', match: '' },
  ];
}

function defaultRubric(): EssayRubricCriteria[] {
  return [{ id: 'c1', name: 'Ketepatan jawaban', weight: 100, maxScore: 100, description: '' }];
}

function normalizeOptions(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) return defaultOptions();
  const normalized = value.map((item, index) => {
    if (typeof item === 'string') return { id: optionId(index), text: item };
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      return {
        id: typeof record.id === 'string' ? record.id : optionId(index),
        text: typeof record.text === 'string' ? record.text : '',
      };
    }
    return { id: optionId(index), text: '' };
  });
  return normalized.length >= 2 ? normalized : defaultOptions();
}

function normalizePairs(value: unknown): MatchingPair[] {
  if (!Array.isArray(value)) return defaultPairs();
  const normalized = value.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      id: typeof record.id === 'string' ? record.id : `p${index + 1}`,
      prompt: typeof record.prompt === 'string' ? record.prompt : '',
      match: typeof record.match === 'string' ? record.match : '',
    };
  });
  return normalized.length >= 2 ? normalized : defaultPairs();
}

function normalizeRubric(value: unknown): EssayRubricCriteria[] {
  if (!Array.isArray(value)) return defaultRubric();
  const normalized = value.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      id: typeof record.id === 'string' ? record.id : `c${index + 1}`,
      name: typeof record.name === 'string' ? record.name : '',
      weight: typeof record.weight === 'number' ? record.weight : 100,
      maxScore: typeof record.maxScore === 'number' ? record.maxScore : 100,
      description: typeof record.description === 'string' ? record.description : '',
    };
  });
  return normalized.length > 0 ? normalized : defaultRubric();
}

function parseAnswerRecord(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, string>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, string>;
    } catch {
      return {};
    }
  }
  return {};
}

function parseJsonCell(value: string): unknown {
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseCsvRows(text: string): Array<{ cells: string[]; rowNumber: number }> {
  const rows: Array<{ cells: string[]; rowNumber: number }> = [];
  let cells: string[] = [];
  let current = '';
  let quoted = false;
  let rowNumber = 1;
  let currentRowNumber = 1;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      cells.push(current);
      rows.push({ cells, rowNumber: currentRowNumber });
      cells = [];
      current = '';
      if (char === '\r' && next === '\n') index++;
      rowNumber++;
      currentRowNumber = rowNumber;
    } else {
      current += char;
    }
  }
  if (current || cells.length > 0) {
    cells.push(current);
    rows.push({ cells, rowNumber: currentRowNumber });
  }
  return rows.slice(1);
}

function parseTagsCell(value: string): string[] {
  const parsed = parseJsonCell(value);
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  return value.split(/[|,]/).map((tag) => tag.trim()).filter(Boolean);
}

function csvTemplateCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvCellsToQuestion(cells: string[], fallbackSubject: string): QuestionData | null {
  const type = (cells[0]?.trim() || 'multiple_choice') as QuestionType;
  const rowSubject = cells[1]?.trim() || fallbackSubject;
  const body = cells[2]?.trim() || '';
  const difficulty = (cells[5]?.trim() || 'medium') as QuestionDifficulty;
  const tags = parseTagsCell(cells[6] ?? '');
  if (!rowSubject || body.length < 3 || !['easy', 'medium', 'hard'].includes(difficulty)) return null;

  if (type === 'multiple_choice') {
    const options = normalizeOptions(parseJsonCell(cells[3] ?? ''));
    const answer = cells[4]?.trim() || options[0]?.id || 'a';
    return { type, subject: rowSubject, body, options, answer, difficulty, tags };
  }
  if (type === 'true_false') {
    const answerText = (cells[4]?.trim() || 'false').toLowerCase();
    return { type, subject: rowSubject, body, answer: answerText === 'true' || answerText === 'benar', difficulty, tags };
  }
  if (type === 'matching') {
    const pairs = normalizePairs(parseJsonCell(cells[3] ?? ''));
    const answer = parseAnswerRecord(cells[4] ?? '');
    return { type, subject: rowSubject, body, pairs, answer, difficulty, tags };
  }
  if (type === 'essay') {
    const rubric = normalizeRubric(parseJsonCell(cells[7] ?? ''));
    const guideAnswer = cells[4]?.trim() || undefined;
    return { type, subject: rowSubject, body, guideAnswer, rubric, difficulty, tags };
  }
  return null;
}

export default function QuestionBankEditor({
  subject,
  onClose,
  selectable = false,
  selectedPoints = {},
  onSelectedPointsChange,
  moduleId,
  rppId,
  defaultTpRefs = DEFAULT_TP_REFS,
  sourceOptions = [],
}: Props) {
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [questionPage, setQuestionPage] = useState(1);
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionTypeFilter, setQuestionTypeFilter] = useState<'all' | QuestionType>('all');
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState<'all' | QuestionDifficulty>('all');
  const [loading, setLoading] = useState(false);
  const [saving, startSave] = useTransition();
  const [csvLoading, startCsv] = useTransition();
  const loadRequestRef = useRef(0);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [csvImportErrors, setCsvImportErrors] = useState<CsvImportError[]>([]);
  const [csvImportedRows, setCsvImportedRows] = useState<Set<number>>(() => new Set());
  const [aiDrafts, setAiDrafts] = useState<AiQuestionDraftItem[]>([]);
  const [aiGenerationId, setAiGenerationId] = useState<string | null>(null);
  const [aiSelected, setAiSelected] = useState<Set<string>>(() => new Set());
  const [editingDraftKey, setEditingDraftKey] = useState<string | null>(null);
  const [aiRegeneratingKey, setAiRegeneratingKey] = useState<string | null>(null);
  const [aiQuestionCount, setAiQuestionCount] = useState(4);
  const [aiPurpose, setAiPurpose] = useState<AiPurpose>('formatif');
  const [aiContextMode, setAiContextMode] = useState<AiContextMode>('auto_vokasi');
  const [aiCharacter, setAiCharacter] = useState<AiCharacter>('konseptual');
  const [aiTeacherInstruction, setAiTeacherInstruction] = useState('');
  const [aiSelectedTpRefs, setAiSelectedTpRefs] = useState<string[]>(defaultTpRefs);
  const [aiTypeDistribution, setAiTypeDistribution] = useState<TypeDistribution>({ multiple_choice: 2, true_false: 1, matching: 0, essay: 1 });
  const [aiDifficultyDistribution, setAiDifficultyDistribution] = useState<DifficultyDistribution>({ easy: 1, medium: 2, hard: 1 });
  const [aiCognitiveDistribution, setAiCognitiveDistribution] = useState<CognitiveDistribution>({ C1: 1, C2: 1, C3: 1, C4: 1, C5: 0, C6: 0 });

  const [fType, setFType] = useState<QuestionType>('multiple_choice');
  const [fBody, setFBody] = useState('');
  const [fDifficulty, setFDifficulty] = useState<QuestionDifficulty>('medium');
  const [fTags, setFTags] = useState('');
  const [fOptions, setFOptions] = useState<QuestionOption[]>(defaultOptions);
  const [fAnswer, setFAnswer] = useState('a');
  const [fTrueAnswer, setFTrueAnswer] = useState(true);
  const [fPairs, setFPairs] = useState<MatchingPair[]>(defaultPairs);
  const [fMatchingAnswer, setFMatchingAnswer] = useState<Record<string, string>>({ p1: 'p1', p2: 'p2' });
  const [fGuideAnswer, setFGuideAnswer] = useState('');
  const [fRubric, setFRubric] = useState<EssayRubricCriteria[]>(defaultRubric);

  const selectedCount = useMemo(() => Object.keys(selectedPoints).length, [selectedPoints]);
  const defaultSourceTpOptions = useMemo(() => defaultTpRefs.map((ref) => ({ ref, text: ref })), [defaultTpRefs]);
  const aiSources = useMemo<QuestionSourceOption[]>(() => {
    const direct: QuestionSourceOption[] = [
      ...(moduleId ? [{ sourceType: 'module' as const, id: moduleId, label: 'Modul LMS aktif', tpRefs: defaultTpRefs, tpOptions: defaultSourceTpOptions }] : []),
      ...(rppId ? [{ sourceType: 'rpp' as const, id: rppId, label: 'Modul Ajar aktif', tpRefs: defaultTpRefs, tpOptions: defaultSourceTpOptions }] : []),
    ];
    const seen = new Set<string>();
    return [...direct, ...sourceOptions].filter((source) => {
      const key = `${source.sourceType}:${source.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [defaultSourceTpOptions, defaultTpRefs, moduleId, rppId, sourceOptions]);
  const [aiSourceKey, setAiSourceKey] = useState(() => aiSources[0] ? `${aiSources[0].sourceType}:${aiSources[0].id}` : '');
  const selectedAiSource = aiSources.find((source) => `${source.sourceType}:${source.id}` === aiSourceKey) ?? aiSources[0] ?? null;
  const selectedAiTpOptions = selectedAiSource ? normalizeSourceTpOptions(selectedAiSource) : [];
  const canGenerateAi = Boolean(selectedAiSource && selectedAiTpOptions.length > 0);
  const aiDistributionValid = isAiDistributionValid({
    questionCount: aiQuestionCount,
    typeDistribution: aiTypeDistribution,
    difficultyDistribution: aiDifficultyDistribution,
    cognitiveDistribution: aiCognitiveDistribution,
  });
  const csvPendingRows = useMemo(
    () => csvPreview?.validRows.filter((row) => !csvImportedRows.has(row.rowNumber)) ?? [],
    [csvImportedRows, csvPreview],
  );
  const pageCount = Math.max(1, Math.ceil(questionTotal / QUESTION_PAGE_SIZE));

  const load = () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    void (async () => {
      const res = await fetchQuestions(subject, {
        limit: QUESTION_PAGE_SIZE,
        page: questionPage,
        ...(questionSearch.trim() ? { search: questionSearch.trim() } : {}),
        ...(questionTypeFilter !== 'all' ? { type: questionTypeFilter } : {}),
        ...(questionDifficultyFilter !== 'all' ? { difficulty: questionDifficultyFilter } : {}),
      });
      if (requestId !== loadRequestRef.current) return;
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Gagal memuat bank soal.');
        return;
      }
      const data = Array.isArray(res.data) ? res.data : (res.data as { data?: QuestionRecord[] }).data ?? [];
      const total = Array.isArray(res.data) ? data.length : (res.data as { total?: number }).total ?? data.length;
      setQuestions(data);
      setQuestionTotal(total);
    })().finally(() => {
      if (requestId === loadRequestRef.current) setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, [subject, questionPage, questionSearch, questionTypeFilter, questionDifficultyFilter]);

  useEffect(() => {
    setQuestionPage(1);
  }, [subject, questionSearch, questionTypeFilter, questionDifficultyFilter]);

  useEffect(() => {
    if (aiSources.length === 0) {
      setAiSourceKey('');
      return;
    }
    const firstSource = aiSources[0];
    if (!firstSource) return;
    setAiSourceKey((current) => {
      const currentStillAvailable = aiSources.some((source) => `${source.sourceType}:${source.id}` === current);
      return currentStillAvailable ? current : `${firstSource.sourceType}:${firstSource.id}`;
    });
    setAiSelectedTpRefs((current) => {
      const allowedRefs = normalizeSourceTpOptions(firstSource).map((tp) => tp.ref);
      const kept = current.filter((ref) => allowedRefs.includes(ref));
      return kept.length > 0 ? kept : allowedRefs;
    });
  }, [aiSources]);

  useEffect(() => {
    if (!selectedAiSource) {
      setAiSelectedTpRefs([]);
      return;
    }
    const allowedRefs = normalizeSourceTpOptions(selectedAiSource).map((tp) => tp.ref);
    setAiSelectedTpRefs((current) => {
      const kept = current.filter((ref) => allowedRefs.includes(ref));
      return kept.length > 0 ? kept : allowedRefs;
    });
  }, [selectedAiSource]);

  const resetForm = () => {
    setEditingId(null);
    setEditingDraftKey(null);
    setFType('multiple_choice');
    setFBody('');
    setFDifficulty('medium');
    setFTags('');
    setFOptions(defaultOptions());
    setFAnswer('a');
    setFTrueAnswer(true);
    setFPairs(defaultPairs());
    setFMatchingAnswer({ p1: 'p1', p2: 'p2' });
    setFGuideAnswer('');
    setFRubric(defaultRubric());
    setShowForm(false);
  };

  const startEdit = (question: QuestionRecord) => {
    setEditingId(question.id);
    setFType(question.type);
    setFBody(question.body);
    setFDifficulty(question.difficulty);
    setFTags((question.tags ?? []).join(', '));
    setFOptions(normalizeOptions(question.options));
    setFAnswer(typeof question.answer === 'string' ? question.answer : 'a');
    setFTrueAnswer(question.answer === true || question.answer === 'true');
    const pairs = normalizePairs(question.options ?? question.pairs);
    setFPairs(pairs);
    const answerRecord = parseAnswerRecord(question.answer);
    setFMatchingAnswer(Object.keys(answerRecord).length ? answerRecord : Object.fromEntries(pairs.map((pair) => [pair.id, pair.id])));
    setFGuideAnswer(typeof question.answer === 'string' && question.type === 'essay' ? question.answer : '');
    setFRubric(normalizeRubric(question.rubric));
    setShowForm(true);
  };

  const startEditDraft = (item: AiQuestionDraftItem) => {
    setEditingId(null);
    setEditingDraftKey(item.itemKey);
    setFType(item.question.type);
    setFBody(item.question.body);
    setFDifficulty(item.question.difficulty);
    setFTags((item.question.tags ?? []).join(', '));
    setFOptions(normalizeOptions('options' in item.question ? item.question.options : undefined));
    setFAnswer('answer' in item.question && typeof item.question.answer === 'string' ? item.question.answer : 'a');
    setFTrueAnswer('answer' in item.question && item.question.answer === true);
    const pairs = normalizePairs('pairs' in item.question ? item.question.pairs : undefined);
    setFPairs(pairs);
    setFMatchingAnswer('answer' in item.question ? parseAnswerRecord(item.question.answer) : Object.fromEntries(pairs.map((pair) => [pair.id, pair.id])));
    setFGuideAnswer('guideAnswer' in item.question && typeof item.question.guideAnswer === 'string' ? item.question.guideAnswer : '');
    setFRubric(normalizeRubric('rubric' in item.question ? item.question.rubric : undefined));
    setShowForm(true);
  };

  const payload = (): QuestionData | null => {
    const tags = fTags.split(',').map((tag) => tag.trim()).filter(Boolean);
    const base = { subject, body: fBody.trim(), difficulty: fDifficulty, tags };
    if (base.body.length < 3) {
      toast.error('Isi soal minimal 3 karakter.');
      return null;
    }
    if (fType === 'multiple_choice') {
      const options = fOptions.map((option) => ({ ...option, text: option.text.trim() })).filter((option) => option.text);
      if (options.length < 2) {
        toast.error('Pilihan ganda minimal memiliki dua opsi.');
        return null;
      }
      if (!options.some((option) => option.id === fAnswer)) {
        toast.error('Pilih jawaban benar dari opsi yang tersedia.');
        return null;
      }
      return { ...base, type: 'multiple_choice', options, answer: fAnswer };
    }
    if (fType === 'true_false') return { ...base, type: 'true_false', answer: fTrueAnswer };
    if (fType === 'matching') {
      const pairs = fPairs.map((pair) => ({ ...pair, prompt: pair.prompt.trim(), match: pair.match.trim() })).filter((pair) => pair.prompt && pair.match);
      if (pairs.length < 2) {
        toast.error('Menjodohkan minimal memiliki dua pasangan.');
        return null;
      }
      const pairIds = new Set(pairs.map((pair) => pair.id));
      const answer = Object.fromEntries(pairs.map((pair) => [pair.id, fMatchingAnswer[pair.id] ?? pair.id]));
      if (Object.values(answer).some((id) => !pairIds.has(id))) {
        toast.error('Mapping jawaban menjodohkan tidak valid.');
        return null;
      }
      return { ...base, type: 'matching', pairs, answer };
    }
    const rubric = fRubric
      .map((criterion) => ({ ...criterion, name: criterion.name.trim(), description: criterion.description.trim() }))
      .filter((criterion) => criterion.name && criterion.weight > 0 && criterion.maxScore > 0);
    if (rubric.length === 0) {
      toast.error('Esai wajib memiliki minimal satu kriteria rubrik.');
      return null;
    }
    return { ...base, type: 'essay', guideAnswer: fGuideAnswer.trim() || undefined, rubric };
  };

  const handleSave = () => {
    const data = payload();
    if (!data) return;
    if (editingDraftKey) {
      setAiDrafts((prev) => prev.map((item) => item.itemKey === editingDraftKey ? { ...item, question: data } : item));
      toast.success('Draft AI diperbarui. Review lagi sebelum diterima.');
      resetForm();
      return;
    }
    startSave(async () => {
      const res = editingId ? await updateQuestion(editingId, data) : await createQuestion(data);
      if (!res.success) {
        toast.error(res.error ?? 'Gagal menyimpan soal.');
        return;
      }
      toast.success(editingId ? 'Soal diperbarui.' : 'Soal ditambahkan.');
      resetForm();
      load();
    });
  };

  const toggleSelection = (questionId: string) => {
    const next = { ...selectedPoints };
    if (next[questionId]) delete next[questionId];
    else next[questionId] = 10;
    onSelectedPointsChange?.(next);
  };

  const updatePoints = (questionId: string, value: string) => {
    const points = Math.max(1, Math.min(100, Number(value) || 1));
    onSelectedPointsChange?.({ ...selectedPoints, [questionId]: points });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    startSave(async () => {
      const res = await deleteQuestion(id);
      if (!res.success) {
        toast.error(res.error ?? 'Gagal menghapus soal.');
        return;
      }
      setDeleteTarget(null);
      setQuestions((prev) => prev.filter((question) => question.id !== id));
    });
  };

  const handleExportCsv = () => {
    startCsv(async () => {
      const res = await exportQuestionsCsv(subject || undefined);
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Gagal export CSV.');
        return;
      }
      const csv = (res.data as { csv: string }).csv;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soal-${subject || 'semua'}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const handleDownloadTemplate = () => {
    const header = 'type,subject,body,options,answer,difficulty,tags,rubric';
    const sample = [
      'multiple_choice',
      subject || 'Nama Mapel',
      'Contoh pertanyaan',
      JSON.stringify(defaultOptions().map((option) => ({ ...option, text: `Opsi ${option.id.toUpperCase()}` }))),
      'a',
      'medium',
      'konsep|latihan',
      '',
    ].map(csvTemplateCell).join(',');
    const blob = new Blob([[header, sample].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template-soal-${subject || 'mapel'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const validRows: CsvPreview['validRows'] = [];
      const parseErrors: CsvImportError[] = [];
      const dataLines = parseCsvRows(String(reader.result ?? ''))
        .filter(({ cells }) => cells.some((cell) => cell.trim()));

      setCsvImportErrors([]);
      setCsvImportedRows(new Set());

      if (dataLines.length > CSV_MAX_ROWS) {
        setCsvPreview({
          fileName: file.name,
          totalRows: dataLines.length,
          validRows: [],
          parseErrors: [{ row: CSV_MAX_ROWS + 1, message: `CSV berisi ${dataLines.length} baris. Maksimal ${CSV_MAX_ROWS} baris per file.` }],
        });
        toast.error(`CSV melebihi batas ${CSV_MAX_ROWS} baris.`);
        return;
      }

      for (const { cells, rowNumber } of dataLines) {
        const row = csvCellsToQuestion(cells, subject);
        if (row) validRows.push({ rowNumber, data: row });
        else parseErrors.push({ row: rowNumber, message: 'Baris tidak sesuai template atau field wajib kosong.' });
      }
      setCsvPreview({ fileName: file.name, totalRows: dataLines.length, validRows, parseErrors });
      if (validRows.length === 0) {
        toast.error('CSV tidak memiliki baris soal yang valid.');
        return;
      }

      toast.info(`Preview siap: ${validRows.length} valid, ${parseErrors.length} perlu diperiksa.`);
    };
    reader.readAsText(file);
  };

  const handleConfirmCsvImport = () => {
    if (!csvPreview || csvPendingRows.length === 0) return;

    startCsv(async () => {
      const importedRows = new Set(csvImportedRows);
      let serverErrors: CsvImportError[] = [];
      let importedAny = false;
      let importIdentity: Awaited<ReturnType<typeof buildQuestionImportIdentity>>;
      try {
        importIdentity = await buildQuestionImportIdentity(subject, csvPreview.validRows);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Gagal membuat identitas import CSV.');
        return;
      }

      for (let index = 0; index < csvPendingRows.length; index += CSV_CHUNK_SIZE) {
        const chunk = csvPendingRows.slice(index, index + CSV_CHUNK_SIZE);
        const res = await importQuestionsCsv(
          subject,
          importIdentity.batchKey,
          chunk.map((row) => ({ rowKey: importIdentity.rowKeys.get(row.rowNumber) ?? `row-${row.rowNumber}`, question: row.data })),
        );
        if (!res.success) {
          const message = res.error ?? 'Chunk import gagal. Baris yang sudah berhasil tidak akan dikirim ulang.';
          serverErrors = [...serverErrors, { row: chunk[0]?.rowNumber ?? 0, message }];
          setCsvImportErrors(serverErrors);
          setCsvImportedRows(new Set(importedRows));
          if (importedAny) load();
          toast.error(message);
          return;
        }

        const payload = res.data as { imported?: number; errors?: CsvImportError[] } | undefined;
        const failedRows = new Set<number>();
        const chunkErrors = (payload?.errors ?? []).map((error) => {
          const rowNumber = chunk[Math.max(0, (error.row ?? 1) - 1)]?.rowNumber ?? error.row;
          failedRows.add(rowNumber);
          return { ...error, row: rowNumber };
        });

        serverErrors = [...serverErrors, ...chunkErrors];
        for (const row of chunk) {
          if (!failedRows.has(row.rowNumber)) importedRows.add(row.rowNumber);
        }
        importedAny = importedAny || (payload?.imported ?? 0) > 0 || chunk.some((row) => importedRows.has(row.rowNumber));
        setCsvImportErrors(serverErrors);
        setCsvImportedRows(new Set(importedRows));
      }

      if (importedAny) load();
      if (serverErrors.length === 0 && csvPreview.parseErrors.length === 0) {
        toast.success('Import selesai.');
        setCsvPreview(null);
        setCsvImportedRows(new Set());
      } else {
        toast.success(`Import diproses: ${importedRows.size} berhasil, ${serverErrors.length + csvPreview.parseErrors.length} perlu diperiksa.`);
      }
    });
  };

  const handleGenerateAiDrafts = () => {
    if (!selectedAiSource) return;
    const tpRefs = aiSelectedTpRefs;
    if (tpRefs.length === 0) {
      toast.error('Pilih minimal satu TP untuk draft AI.');
      return;
    }
    if (!aiDistributionValid) {
      toast.error('Jumlah distribusi tipe, kesulitan, dan level kognitif harus sama dengan jumlah soal.');
      return;
    }
    startCsv(async () => {
      const res = await generateQuestionDrafts(buildAiQuestionDraftRequest({
        source: selectedAiSource,
        purpose: aiPurpose,
        questionCount: aiQuestionCount,
        typeDistribution: aiTypeDistribution,
        difficultyDistribution: aiDifficultyDistribution,
        cognitiveDistribution: aiCognitiveDistribution,
        tpRefs,
        contextMode: aiContextMode,
        character: aiCharacter,
        teacherInstruction: aiTeacherInstruction,
        idempotencyKey: `ai-qb-${selectedAiSource.sourceType}-${selectedAiSource.id}-${Date.now()}`,
      }));
      if (!res.success || !res.data) {
        toast.error(res.error ?? 'Gagal membuat draft soal AI.');
        return;
      }
      setAiGenerationId(res.data.generationId);
      setAiDrafts(res.data.items);
      setAiSelected(new Set(res.data.items.map((item) => item.itemKey)));
      toast.success('Draft soal AI siap ditinjau.');
    });
  };

  const handleRejectAiDrafts = () => {
    if (!aiGenerationId) return;
    startCsv(async () => {
      const res = await rejectQuestionDrafts(aiGenerationId, `reject-${aiGenerationId}-${Date.now()}`);
      if (!res.success) {
        toast.error(res.error ?? 'Gagal menolak draft AI.');
        return;
      }
      setAiDrafts([]);
      setAiGenerationId(null);
      setAiSelected(new Set());
      toast.success('Semua draft AI ditolak.');
    });
  };

  const handleAcceptAiDrafts = () => {
    if (!aiGenerationId) return;
    const items = aiDrafts
      .filter((item) => aiSelected.has(item.itemKey))
      .map((item) => ({
        itemKey: item.itemKey,
        question: item.question,
        tpRefs: item.tpRefs,
        cognitiveLevel: item.cognitiveLevel,
      }));
    if (items.length === 0) {
      toast.error('Pilih minimal satu draft untuk diterima.');
      return;
    }
    startCsv(async () => {
      const res = await acceptQuestionDrafts(aiGenerationId, `accept-${aiGenerationId}-${items.map((item) => item.itemKey).join('-')}`, items);
      if (!res.success) {
        toast.error(res.error ?? 'Gagal menerima draft AI.');
        return;
      }
      const created = (res.data as { questions?: Array<{ id: string }> } | undefined)?.questions ?? [];
      if (selectable && created.length > 0) {
        onSelectedPointsChange?.({
          ...selectedPoints,
          ...Object.fromEntries(created.map((question) => [question.id, 10])),
        });
      }
      const acceptedKeys = new Set(items.map((item) => item.itemKey));
      const remainingDrafts = aiDrafts.filter((item) => !acceptedKeys.has(item.itemKey));
      setAiDrafts(remainingDrafts);
      if (remainingDrafts.length === 0) setAiGenerationId(null);
      setAiSelected(new Set(remainingDrafts.map((item) => item.itemKey)));
      toast.success('Draft AI diterima ke Bank Soal.');
      load();
    });
  };

  const handleRegenerateAiDraft = (item: AiQuestionDraftItem) => {
    if (!aiGenerationId) return;
    setAiRegeneratingKey(item.itemKey);
    startCsv(async () => {
      try {
        const res = await regenerateQuestionDraftItem(aiGenerationId, item.itemKey);
        if (!res.success || !res.data) {
          toast.error(res.error ?? 'Gagal regenerate draft AI.');
          return;
        }
        setAiDrafts((prev) => prev.map((draft) => draft.itemKey === item.itemKey ? res.data!.item : draft));
        setAiSelected((prev) => new Set(prev).add(item.itemKey));
        toast.success('Satu draft AI berhasil dibuat ulang.');
      } finally {
        setAiRegeneratingKey(null);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label="Bank Soal" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[16px] font-bold text-[#0f2e25]">
              <Database className="h-5 w-5 text-emerald-600" />Bank Soal - {subject || 'Semua mapel'}
            </h3>
            {selectable && <p className="mt-1 text-[12px] font-semibold text-[#6b8079]">{selectedCount} soal dipilih untuk sesi ini.</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#6b8079] hover:bg-[#f4f7f5]" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-h-[280px] space-y-2">
            <div className="grid gap-2 rounded-lg border border-[#dfe9e4] bg-[#f9fbfa] p-2 sm:grid-cols-[minmax(0,1fr)_150px_140px]">
              <input
                value={questionSearch}
                onChange={(event) => setQuestionSearch(event.target.value)}
                placeholder="Cari soal atau tag..."
                className={FIELD}
              />
              <select value={questionTypeFilter} onChange={(event) => setQuestionTypeFilter(event.target.value as 'all' | QuestionType)} className={FIELD}>
                <option value="all">Semua tipe</option>
                {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select value={questionDifficultyFilter} onChange={(event) => setQuestionDifficultyFilter(event.target.value as 'all' | QuestionDifficulty)} className={FIELD}>
                <option value="all">Semua level</option>
                <option value="easy">Mudah</option>
                <option value="medium">Sedang</option>
                <option value="hard">Sulit</option>
              </select>
            </div>
            {loading ? (
              <div className="grid h-40 place-items-center rounded-lg border border-dashed border-[#dfe9e4] text-[12px] font-semibold text-[#6b8079]">
                <Loader2 className="h-5 w-5 animate-spin" />Memuat soal...
              </div>
            ) : questions.length === 0 ? (
              <div className="grid h-40 place-items-center rounded-lg border border-dashed border-[#dfe9e4] px-4 text-center text-[12px] font-semibold text-[#6b8079]">
                Belum ada soal untuk mapel ini. Tambahkan soal pertama dari panel kanan.
              </div>
            ) : questions.map((question, index) => {
              const selected = Boolean(selectedPoints[question.id]);
              return (
                <article key={question.id} className={clsx('rounded-lg border p-3', selected ? 'border-emerald-400 bg-emerald-50/40' : 'border-[#dfe9e4] bg-white')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{TYPE_LABELS[question.type]}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{question.difficulty}</span>
                        <span className="text-[#9bb0a8]">#{index + 1}</span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-[#0f2e25]">{question.body}</p>
                      {Array.isArray(question.tags) && question.tags.length > 0 && (
                        <p className="mt-1 text-[11px] text-[#6b8079]">{question.tags.join(', ')}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {selectable && (
                        <button type="button" onClick={() => toggleSelection(question.id)} className={clsx('rounded-lg px-2.5 py-1.5 text-[11px] font-bold', selected ? 'bg-emerald-600 text-white' : 'border border-[#dfe9e4] text-[#355a4e] hover:bg-[#f4f7f5]')}>
                          {selected ? 'Dipilih' : 'Pilih'}
                        </button>
                      )}
                      <button type="button" onClick={() => startEdit(question)} className="rounded-lg p-1.5 text-[#6b8079] hover:bg-[#f4f7f5]" aria-label="Edit soal">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(question.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" aria-label="Hapus soal">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {selected && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-[11px] font-bold text-[#6b8079]" htmlFor={`points-${question.id}`}>Poin</label>
                      <input id={`points-${question.id}`} type="number" min={1} max={100} value={selectedPoints[question.id] ?? 10} onChange={(event) => updatePoints(question.id, event.target.value)} className="w-20 rounded-lg border border-[#dfe9e4] px-2 py-1 text-[12px] font-bold text-[#0f2e25]" />
                    </div>
                  )}
                </article>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[12px] font-semibold text-[#6b8079]">
              <span>{questionTotal} soal · halaman {questionPage} dari {pageCount}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setQuestionPage((page) => Math.max(1, page - 1))} disabled={questionPage <= 1 || loading} className={clsx(BTN, 'border border-[#dfe9e4] bg-white text-[#355a4e]')}>Sebelumnya</button>
                <button type="button" onClick={() => setQuestionPage((page) => Math.min(pageCount, page + 1))} disabled={questionPage >= pageCount || loading} className={clsx(BTN, 'border border-[#dfe9e4] bg-white text-[#355a4e]')}>Berikutnya</button>
              </div>
            </div>
          </section>

          <aside className="rounded-lg border border-[#dfe9e4] bg-[#f9fbfa] p-3">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[13px] font-bold text-[#0f2e25]">{editingDraftKey ? 'Edit draft AI' : editingId ? 'Edit soal' : 'Tambah soal'}</h4>
              {showForm && <button type="button" onClick={resetForm} className="text-[11px] font-bold text-[#6b8079]">Reset</button>}
            </div>

            {!showForm ? (
              <div className="space-y-2">
                <button type="button" onClick={() => setShowForm(true)} className={clsx(BTN, 'w-full justify-center bg-emerald-600 text-white hover:bg-emerald-700')}>
                  <Plus className="h-4 w-4" />Tambah Soal
                </button>
                {canGenerateAi && (
                  <div className="space-y-2 rounded-lg border border-violet-100 bg-white p-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-violet-700">Draft AI</div>
                    <select
                      value={aiSourceKey}
                      onChange={(event) => {
                        const nextKey = event.target.value;
                        setAiSourceKey(nextKey);
                        const nextSource = aiSources.find((source) => `${source.sourceType}:${source.id}` === nextKey);
                        if (nextSource) setAiSelectedTpRefs(normalizeSourceTpOptions(nextSource).map((tp) => tp.ref));
                      }}
                      className={FIELD}
                    >
                      {aiSources.map((source) => (
                        <option key={`${source.sourceType}:${source.id}`} value={`${source.sourceType}:${source.id}`}>
                          {source.label}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px] font-bold text-[#6b8079]">
                        Jumlah
                        <input type="number" min={1} max={20} value={aiQuestionCount} onChange={(event) => setAiQuestionCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} className={FIELD} />
                      </label>
                      <label className="text-[11px] font-bold text-[#6b8079]">
                        Tujuan
                        <select value={aiPurpose} onChange={(event) => setAiPurpose(event.target.value as AiPurpose)} className={FIELD}>
                          <option value="diagnostik">Diagnostik</option>
                          <option value="formatif">Formatif</option>
                          <option value="sumatif-uts">Sumatif UTS</option>
                          <option value="sumatif-uas">Sumatif UAS</option>
                        </select>
                      </label>
                    </div>
                    <DistributionInputs
                      label="Tipe"
                      values={aiTypeDistribution}
                      options={TYPE_OPTIONS.map((option) => ({ key: option.value, label: TYPE_LABELS[option.value] }))}
                      onChange={(key, value) => setAiTypeDistribution((prev) => ({ ...prev, [key]: value }))}
                    />
                    <DistributionInputs
                      label="Kesulitan"
                      values={aiDifficultyDistribution}
                      options={[
                        { key: 'easy', label: 'Mudah' },
                        { key: 'medium', label: 'Sedang' },
                        { key: 'hard', label: 'Sulit' },
                      ]}
                      onChange={(key, value) => setAiDifficultyDistribution((prev) => ({ ...prev, [key]: value }))}
                    />
                    <DistributionInputs
                      label="Kognitif"
                      values={aiCognitiveDistribution}
                      options={COGNITIVE_LEVELS.map((level) => ({ key: level, label: level }))}
                      onChange={(key, value) => setAiCognitiveDistribution((prev) => ({ ...prev, [key]: value }))}
                    />
                    <div className="space-y-1">
                      <div className="text-[11px] font-extrabold uppercase tracking-wide text-violet-700">TP sumber</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedAiTpOptions.map((tp) => {
                          const active = aiSelectedTpRefs.includes(tp.ref);
                          return (
                            <button
                              key={tp.ref}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setAiSelectedTpRefs((current) => {
                                if (current.includes(tp.ref)) return current.filter((ref) => ref !== tp.ref);
                                return [...current, tp.ref];
                              })}
                              className={clsx(
                                'rounded-lg border px-2 py-1 text-left text-[11px] font-bold',
                                active ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-[#dfe9e4] bg-white text-[#6b8079]',
                              )}
                            >
                              <span className="block">{tp.ref}</span>
                              <span className="block max-w-[220px] truncate font-semibold">{tp.text}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={aiContextMode} onChange={(event) => setAiContextMode(event.target.value as AiContextMode)} className={FIELD}>
                        <option value="auto_vokasi">Auto vokasi</option>
                        <option value="produktif">Produktif</option>
                        <option value="umum">Umum</option>
                      </select>
                      <select value={aiCharacter} onChange={(event) => setAiCharacter(event.target.value as AiCharacter)} className={FIELD}>
                        <option value="konseptual">Konseptual</option>
                        <option value="studi_kasus">Studi kasus</option>
                        <option value="praktik">Praktik</option>
                        <option value="literasi">Literasi</option>
                        <option value="numerasi">Numerasi</option>
                      </select>
                    </div>
                    <textarea value={aiTeacherInstruction} onChange={(event) => setAiTeacherInstruction(event.target.value)} rows={2} placeholder="Catatan guru opsional, tanpa data pribadi" className={FIELD} />
                    {!aiDistributionValid && (
                      <div className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">Distribusi harus sama dengan jumlah soal.</div>
                    )}
                    <button type="button" onClick={handleGenerateAiDrafts} disabled={csvLoading || !aiDistributionValid || aiSelectedTpRefs.length === 0} className={clsx(BTN, 'w-full justify-center border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100')}>
                      {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}Draft AI
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={handleDownloadTemplate} className={clsx(BTN, 'justify-center border border-[#dfe9e4] bg-white text-[#355a4e]')}>
                    <Download className="h-4 w-4" />Template
                  </button>
                  <button type="button" onClick={handleExportCsv} disabled={csvLoading} className={clsx(BTN, 'justify-center border border-sky-200 bg-sky-50 text-sky-700')}>
                    {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export
                  </button>
                  <label className={clsx(BTN, 'cursor-pointer justify-center border border-amber-200 bg-amber-50 text-amber-700')}>
                    <Upload className="h-4 w-4" />Import
                    <input type="file" accept=".csv" className="hidden" onChange={handleImportCsv} />
                  </label>
                </div>
                {csvPreview && (
                  <section className="rounded-lg border border-amber-200 bg-white p-3" aria-live="polite">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-[#0f2e25]">{csvPreview.fileName}</p>
                        <p className="text-[11px] font-semibold text-[#6b8079]">
                          {csvPreview.validRows.length} valid, {csvPreview.parseErrors.length + csvImportErrors.length} error, {csvImportedRows.size} sudah masuk.
                        </p>
                      </div>
                    </div>
                    {(csvPreview.parseErrors.length > 0 || csvImportErrors.length > 0) && (
                      <div className="mt-2 max-h-24 space-y-1 overflow-y-auto rounded border border-amber-100 bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">
                        {[...csvPreview.parseErrors, ...csvImportErrors].slice(0, 6).map((error, index) => (
                          <p key={`${error.row}-${index}`}>Baris {error.row}: {error.message}</p>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => {
                        setCsvPreview(null);
                        setCsvImportErrors([]);
                        setCsvImportedRows(new Set());
                      }} className={clsx(BTN, 'border border-[#dfe9e4] bg-white text-[#355a4e]')}>
                        Batal
                      </button>
                      <button type="button" onClick={handleConfirmCsvImport} disabled={csvLoading || csvPendingRows.length === 0} className={clsx(BTN, 'bg-amber-500 text-white hover:bg-amber-600')}>
                        {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {csvImportedRows.size > 0 ? `Lanjut ${csvPendingRows.length}` : `Import ${csvPendingRows.length}`}
                      </button>
                    </div>
                    {csvPreview.totalRows > CSV_MAX_ROWS && (
                      <p className="mt-2 text-[11px] font-semibold text-rose-600">File ini ditolak penuh. Pecah file sebelum import.</p>
                    )}
                  </section>
                )}
                {aiDrafts.length > 0 && (
                  <section className="rounded-lg border border-violet-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-bold text-[#0f2e25]">Review Draft AI</p>
                        <p className="text-[11px] font-semibold text-[#6b8079]">{aiSelected.size} dari {aiDrafts.length} dipilih. Guru wajib cek kunci/rubrik sebelum menerima.</p>
                      </div>
                      <button type="button" onClick={handleRejectAiDrafts} disabled={csvLoading} className="rounded-lg p-1 text-[#6b8079] hover:bg-[#f4f7f5] disabled:opacity-50" aria-label="Tolak semua draft AI">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                      {aiDrafts.map((item) => (
                        <article key={item.itemKey} className="rounded-lg border border-[#dfe9e4] p-2">
                          <div className="flex items-start gap-2">
                            <input
                              aria-label={`Pilih draft ${item.itemKey}`}
                              type="checkbox"
                              checked={aiSelected.has(item.itemKey)}
                              onChange={(event) => setAiSelected((prev) => {
                                const next = new Set(prev);
                                if (event.target.checked) next.add(item.itemKey);
                                else next.delete(item.itemKey);
                                return next;
                              })}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="block text-[11px] font-bold uppercase text-violet-700">{TYPE_LABELS[item.question.type]} - {item.question.difficulty} - {item.cognitiveLevel}</span>
                              <span className="mt-1 block text-[12px] font-semibold leading-relaxed text-[#0f2e25]">{item.question.body}</span>
                              <span className="mt-1 block text-[11px] text-[#6b8079]">{item.tpRefs.join(', ')} - {item.rationale}</span>
                              {item.warnings.length > 0 && <span className="mt-1 block text-[11px] font-semibold text-amber-700">{item.warnings.join('; ')}</span>}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" onClick={() => startEditDraft(item)} className={clsx(BTN, 'border border-[#dfe9e4] bg-white text-[#355a4e]')}>
                                  <Pencil className="h-3.5 w-3.5" />Edit Draft
                                </button>
                                <button type="button" onClick={() => handleRegenerateAiDraft(item)} disabled={csvLoading || aiRegeneratingKey === item.itemKey} className={clsx(BTN, 'border border-violet-200 bg-violet-50 text-violet-700')}>
                                  {aiRegeneratingKey === item.itemKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Regenerate
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <button type="button" onClick={handleAcceptAiDrafts} disabled={csvLoading || aiSelected.size === 0} className={clsx(BTN, 'mt-3 w-full justify-center bg-violet-600 text-white hover:bg-violet-700')}>
                      {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Terima Draft Terpilih
                    </button>
                    <button type="button" onClick={handleRejectAiDrafts} disabled={csvLoading} className={clsx(BTN, 'mt-2 w-full justify-center border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100')}>
                      {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      Tolak Semua Draft
                    </button>
                  </section>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <select value={fType} onChange={(event) => setFType(event.target.value as QuestionType)} className={FIELD}>
                    {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <select value={fDifficulty} onChange={(event) => setFDifficulty(event.target.value as QuestionDifficulty)} className={FIELD}>
                    <option value="easy">Mudah</option>
                    <option value="medium">Sedang</option>
                    <option value="hard">Sulit</option>
                  </select>
                </div>
                <textarea value={fBody} onChange={(event) => setFBody(event.target.value)} className={FIELD} rows={3} placeholder="Tulis pertanyaan..." />
                <input value={fTags} onChange={(event) => setFTags(event.target.value)} className={FIELD} placeholder="Tag, pisahkan dengan koma" />

                {fType === 'multiple_choice' && (
                  <div className="space-y-1.5">
                    {fOptions.map((option, index) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <button type="button" onClick={() => setFAnswer(option.id)} className={clsx('grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold', fAnswer === option.id ? 'bg-emerald-600 text-white' : 'bg-white text-[#6b8079] ring-1 ring-[#dfe9e4]')} aria-label={`Jadikan opsi ${option.id} jawaban benar`}>
                          {fAnswer === option.id ? <Check className="h-3.5 w-3.5" /> : option.id.toUpperCase()}
                        </button>
                        <input value={option.text} onChange={(event) => setFOptions((prev) => prev.map((item, idx) => idx === index ? { ...item, text: event.target.value } : item))} className={FIELD} placeholder={`Opsi ${option.id.toUpperCase()}`} />
                      </div>
                    ))}
                  </div>
                )}

                {fType === 'true_false' && (
                  <select value={String(fTrueAnswer)} onChange={(event) => setFTrueAnswer(event.target.value === 'true')} className={FIELD}>
                    <option value="true">Benar</option>
                    <option value="false">Salah</option>
                  </select>
                )}

                {fType === 'matching' && (
                  <div className="space-y-2">
                    {fPairs.map((pair, index) => (
                      <div key={pair.id} className="rounded-lg border border-[#dfe9e4] bg-white p-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input value={pair.prompt} onChange={(event) => setFPairs((prev) => prev.map((item, idx) => idx === index ? { ...item, prompt: event.target.value } : item))} className={FIELD} placeholder="Pernyataan" />
                          <input value={pair.match} onChange={(event) => setFPairs((prev) => prev.map((item, idx) => idx === index ? { ...item, match: event.target.value } : item))} className={FIELD} placeholder="Pasangan benar" />
                        </div>
                        <select value={fMatchingAnswer[pair.id] ?? pair.id} onChange={(event) => setFMatchingAnswer((prev) => ({ ...prev, [pair.id]: event.target.value }))} className={clsx(FIELD, 'mt-2')}>
                          {fPairs.map((choice) => <option key={choice.id} value={choice.id}>{choice.match || choice.id}</option>)}
                        </select>
                      </div>
                    ))}
                    <button type="button" onClick={() => {
                      const id = `p${fPairs.length + 1}`;
                      setFPairs((prev) => [...prev, { id, prompt: '', match: '' }]);
                      setFMatchingAnswer((prev) => ({ ...prev, [id]: id }));
                    }} className={clsx(BTN, 'border border-[#dfe9e4] bg-white text-[#355a4e]')}>
                      <Copy className="h-4 w-4" />Tambah pasangan
                    </button>
                  </div>
                )}

                {fType === 'essay' && (
                  <div className="space-y-2">
                    <textarea value={fGuideAnswer} onChange={(event) => setFGuideAnswer(event.target.value)} className={FIELD} rows={2} placeholder="Panduan jawaban untuk guru (tidak tampil ke siswa)" />
                    {fRubric.map((criterion, index) => (
                      <div key={criterion.id} className="rounded-lg border border-[#dfe9e4] bg-white p-2">
                        <input value={criterion.name} onChange={(event) => setFRubric((prev) => prev.map((item, idx) => idx === index ? { ...item, name: event.target.value } : item))} className={FIELD} placeholder="Nama kriteria" />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <input type="number" min={1} max={100} value={criterion.weight} onChange={(event) => setFRubric((prev) => prev.map((item, idx) => idx === index ? { ...item, weight: Number(event.target.value) } : item))} className={FIELD} placeholder="Bobot" />
                          <input type="number" min={1} max={100} value={criterion.maxScore} onChange={(event) => setFRubric((prev) => prev.map((item, idx) => idx === index ? { ...item, maxScore: Number(event.target.value) } : item))} className={FIELD} placeholder="Skor maks" />
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => setFRubric((prev) => [...prev, { id: `c${prev.length + 1}`, name: '', weight: 100, maxScore: 100, description: '' }])} className={clsx(BTN, 'border border-[#dfe9e4] bg-white text-[#355a4e]')}>
                      <Plus className="h-4 w-4" />Tambah kriteria
                    </button>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={resetForm} className={clsx(BTN, 'border border-[#dfe9e4] bg-white text-[#355a4e]')}>Batal</button>
                  <button type="button" onClick={handleSave} disabled={saving} className={clsx(BTN, 'bg-emerald-600 text-white hover:bg-emerald-700')}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {editingDraftKey ? 'Simpan Draft' : 'Simpan'}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
        title="Hapus soal"
        description="Soal ini akan dihapus dari Bank Soal. Snapshot sesi yang sudah aktif tidak berubah."
        variant="danger"
        confirmLabel="Hapus"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function DistributionInputs<K extends string>({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: Record<K, number>;
  options: Array<{ key: K; label: string }>;
  onChange: (key: K, value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-bold text-[#6b8079]">{label}</div>
      <div className="grid grid-cols-4 gap-1">
        {options.map((option) => (
          <label key={option.key} className="min-w-0 text-[10px] font-bold text-[#6b8079]">
            {option.label}
            <input
              type="number"
              min={0}
              max={20}
              value={values[option.key] ?? 0}
              onChange={(event) => onChange(option.key, Math.max(0, Math.min(20, Number(event.target.value) || 0)))}
              className="mt-0.5 w-full rounded-md border border-[#dfe9e4] bg-white px-2 py-1 text-[11px] font-bold text-[#0f2e25] outline-none focus:border-emerald-400"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
