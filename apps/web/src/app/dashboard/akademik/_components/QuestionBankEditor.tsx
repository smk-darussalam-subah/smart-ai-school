'use client';

import React, { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { z } from 'zod';
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  createQuestion,
  deleteQuestion,
  exportQuestionsCsv,
  fetchQuestions,
  fetchQuestionSources,
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
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import QuestionBankAiReview from './QuestionBankAiReview';
import {
  distributeQuestionCount,
  questionDraftGenerateKey,
  questionDraftSaveKey,
  questionDraftRejectKey,
} from './question-bank-ai-operation';
import {
  QB_FIELD,
  QB_BUTTON,
  QB_OUTLINE,
  QB_PRIMARY,
  QUESTION_BANK_STYLE,
  questionDifficultyLabels,
} from './question-bank-ui';
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
import MaterialEditor from '@/components/learning/MaterialEditor';
import QuestionContent from '@/components/learning/QuestionContent';
import { sanitizeMaterialHtml } from '@/lib/material-content';
import { QUESTION_HTML_PREFIX, questionBodyForEditor } from '@/lib/question-content';

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
  classId?: string;
  academicYear?: string;
  semester?: number;
}

const FIELD = QB_FIELD;
const BTN = QB_BUTTON;
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
const DEFAULT_TP_REFS: string[] = [];
const EMPTY_SOURCES: QuestionSourceOption[] = [];

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
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
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
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
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
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, string>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, string>;
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
    return parsed.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
  }
  return value
    .split(/[|,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
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
  if (!rowSubject || body.length < 3 || !['easy', 'medium', 'hard'].includes(difficulty))
    return null;

  if (type === 'multiple_choice') {
    const options = normalizeOptions(parseJsonCell(cells[3] ?? ''));
    const answer = cells[4]?.trim() || options[0]?.id || 'a';
    return { type, subject: rowSubject, body, options, answer, difficulty, tags };
  }
  if (type === 'true_false') {
    const answerText = (cells[4]?.trim() || 'false').toLowerCase();
    return {
      type,
      subject: rowSubject,
      body,
      answer: answerText === 'true' || answerText === 'benar',
      difficulty,
      tags,
    };
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

export default function QuestionBankEditor(props: Props) {
  return (
    <QuestionBankWorkspace
      key={[
        props.subject,
        props.moduleId,
        props.rppId,
        props.classId,
        props.academicYear,
        props.semester,
      ].join('|')}
      {...props}
    />
  );
}

function QuestionBankWorkspace({
  subject,
  onClose,
  selectable = false,
  selectedPoints = {},
  onSelectedPointsChange,
  moduleId,
  rppId,
  defaultTpRefs = DEFAULT_TP_REFS,
  sourceOptions = EMPTY_SOURCES,
  classId,
  academicYear,
  semester,
}: Props) {
  const workspaceId = useId();
  const [mode, setMode] = useState<'bank' | 'ai' | 'manual'>('bank');
  const [aiStep, setAiStep] = useState<'setup' | 'review' | 'saved'>('setup');
  const [aiReviewed, setAiReviewed] = useState<Set<string>>(new Set());
  const [aiSaved, setAiSaved] = useState<Array<{ id: string; aiItemKey: string; body: string }>>(
    [],
  );
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiAction, setAiAction] = useState<'generate' | 'accept' | 'regenerate' | 'reject' | null>(
    null,
  );
  const [bankError, setBankError] = useState<string | null>(null);
  const [saveUncertain, setSaveUncertain] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [sourceRead, setSourceRead] = useState<{
    state: 'loading' | 'ready' | 'error';
    data: QuestionSourceOption[];
  }>({ state: 'ready', data: [] });
  const [sourceRetry, setSourceRetry] = useState(0);
  const aiBusy = useRef(false);
  const generationNonce = useRef<string | null>(null);
  const sourceCache = useRef(new Map<string, QuestionSourceOption[]>());
  const mounted = useRef(true);
  const opener = useRef<HTMLElement | null>(
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [questionPage, setQuestionPage] = useState(1);
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionTypeFilter, setQuestionTypeFilter] = useState<'all' | QuestionType>('all');
  const [questionDifficultyFilter, setQuestionDifficultyFilter] = useState<
    'all' | QuestionDifficulty
  >('all');
  const [loading, setLoading] = useState(false);
  const [saving, startSave] = useTransition();
  const [csvLoading, startCsv] = useTransition();
  const loadRequestRef = useRef(0);
  const [showForm, setShowForm] = useState(false);
  const manualSave = useRef<{ requestId: string; data: QuestionData } | null>(null);
  const [manualSaveUncertain, setManualSaveUncertain] = useState(false);
  const [manualSaveConflict, setManualSaveConflict] = useState(false);
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
  const [aiTypeDistribution, setAiTypeDistribution] = useState<TypeDistribution>({
    multiple_choice: 2,
    true_false: 1,
    matching: 0,
    essay: 1,
  });
  const [aiDifficultyDistribution, setAiDifficultyDistribution] = useState<DifficultyDistribution>({
    easy: 1,
    medium: 2,
    hard: 1,
  });
  const [aiCognitiveDistribution, setAiCognitiveDistribution] = useState<CognitiveDistribution>({
    C1: 1,
    C2: 1,
    C3: 1,
    C4: 1,
    C5: 0,
    C6: 0,
  });
  const typeWeights = useRef(aiTypeDistribution),
    difficultyWeights = useRef(aiDifficultyDistribution),
    cognitiveWeights = useRef(aiCognitiveDistribution);
  const changeQuestionCount = (count: number) => {
    setAiQuestionCount(count);
    setAiTypeDistribution(distributeQuestionCount(typeWeights.current, count));
    setAiDifficultyDistribution(distributeQuestionCount(difficultyWeights.current, count));
    setAiCognitiveDistribution(distributeQuestionCount(cognitiveWeights.current, count));
  };

  const [fType, setFType] = useState<QuestionType>('multiple_choice');
  const [fBody, setFBody] = useState('');
  const formWasOpen = useRef(false);
  useEffect(() => {
    if (showForm) {
      if (!formWasOpen.current) document.getElementById(`${workspaceId}-form-title`)?.focus();
      formWasOpen.current = true;
    } else if (formWasOpen.current && !saving && !csvLoading && aiAction === null) {
      const target =
        document.getElementById(`${workspaceId}-add-question`) ??
        document.getElementById(`${workspaceId}-panel`);
      target?.focus();
      formWasOpen.current = false;
    }
  }, [showForm, saving, csvLoading, aiAction, workspaceId]);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (formError) formErrorRef.current?.focus();
  }, [formError]);
  const [fDifficulty, setFDifficulty] = useState<QuestionDifficulty>('medium');
  const [fTags, setFTags] = useState('');
  const [fOptions, setFOptions] = useState<QuestionOption[]>(defaultOptions);
  const [fAnswer, setFAnswer] = useState('a');
  const [fTrueAnswer, setFTrueAnswer] = useState(true);
  const [fPairs, setFPairs] = useState<MatchingPair[]>(defaultPairs);
  const [fMatchingAnswer, setFMatchingAnswer] = useState<Record<string, string>>({
    p1: 'p1',
    p2: 'p2',
  });
  const [fGuideAnswer, setFGuideAnswer] = useState('');
  const [fRubric, setFRubric] = useState<EssayRubricCriteria[]>(defaultRubric);

  const selectedCount = useMemo(() => Object.keys(selectedPoints).length, [selectedPoints]);
  const defaultSourceTpOptions = useMemo(
    () => defaultTpRefs.map((ref) => ({ ref, text: ref })),
    [defaultTpRefs],
  );
  const aiSources = useMemo<QuestionSourceOption[]>(() => {
    const direct: QuestionSourceOption[] = [
      ...(moduleId
        ? [
            {
              sourceType: 'module' as const,
              id: moduleId,
              label: 'Modul LMS aktif',
              tpRefs: defaultTpRefs,
              tpOptions: defaultSourceTpOptions,
            },
          ]
        : []),
      ...(rppId
        ? [
            {
              sourceType: 'rpp' as const,
              id: rppId,
              label: 'Modul Ajar aktif',
              tpRefs: defaultTpRefs,
              tpOptions: defaultSourceTpOptions,
            },
          ]
        : []),
    ];
    const seen = new Set<string>();
    return [...sourceOptions, ...sourceRead.data, ...direct].filter((source) => {
      const key = `${source.sourceType}:${source.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [defaultSourceTpOptions, defaultTpRefs, moduleId, rppId, sourceOptions, sourceRead.data]);
  const [aiSourceKey, setAiSourceKey] = useState(() =>
    aiSources[0] ? `${aiSources[0].sourceType}:${aiSources[0].id}` : '',
  );
  const selectedAiSource =
    aiSources.find((source) => `${source.sourceType}:${source.id}` === aiSourceKey) ??
    aiSources[0] ??
    null;
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
    setBankError(null);
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
        setBankError('Bank Soal belum dapat dimuat. Coba lagi.');
        return;
      }
      const data = Array.isArray(res.data)
        ? res.data
        : ((res.data as { data?: QuestionRecord[] }).data ?? []);
      const total = Array.isArray(res.data)
        ? data.length
        : ((res.data as { total?: number }).total ?? data.length);
      setQuestions(data);
      setQuestionTotal(total);
    })()
      .catch(() => {
        if (requestId === loadRequestRef.current)
          setBankError('Bank Soal belum dapat dimuat. Coba lagi.');
      })
      .finally(() => {
        if (requestId === loadRequestRef.current) setLoading(false);
      });
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loadRequestRef.current++;
    };
  }, []);
  useEffect(() => {
    if (mode !== 'ai' || sourceOptions.length > 0) return;
    let active = true;
    const key = JSON.stringify({ subject, classId, academicYear, semester, sourceRetry });
    const cached = sourceCache.current.get(key);
    if (cached) {
      setSourceRead({ state: 'ready', data: cached });
      return;
    }
    setSourceRead({ state: 'loading', data: [] });
    fetchQuestionSources({ subject, classId, academicYear, semester })
      .then((result) => {
        if (result.success && result.data) sourceCache.current.set(key, result.data);
        if (active)
          setSourceRead({ state: result.success ? 'ready' : 'error', data: result.data ?? [] });
      })
      .catch(() => {
        if (active) setSourceRead({ state: 'error', data: [] });
      });
    return () => {
      active = false;
    };
  }, [mode, subject, classId, academicYear, semester, sourceRetry, sourceOptions.length]);

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
      const currentStillAvailable = aiSources.some(
        (source) => `${source.sourceType}:${source.id}` === current,
      );
      const preferred =
        aiSources.find((source) => source.id === moduleId || source.id === rppId) ?? firstSource;
      return currentStillAvailable ? current : `${preferred.sourceType}:${preferred.id}`;
    });
  }, [aiSources, moduleId, rppId]);

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
    manualSave.current = null;
    setManualSaveUncertain(false);
    setManualSaveConflict(false);
    setFormError(null);
    setMode(editingDraftKey ? 'ai' : 'bank');
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
    setMode('manual');
    setEditingId(question.id);
    setFType(question.type);
    setFBody(questionBodyForEditor(question.body));
    setFDifficulty(question.difficulty);
    setFTags((question.tags ?? []).join(', '));
    setFOptions(normalizeOptions(question.options));
    setFAnswer(typeof question.answer === 'string' ? question.answer : 'a');
    setFTrueAnswer(question.answer === true || question.answer === 'true');
    const pairs = normalizePairs(question.options ?? question.pairs);
    setFPairs(pairs);
    const answerRecord = parseAnswerRecord(question.answer);
    setFMatchingAnswer(
      Object.keys(answerRecord).length
        ? answerRecord
        : Object.fromEntries(pairs.map((pair) => [pair.id, pair.id])),
    );
    setFGuideAnswer(
      typeof question.answer === 'string' && question.type === 'essay' ? question.answer : '',
    );
    setFRubric(normalizeRubric(question.rubric));
    setShowForm(true);
  };

  const startEditDraft = (item: AiQuestionDraftItem) => {
    setMode('ai');
    setEditingId(null);
    setEditingDraftKey(item.itemKey);
    setFType(item.question.type);
    setFBody(questionBodyForEditor(item.question.body));
    setFDifficulty(item.question.difficulty);
    setFTags((item.question.tags ?? []).join(', '));
    setFOptions(normalizeOptions('options' in item.question ? item.question.options : undefined));
    setFAnswer(
      'answer' in item.question && typeof item.question.answer === 'string'
        ? item.question.answer
        : 'a',
    );
    setFTrueAnswer('answer' in item.question && item.question.answer === true);
    const pairs = normalizePairs('pairs' in item.question ? item.question.pairs : undefined);
    setFPairs(pairs);
    setFMatchingAnswer(
      'answer' in item.question
        ? parseAnswerRecord(item.question.answer)
        : Object.fromEntries(pairs.map((pair) => [pair.id, pair.id])),
    );
    setFGuideAnswer(
      'guideAnswer' in item.question && typeof item.question.guideAnswer === 'string'
        ? item.question.guideAnswer
        : '',
    );
    setFRubric(normalizeRubric('rubric' in item.question ? item.question.rubric : undefined));
    setShowForm(true);
  };

  const payload = (): QuestionData | null => {
    const tags = fTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const body = sanitizeMaterialHtml(fBody).trim();
    const plain = new DOMParser().parseFromString(body, 'text/html').body.textContent?.trim() ?? '';
    const base = { subject, body: QUESTION_HTML_PREFIX + body, difficulty: fDifficulty, tags };
    if (plain.length < 3) {
      setFormError('Isi soal minimal 3 karakter.');
      return null;
    }
    if (base.body.length > 5000) {
      setFormError(
        'Isi soal terlalu panjang. Maksimal 5.000 karakter termasuk format. Isian Anda tetap tersimpan di editor.',
      );
      return null;
    }
    if (fType === 'multiple_choice') {
      const options = fOptions
        .map((option) => ({ ...option, text: option.text.trim() }))
        .filter((option) => option.text);
      if (options.length < 2) {
        setFormError('Pilihan ganda minimal memiliki dua opsi.');
        return null;
      }
      if (!options.some((option) => option.id === fAnswer)) {
        setFormError('Pilih jawaban benar dari opsi yang tersedia.');
        return null;
      }
      if (
        new Set(options.map((option) => option.text.toLocaleLowerCase('id-ID'))).size !==
        options.length
      ) {
        setFormError('Setiap pilihan jawaban harus berbeda.');
        return null;
      }
      return { ...base, type: 'multiple_choice', options, answer: fAnswer };
    }
    if (fType === 'true_false') return { ...base, type: 'true_false', answer: fTrueAnswer };
    if (fType === 'matching') {
      const pairs = fPairs
        .map((pair) => ({ ...pair, prompt: pair.prompt.trim(), match: pair.match.trim() }))
        .filter((pair) => pair.prompt && pair.match);
      if (pairs.length < 2) {
        setFormError('Menjodohkan minimal memiliki dua pasangan.');
        return null;
      }
      const pairIds = new Set(pairs.map((pair) => pair.id));
      const answer = Object.fromEntries(
        pairs.map((pair) => [pair.id, fMatchingAnswer[pair.id] ?? pair.id]),
      );
      if (
        Object.values(answer).some((id) => !pairIds.has(id)) ||
        new Set(Object.values(answer)).size !== pairs.length
      ) {
        setFormError('Setiap pernyataan harus memiliki pasangan benar yang berbeda.');
        return null;
      }
      return { ...base, type: 'matching', pairs, answer };
    }
    const rubric = fRubric
      .map((criterion) => ({
        ...criterion,
        name: criterion.name.trim(),
        description: criterion.description.trim(),
      }))
      .filter((criterion) => criterion.name && criterion.weight > 0 && criterion.maxScore > 0);
    if (rubric.length === 0) {
      setFormError('Esai wajib memiliki minimal satu kriteria rubrik.');
      return null;
    }
    if (
      rubric.some(
        (criterion) =>
          !Number.isFinite(criterion.weight) ||
          !Number.isFinite(criterion.maxScore) ||
          criterion.weight > 100 ||
          criterion.maxScore > 100,
      ) ||
      Math.round(rubric.reduce((sum, criterion) => sum + criterion.weight, 0) * 100) !== 10_000
    ) {
      setFormError(
        'Total bobot rubrik harus 100%. Bobot dan skor setiap kriteria harus lebih dari 0 hingga 100.',
      );
      return null;
    }
    return { ...base, type: 'essay', guideAnswer: fGuideAnswer.trim() || undefined, rubric };
  };

  const handleSave = () => {
    setFormError(null);
    const data = manualSave.current?.data ?? payload();
    if (!data) return;
    if (editingDraftKey) {
      setAiDrafts((prev) =>
        prev.map((item) => (item.itemKey === editingDraftKey ? { ...item, question: data } : item)),
      );
      setAiReviewed((previous) => new Set([...previous].filter((key) => key !== editingDraftKey)));
      toast.success('Draft diperbarui. Periksa kembali kunci jawaban.');
      resetForm();
      return;
    }
    startSave(async () => {
      try {
        if (!editingId && !manualSave.current)
          manualSave.current = { requestId: crypto.randomUUID(), data };
        const res = editingId
          ? await updateQuestion(editingId, data)
          : await createQuestion(data, manualSave.current!.requestId);
        if (!res.success) {
          const uncertain = !res.httpStatus || res.httpStatus >= 500 || res.httpStatus === 409;
          setManualSaveUncertain(uncertain);
          setManualSaveConflict(res.httpStatus === 409);
          if (!uncertain) manualSave.current = null;
          setFormError(
            res.httpStatus === 409
              ? (res.error ?? 'Permintaan simpan tidak dapat diulang. Periksa Bank Soal.')
              : uncertain
                ? 'Hasil simpan belum terkonfirmasi. Isian dikunci agar percobaan ulang tidak membuat soal ganda.'
                : 'Soal belum tersimpan. Periksa isian atau coba lagi.',
          );
          return;
        }
        toast.success(editingId ? 'Soal diperbarui.' : 'Soal ditambahkan.');
        resetForm();
        load();
      } catch {
        setManualSaveUncertain(true);
        if (mounted.current)
          setFormError('Koneksi terputus. Isian tetap tersedia; coba simpan lagi.');
      }
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
      JSON.stringify(
        defaultOptions().map((option) => ({ ...option, text: `Opsi ${option.id.toUpperCase()}` })),
      ),
      'a',
      'medium',
      'konsep|latihan',
      '',
    ]
      .map(csvTemplateCell)
      .join(',');
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
      const dataLines = parseCsvRows(String(reader.result ?? '')).filter(({ cells }) =>
        cells.some((cell) => cell.trim()),
      );

      setCsvImportErrors([]);
      setCsvImportedRows(new Set());

      if (dataLines.length > CSV_MAX_ROWS) {
        setCsvPreview({
          fileName: file.name,
          totalRows: dataLines.length,
          validRows: [],
          parseErrors: [
            {
              row: CSV_MAX_ROWS + 1,
              message: `CSV berisi ${dataLines.length} baris. Maksimal ${CSV_MAX_ROWS} baris per file.`,
            },
          ],
        });
        toast.error(`CSV melebihi batas ${CSV_MAX_ROWS} baris.`);
        return;
      }

      for (const { cells, rowNumber } of dataLines) {
        const row = csvCellsToQuestion(cells, subject);
        if (row) validRows.push({ rowNumber, data: row });
        else
          parseErrors.push({
            row: rowNumber,
            message: 'Baris tidak sesuai template atau field wajib kosong.',
          });
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
          chunk.map((row) => ({
            rowKey: importIdentity.rowKeys.get(row.rowNumber) ?? `row-${row.rowNumber}`,
            question: row.data,
          })),
        );
        if (!res.success) {
          const message =
            res.error ?? 'Chunk import gagal. Baris yang sudah berhasil tidak akan dikirim ulang.';
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
        importedAny =
          importedAny ||
          (payload?.imported ?? 0) > 0 ||
          chunk.some((row) => importedRows.has(row.rowNumber));
        setCsvImportErrors(serverErrors);
        setCsvImportedRows(new Set(importedRows));
      }

      if (importedAny) load();
      if (serverErrors.length === 0 && csvPreview.parseErrors.length === 0) {
        toast.success('Import selesai.');
        setCsvPreview(null);
        setCsvImportedRows(new Set());
      } else {
        toast.success(
          `Import diproses: ${importedRows.size} berhasil, ${serverErrors.length + csvPreview.parseErrors.length} perlu diperiksa.`,
        );
      }
    });
  };

  const runAi = async (
    action: NonNullable<typeof aiAction>,
    task: () => Promise<boolean>,
    fallback: string,
    uncertainOnError = false,
  ) => {
    if (aiBusy.current) return false;
    aiBusy.current = true;
    setAiAction(action);
    setAiError(null);
    setAiNotice(null);
    try {
      return await task();
    } catch {
      if (mounted.current) {
        setAiError(fallback);
        if (uncertainOnError) setSaveUncertain(true);
      }
      return false;
    } finally {
      aiBusy.current = false;
      if (mounted.current) setAiAction(null);
    }
  };
  const handleGenerateAiDrafts = () => {
    if (!selectedAiSource || aiDrafts.length) return;
    const tpRefs = aiSelectedTpRefs;
    if (tpRefs.length === 0) {
      setAiError('Pilih minimal satu tujuan pembelajaran.');
      return;
    }
    if (!aiDistributionValid) {
      setAiError('Periksa komposisi di Pengaturan lanjutan. Jumlahnya harus sesuai jumlah soal.');
      return;
    }
    void runAi(
      'generate',
      async () => {
        const request = buildAiQuestionDraftRequest({
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
        });
        generationNonce.current ??= crypto.randomUUID();
        const idempotencyKey = await questionDraftGenerateKey(request, generationNonce.current);
        const res = await generateQuestionDrafts({ ...request, idempotencyKey });
        if (!mounted.current) return false;
        if (!res.success || !res.data) {
          setAiError('Draft belum dapat dibuat. Periksa sumber atau coba lagi.');
          return false;
        }
        setAiGenerationId(res.data.generationId);
        setAiDrafts(res.data.items);
        setAiSelected(new Set(res.data.items.map((item) => item.itemKey)));
        setAiReviewed(new Set());
        setAiStep('review');
        setAiNotice('Draft siap. Periksa isi dan kunci jawaban.');
        return true;
      },
      'Draft belum dapat dibuat. Isian tetap tersedia; coba lagi.',
    );
  };

  const handleRejectAiDrafts = () => {
    if (!aiGenerationId || aiSaved.length > 0) return false;
    return runAi(
      'reject',
      async () => {
        const res = await rejectQuestionDrafts(
          aiGenerationId,
          await questionDraftRejectKey(aiGenerationId),
        );
        if (!mounted.current) return false;
        if (!res.success) {
          setAiError('Draft belum dapat dibuang. Coba lagi.');
          return false;
        }
        setAiDrafts([]);
        setAiGenerationId(null);
        setAiSelected(new Set());
        setAiReviewed(new Set());
        setAiStep('setup');
        generationNonce.current = null;
        setAiNotice('Draft dibuang. Soal di Bank Soal tidak berubah.');
        return true;
      },
      'Draft belum dapat dibuang. Coba lagi.',
    );
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
    if (items.length === 0 || items.some((item) => !aiReviewed.has(item.itemKey))) {
      setAiError('Periksa kunci jawaban semua soal yang dipilih sebelum menyimpan.');
      return;
    }
    void runAi(
      'accept',
      async () => {
        const res = await acceptQuestionDrafts(
          aiGenerationId,
          await questionDraftSaveKey(aiGenerationId, items),
          items,
        );
        if (!mounted.current) return false;
        if (!res.success) {
          const definitiveFailure =
            res.httpStatus !== undefined &&
            [400, 401, 403, 404, 409, 422, 429].includes(res.httpStatus);
          setSaveUncertain(!definitiveFailure);
          setAiError(
            res.errorCode === 'AI_ACCEPTED_ITEM_CHANGED'
              ? 'Soal yang pernah disimpan telah diubah atau dihapus. Buka tab Bank Soal untuk melihat kondisi terbaru.'
              : definitiveFailure
                ? 'Soal belum tersimpan. Periksa isi, kunci, dan rubrik; lalu coba lagi.'
                : 'Soal belum terkonfirmasi tersimpan. Draft tetap di jendela ini; coba simpan lagi.',
          );
          return false;
        }
        const receipt = z
          .object({
            generationId: z.string().uuid(),
            acceptedCount: z.number().int(),
            questions: z.array(
              z.object({ id: z.string().uuid(), aiItemKey: z.string(), body: z.string() }),
            ),
          })
          .safeParse(res.data);
        const requestedKeys = new Set(items.map((item) => item.itemKey));
        if (
          !receipt.success ||
          receipt.data.generationId !== aiGenerationId ||
          receipt.data.acceptedCount !== items.length ||
          receipt.data.questions.length !== items.length ||
          new Set(receipt.data.questions.map((question) => question.aiItemKey)).size !==
            items.length ||
          receipt.data.questions.some((question) => !requestedKeys.has(question.aiItemKey))
        ) {
          setSaveUncertain(true);
          setAiError(
            'Hasil penyimpanan belum dapat dipastikan. Jangan buat ulang draft; coba simpan lagi.',
          );
          return false;
        }
        setSaveUncertain(false);
        setAiSaved((previous) => [
          ...new Map(
            [...previous, ...receipt.data.questions].map((question) => [question.id, question]),
          ).values(),
        ]);
        const acceptedKeys = new Set(items.map((item) => item.itemKey));
        const remainingDrafts = aiDrafts.filter((item) => !acceptedKeys.has(item.itemKey));
        setAiDrafts(remainingDrafts);
        setAiReviewed((previous) => new Set([...previous].filter((key) => !acceptedKeys.has(key))));
        if (remainingDrafts.length === 0) {
          setAiGenerationId(null);
          setAiStep('saved');
        }
        setAiSelected(new Set(remainingDrafts.map((item) => item.itemKey)));
        setAiNotice(
          `${items.length} soal tersimpan di Bank Soal.${remainingDrafts.length ? ` ${remainingDrafts.length} draft belum disimpan.` : ''}`,
        );
        load();
        return true;
      },
      'Penyimpanan belum dapat dipastikan. Draft tetap tersedia; coba simpan lagi.',
      true,
    );
  };

  const handleRegenerateAiDraft = (item: AiQuestionDraftItem) => {
    if (!aiGenerationId) return;
    if (aiBusy.current) return;
    setAiRegeneratingKey(item.itemKey);
    setAiReviewed((previous) => new Set([...previous].filter((key) => key !== item.itemKey)));
    void runAi(
      'regenerate',
      async () => {
        try {
          const res = await regenerateQuestionDraftItem(aiGenerationId, item.itemKey);
          if (!mounted.current) return false;
          if (!res.success || !res.data) {
            setAiError(
              'Soal belum dapat dibuat ulang. Periksa draft yang tersedia atau coba lagi.',
            );
            return false;
          }
          setAiDrafts((prev) =>
            prev.map((draft) => (draft.itemKey === item.itemKey ? res.data!.item : draft)),
          );
          setAiSelected((prev) => new Set(prev).add(item.itemKey));
          setAiNotice('Satu soal dibuat ulang. Periksa kembali isi dan kuncinya.');
          return true;
        } finally {
          if (mounted.current) setAiRegeneratingKey(null);
        }
      },
      'Soal belum dapat dibuat ulang. Coba lagi.',
    );
  };

  const busy = csvLoading || saving || aiAction !== null;
  const requestClose = () => {
    if (busy || aiBusy.current) return;
    if (aiDrafts.length || (showForm && fBody.trim())) setExitConfirm(true);
    else onClose();
  };
  const newDraftBatch = () => {
    if (busy || aiDrafts.length) return;
    generationNonce.current = null;
    setAiGenerationId(null);
    setAiSaved([]);
    setAiSelected(new Set());
    setAiReviewed(new Set());
    setAiStep('setup');
    setAiError(null);
    setAiNotice(null);
  };
  const useSavedQuestions = () => {
    if (busy || !aiSaved.length || aiDrafts.length) return;
    onSelectedPointsChange?.({
      ...selectedPoints,
      ...Object.fromEntries(
        aiSaved.map((question) => [question.id, selectedPoints[question.id] ?? 10]),
      ),
    });
    onClose();
  };
  const activateMode = (target: typeof mode) => {
    if (busy || showForm || saveUncertain || target === mode) return;
    setMode(target);
    if (target === 'manual') setShowForm(true);
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open: boolean) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          className="diis-question-bank flex h-[92dvh] max-h-[56rem] w-[calc(100%-1rem)] max-w-6xl flex-col gap-0 overflow-hidden border-[var(--qb-line)] bg-[var(--qb-bg)] p-0 sm:w-[calc(100%-3rem)]"
          closeDisabled={busy}
          onInteractOutside={(event: Event) => event.preventDefault()}
          onEscapeKeyDown={(event: Event) => {
            if (busy) event.preventDefault();
          }}
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}
        >
          <style>{QUESTION_BANK_STYLE}</style>
          <div className="shrink-0 border-b border-[var(--qb-line)] px-4 py-4 sm:px-6">
            <div>
              <DialogTitle className="flex items-center gap-2 pr-12 text-lg font-bold">
                <Database className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                Bank Soal
              </DialogTitle>
              <DialogDescription className="mt-2 pr-10 text-sm text-[var(--qb-muted)]">
                {subject || 'Semua mapel'}
                {academicYear ? ` · ${academicYear}` : ''}
                {semester ? ` · Semester ${semester}` : ''}
              </DialogDescription>
            </div>
            <div
              role="tablist"
              aria-label="Cara menyiapkan soal"
              className="mt-4 flex gap-1 overflow-x-auto"
            >
              {(
                [
                  ['bank', 'Bank Soal'],
                  ['ai', 'Buat dengan AI'],
                  ['manual', 'Tulis manual'],
                ] as const
              ).map(([target, label]) => (
                <button
                  key={target}
                  id={`${workspaceId}-${target}`}
                  role="tab"
                  type="button"
                  aria-selected={mode === target}
                  aria-controls={`${workspaceId}-panel`}
                  tabIndex={mode === target ? 0 : -1}
                  disabled={(busy || showForm || saveUncertain) && target !== mode}
                  onClick={() => activateMode(target)}
                  onKeyDown={(event) => {
                    if (busy || showForm || saveUncertain) return;
                    const modes = ['bank', 'ai', 'manual'] as const;
                    const index = modes.indexOf(mode);
                    const next =
                      event.key === 'ArrowRight'
                        ? (index + 1) % 3
                        : event.key === 'ArrowLeft'
                          ? (index + 2) % 3
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? 2
                              : null;
                    if (next !== null) {
                      event.preventDefault();
                      const value = modes[next]!;
                      activateMode(value);
                      document.getElementById(`${workspaceId}-${value}`)?.focus();
                    }
                  }}
                  className={`${BTN} shrink-0 rounded-b-none border-b-2 ${mode === target ? 'border-emerald-600 text-[var(--qb-ok-ink)]' : 'border-transparent text-[var(--qb-muted)]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === 'ai' && (
              <ol
                className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm"
                aria-label="Langkah pembuatan soal AI"
              >
                {(
                  [
                    ['setup', 'Atur soal'],
                    ['review', 'Periksa draft'],
                    ['saved', 'Soal tersimpan'],
                  ] as const
                ).map(([step, label], index) => (
                  <li
                    key={step}
                    aria-current={aiStep === step ? 'step' : undefined}
                    className={`flex items-center gap-2 ${aiStep === step ? 'font-semibold text-[var(--qb-ink)]' : 'text-[var(--qb-muted)]'}`}
                  >
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs ${aiStep === step ? 'bg-emerald-700 text-white' : 'bg-[var(--qb-soft)]'}`}
                    >
                      {index + 1}
                    </span>
                    {label}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div
            id={`${workspaceId}-panel`}
            role="tabpanel"
            tabIndex={-1}
            aria-labelledby={`${workspaceId}-${mode}`}
            aria-busy={busy}
            className="qb-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
          >
            {mode === 'bank' && (
              <section className="min-h-[280px] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">Soal tersimpan</h3>
                  <button
                    id={`${workspaceId}-add-question`}
                    type="button"
                    className={`${BTN} ${QB_PRIMARY}`}
                    disabled={busy || saveUncertain}
                    onClick={() => activateMode('manual')}
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Tambah Soal
                  </button>
                </div>
                <div className="grid gap-2 rounded-lg bg-[var(--qb-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_180px_150px]">
                  <input
                    value={questionSearch}
                    onChange={(event) => setQuestionSearch(event.target.value)}
                    placeholder="Cari soal atau tag..."
                    aria-label="Cari soal atau tag"
                    className={FIELD}
                  />
                  <select
                    aria-label="Filter bentuk soal"
                    value={questionTypeFilter}
                    onChange={(event) =>
                      setQuestionTypeFilter(event.target.value as 'all' | QuestionType)
                    }
                    className={FIELD}
                  >
                    <option value="all">Semua tipe</option>
                    {TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter kesulitan soal"
                    value={questionDifficultyFilter}
                    onChange={(event) =>
                      setQuestionDifficultyFilter(event.target.value as 'all' | QuestionDifficulty)
                    }
                    className={FIELD}
                  >
                    <option value="all">Semua level</option>
                    <option value="easy">Mudah</option>
                    <option value="medium">Sedang</option>
                    <option value="hard">Sulit</option>
                  </select>
                </div>
                {bankError ? (
                  <div
                    role="alert"
                    className="rounded-lg bg-[var(--qb-error-bg)] p-4 text-sm text-[var(--qb-error-ink)]"
                  >
                    <p>{bankError}</p>
                    <button
                      type="button"
                      onClick={load}
                      className={`${BTN} mt-2 underline underline-offset-4`}
                    >
                      Muat ulang Bank Soal
                    </button>
                  </div>
                ) : loading ? (
                  <div className="grid h-40 place-items-center rounded-lg border border-dashed border-[var(--qb-line)] text-sm font-semibold text-[var(--qb-muted)]">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Memuat soal...
                  </div>
                ) : questions.length === 0 ? (
                  <div className="grid h-40 place-items-center rounded-lg border border-dashed border-[var(--qb-line)] px-4 text-center text-sm font-semibold text-[var(--qb-muted)]">
                    Belum ada soal untuk mapel ini. Pilih Buat dengan AI atau Tulis manual untuk
                    menambahkan soal.
                  </div>
                ) : (
                  questions.map((question, index) => {
                    const selected = Boolean(selectedPoints[question.id]);
                    return (
                      <article
                        key={question.id}
                        className={clsx(
                          'rounded-lg border p-4',
                          selected
                            ? 'border-emerald-500 bg-[var(--qb-ok-bg)]'
                            : 'border-[var(--qb-line)] bg-[var(--qb-bg)]',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                                {TYPE_LABELS[question.type]}
                              </span>
                              <span className="rounded bg-[var(--qb-soft)] px-1.5 py-0.5 text-[var(--qb-muted)]">
                                {questionDifficultyLabels[question.difficulty]}
                              </span>
                              <span className="text-[var(--qb-muted)]">#{index + 1}</span>
                            </div>
                            <div className="mt-3">
                              <QuestionContent body={question.body} />
                            </div>
                            {Array.isArray(question.tags) && question.tags.length > 0 && (
                              <p className="mt-1 text-xs text-[var(--qb-muted)]">
                                {question.tags.join(', ')}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {selectable && (
                              <button
                                type="button"
                                onClick={() => toggleSelection(question.id)}
                                className={clsx(
                                  BTN,
                                  selected ? 'bg-emerald-600 text-white' : QB_OUTLINE,
                                )}
                              >
                                {selected ? 'Dipilih' : 'Pilih'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startEdit(question)}
                              className={`${BTN} text-[var(--qb-muted)] hover:bg-[var(--qb-soft)]`}
                              aria-label="Edit soal"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(question.id)}
                              className={`${BTN} text-[var(--qb-error-ink)] hover:bg-[var(--qb-error-bg)]`}
                              aria-label="Hapus soal"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {selected && (
                          <div className="mt-2 flex items-center gap-2">
                            <label
                              className="text-xs font-bold text-[var(--qb-muted)]"
                              htmlFor={`points-${question.id}`}
                            >
                              Poin
                            </label>
                            <input
                              id={`points-${question.id}`}
                              type="number"
                              min={1}
                              max={100}
                              value={selectedPoints[question.id] ?? 10}
                              onChange={(event) => updatePoints(question.id, event.target.value)}
                              className={`${FIELD} max-w-20`}
                            />
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs font-semibold text-[var(--qb-muted)]">
                  <span>
                    {questionTotal} soal · halaman {questionPage} dari {pageCount}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuestionPage((page) => Math.max(1, page - 1))}
                      disabled={questionPage <= 1 || loading}
                      className={`${BTN} ${QB_OUTLINE}`}
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuestionPage((page) => Math.min(pageCount, page + 1))}
                      disabled={questionPage >= pageCount || loading}
                      className={`${BTN} ${QB_OUTLINE}`}
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              </section>
            )}

            <div className={mode === 'bank' ? 'mt-5' : ''}>
              {showForm && (
                <h3
                  id={`${workspaceId}-form-title`}
                  tabIndex={-1}
                  className="mb-4 text-base font-bold"
                >
                  {editingDraftKey ? 'Ubah draft soal' : editingId ? 'Ubah soal' : 'Tulis soal'}
                </h3>
              )}

              {!showForm ? (
                <div className="space-y-2">
                  {mode === 'ai' && aiStep === 'setup' && !canGenerateAi && (
                    <div className="rounded-lg bg-[var(--qb-soft)] p-5 text-sm">
                      <p role={sourceRead.state === 'loading' ? 'status' : 'alert'}>
                        {sourceRead.state === 'loading'
                          ? 'Memuat sumber dan tujuan pembelajaran…'
                          : sourceRead.state === 'error'
                            ? 'Sumber soal belum dapat dimuat.'
                            : 'Pilih Modul Ajar atau LMS tersimpan yang memiliki tujuan pembelajaran.'}
                      </p>
                      {sourceRead.state !== 'loading' && (
                        <button
                          type="button"
                          onClick={() => setSourceRetry((count) => count + 1)}
                          className={`${BTN} ${QB_OUTLINE} mt-3`}
                        >
                          Muat ulang sumber
                        </button>
                      )}
                    </div>
                  )}
                  {mode === 'ai' && aiStep === 'setup' && canGenerateAi && (
                    <fieldset disabled={busy} className="space-y-4">
                      <label className="block text-sm font-semibold">
                        Sumber soal
                        <select
                          value={aiSourceKey}
                          onChange={(event) => {
                            const nextKey = event.target.value;
                            setAiSourceKey(nextKey);
                            const nextSource = aiSources.find(
                              (source) => `${source.sourceType}:${source.id}` === nextKey,
                            );
                            if (nextSource)
                              setAiSelectedTpRefs(
                                normalizeSourceTpOptions(nextSource).map((tp) => tp.ref),
                              );
                          }}
                          className={FIELD}
                          aria-label="Sumber soal AI"
                        >
                          {aiSources.map((source) => (
                            <option
                              key={`${source.sourceType}:${source.id}`}
                              value={`${source.sourceType}:${source.id}`}
                            >
                              {source.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="text-sm font-semibold">
                          Jumlah
                          <input
                            aria-label="Jumlah soal AI"
                            type="number"
                            min={1}
                            max={20}
                            value={aiQuestionCount}
                            onChange={(event) =>
                              changeQuestionCount(
                                Math.max(1, Math.min(20, Number(event.target.value) || 1)),
                              )
                            }
                            className={FIELD}
                          />
                        </label>
                        <label className="text-sm font-semibold">
                          Tujuan
                          <select
                            aria-label="Tujuan asesmen"
                            value={aiPurpose}
                            onChange={(event) => setAiPurpose(event.target.value as AiPurpose)}
                            className={FIELD}
                          >
                            <option value="diagnostik">Diagnostik</option>
                            <option value="formatif">Formatif</option>
                            <option value="sumatif-uts">Sumatif UTS</option>
                            <option value="sumatif-uas">Sumatif UAS</option>
                          </select>
                        </label>
                        <label className="text-sm font-semibold">
                          Bentuk soal
                          <select
                            aria-label="Bentuk soal AI"
                            className={FIELD}
                            value={
                              Object.values(aiTypeDistribution).filter((count) => count > 0)
                                .length === 1
                                ? Object.keys(aiTypeDistribution).find(
                                    (key) => aiTypeDistribution[key as QuestionType] > 0,
                                  )
                                : 'mixed'
                            }
                            onChange={(event) => {
                              const type = event.target.value;
                              const weights: TypeDistribution =
                                type === 'mixed'
                                  ? { multiple_choice: 2, true_false: 1, matching: 0, essay: 1 }
                                  : {
                                      multiple_choice: 0,
                                      true_false: 0,
                                      matching: 0,
                                      essay: 0,
                                      [type]: 1,
                                    };
                              typeWeights.current = weights;
                              setAiTypeDistribution(
                                distributeQuestionCount(weights, aiQuestionCount),
                              );
                            }}
                          >
                            <option value="mixed">Campuran</option>
                            {TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold">Tujuan pembelajaran</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {selectedAiTpOptions.map((tp) => (
                            <label
                              key={tp.ref}
                              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-[var(--qb-line)] p-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 shrink-0"
                                checked={aiSelectedTpRefs.includes(tp.ref)}
                                onChange={(event) =>
                                  setAiSelectedTpRefs((current) =>
                                    event.target.checked
                                      ? [...current, tp.ref]
                                      : current.filter((ref) => ref !== tp.ref),
                                  )
                                }
                              />
                              <span className="min-w-0">
                                <b>{tp.ref}</b>
                                <span className="mt-1 block whitespace-pre-wrap break-words font-normal text-[var(--qb-muted)]">
                                  {tp.text}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <details className="rounded-lg border border-[var(--qb-line)] p-3">
                        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                          Pengaturan lanjutan
                        </summary>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <DistributionInputs
                            label="Tipe"
                            values={aiTypeDistribution}
                            options={TYPE_OPTIONS.map((option) => ({
                              key: option.value,
                              label: TYPE_LABELS[option.value],
                            }))}
                            onChange={(key, value) => {
                              const next = { ...aiTypeDistribution, [key]: value };
                              typeWeights.current = next;
                              setAiTypeDistribution(next);
                            }}
                          />
                          <DistributionInputs
                            label="Kesulitan"
                            values={aiDifficultyDistribution}
                            options={[
                              { key: 'easy', label: 'Mudah' },
                              { key: 'medium', label: 'Sedang' },
                              { key: 'hard', label: 'Sulit' },
                            ]}
                            onChange={(key, value) => {
                              const next = { ...aiDifficultyDistribution, [key]: value };
                              difficultyWeights.current = next;
                              setAiDifficultyDistribution(next);
                            }}
                          />
                          <DistributionInputs
                            label="Kognitif"
                            values={aiCognitiveDistribution}
                            options={COGNITIVE_LEVELS.map((level) => ({
                              key: level,
                              label: level,
                            }))}
                            onChange={(key, value) => {
                              const next = { ...aiCognitiveDistribution, [key]: value };
                              cognitiveWeights.current = next;
                              setAiCognitiveDistribution(next);
                            }}
                          />
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <label className="text-sm font-medium">
                            Konteks soal
                            <select
                              value={aiContextMode}
                              onChange={(event) =>
                                setAiContextMode(event.target.value as AiContextMode)
                              }
                              className={FIELD}
                            >
                              <option value="auto_vokasi">Sesuai jurusan</option>
                              <option value="produktif">Produktif</option>
                              <option value="umum">Umum</option>
                            </select>
                          </label>
                          <label className="text-sm font-medium">
                            Karakter soal
                            <select
                              value={aiCharacter}
                              onChange={(event) =>
                                setAiCharacter(event.target.value as AiCharacter)
                              }
                              className={FIELD}
                            >
                              <option value="konseptual">Konseptual</option>
                              <option value="studi_kasus">Studi kasus</option>
                              <option value="praktik">Praktik</option>
                              <option value="literasi">Literasi</option>
                              <option value="numerasi">Numerasi</option>
                            </select>
                          </label>
                        </div>
                        <label className="mt-4 block text-sm font-medium">
                          Catatan guru (opsional)
                          <textarea
                            maxLength={500}
                            value={aiTeacherInstruction}
                            onChange={(event) => setAiTeacherInstruction(event.target.value)}
                            rows={2}
                            placeholder="Tanpa data pribadi siswa"
                            className={FIELD}
                          />
                        </label>
                      </details>
                      {!aiDistributionValid && (
                        <p
                          role="alert"
                          className="rounded-lg bg-[var(--qb-warn-bg)] p-3 text-sm text-[var(--qb-warn-ink)]"
                        >
                          Sesuaikan komposisi di Pengaturan lanjutan dengan jumlah soal.
                        </p>
                      )}
                    </fieldset>
                  )}
                  {mode === 'bank' && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadTemplate}
                          className={clsx(BTN, QB_OUTLINE)}
                        >
                          <Download className="h-4 w-4" />
                          Template CSV
                        </button>
                        <button
                          type="button"
                          onClick={handleExportCsv}
                          disabled={csvLoading}
                          className={clsx(BTN, QB_OUTLINE)}
                        >
                          {csvLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Ekspor CSV
                        </button>
                        <label className={clsx(BTN, `cursor-pointer ${QB_OUTLINE}`)}>
                          <Upload className="h-4 w-4" />
                          Impor CSV
                          <input
                            type="file"
                            accept=".csv"
                            aria-label="Impor soal CSV"
                            className="sr-only"
                            onChange={handleImportCsv}
                          />
                        </label>
                      </div>
                      {csvPreview && (
                        <section
                          className="rounded-lg border border-[var(--qb-line)] bg-[var(--qb-bg)] p-3"
                          aria-live="polite"
                        >
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <div className="min-w-0">
                              <p className="break-words text-sm font-bold">{csvPreview.fileName}</p>
                              <p className="text-xs font-semibold text-[var(--qb-muted)]">
                                {csvPreview.validRows.length} valid,{' '}
                                {csvPreview.parseErrors.length + csvImportErrors.length} error,{' '}
                                {csvImportedRows.size} sudah masuk.
                              </p>
                            </div>
                          </div>
                          {(csvPreview.parseErrors.length > 0 || csvImportErrors.length > 0) && (
                            <div className="mt-2 space-y-1 rounded bg-[var(--qb-warn-bg)] p-2 text-xs font-semibold text-[var(--qb-warn-ink)]">
                              {[...csvPreview.parseErrors, ...csvImportErrors]
                                .slice(0, 6)
                                .map((error, index) => (
                                  <p key={`${error.row}-${index}`}>
                                    Baris {error.row}: {error.message}
                                  </p>
                                ))}
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCsvPreview(null);
                                setCsvImportErrors([]);
                                setCsvImportedRows(new Set());
                              }}
                              className={clsx(BTN, QB_OUTLINE)}
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirmCsvImport}
                              disabled={csvLoading || csvPendingRows.length === 0}
                              className={`${BTN} ${QB_PRIMARY}`}
                            >
                              {csvLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                              {csvImportedRows.size > 0
                                ? `Lanjut ${csvPendingRows.length}`
                                : `Import ${csvPendingRows.length}`}
                            </button>
                          </div>
                          {csvPreview.totalRows > CSV_MAX_ROWS && (
                            <p className="mt-2 text-[11px] font-semibold text-rose-600">
                              File ini ditolak penuh. Pecah file sebelum import.
                            </p>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                  {mode === 'ai' && aiStep === 'review' && (
                    <QuestionBankAiReview
                      drafts={aiDrafts}
                      selected={aiSelected}
                      reviewed={aiReviewed}
                      disabled={busy || saveUncertain}
                      regeneratingKey={aiRegeneratingKey}
                      onSelect={(key, checked) =>
                        setAiSelected((previous) => {
                          const next = new Set(previous);
                          if (checked) next.add(key);
                          else next.delete(key);
                          return next;
                        })
                      }
                      onReview={(key, checked) =>
                        setAiReviewed((previous) => {
                          const next = new Set(previous);
                          if (checked) next.add(key);
                          else next.delete(key);
                          return next;
                        })
                      }
                      onEdit={(item) => {
                        setAiError(null);
                        startEditDraft(item);
                      }}
                      onRegenerate={handleRegenerateAiDraft}
                    />
                  )}
                  {mode === 'ai' && aiStep === 'saved' && (
                    <section aria-label="Soal tersimpan" className="space-y-4">
                      <h3 className="flex items-center gap-2 text-lg font-bold">
                        <Check className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                        {aiSaved.length} soal tersimpan di Bank Soal
                      </h3>
                      <p className="text-sm text-[var(--qb-muted)]">
                        Soal belum diterbitkan kepada siswa. Anda dapat menggunakannya saat
                        menyiapkan asesmen.
                      </p>
                      <ol className="divide-y divide-[var(--qb-line)]">
                        {aiSaved.map((question, index) => (
                          <li key={question.id} className="py-3 text-sm leading-relaxed">
                            <span className="font-semibold">Soal {index + 1}</span>
                            <QuestionContent body={question.body} />
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}
                </div>
              ) : (
                <fieldset disabled={busy || manualSaveUncertain} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="Bentuk soal manual"
                      value={fType}
                      onChange={(event) => setFType(event.target.value as QuestionType)}
                      className={FIELD}
                    >
                      {TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Kesulitan soal"
                      value={fDifficulty}
                      onChange={(event) => setFDifficulty(event.target.value as QuestionDifficulty)}
                      className={FIELD}
                    >
                      <option value="easy">Mudah</option>
                      <option value="medium">Sedang</option>
                      <option value="hard">Sulit</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Pertanyaan</p>
                    <MaterialEditor
                      key={editingId ?? editingDraftKey ?? 'new'}
                      value={fBody}
                      onChange={setFBody}
                      disabled={busy || manualSaveUncertain}
                      ariaLabel="Pertanyaan"
                      compact
                      invalid={!!formError}
                      describedBy={`${workspaceId}-body-help`}
                    />
                    <p id={`${workspaceId}-body-help`} className="text-xs text-[var(--qb-muted)]">
                      Format teks, daftar, atau tabel. Maksimal 5.000 karakter termasuk format.
                    </p>
                  </div>
                  <label className="block text-sm font-semibold">
                    Tag (opsional)
                    <input
                      value={fTags}
                      onChange={(event) => setFTags(event.target.value)}
                      className={FIELD}
                      placeholder="Pisahkan dengan koma"
                    />
                  </label>

                  {fType === 'multiple_choice' && (
                    <div className="space-y-1.5">
                      {fOptions.map((option, index) => (
                        <div key={option.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setFAnswer(option.id)}
                            className={clsx(
                              'grid min-h-11 min-w-11 place-items-center rounded-lg text-sm font-bold focus-visible:ring-2 focus-visible:ring-emerald-500',
                              fAnswer === option.id
                                ? 'bg-emerald-700 text-white'
                                : 'bg-[var(--qb-soft)] text-[var(--qb-muted)]',
                            )}
                            aria-pressed={fAnswer === option.id}
                            aria-label={`Jadikan opsi ${option.id.toUpperCase()} jawaban benar`}
                          >
                            {fAnswer === option.id ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              option.id.toUpperCase()
                            )}
                          </button>
                          <input
                            aria-label={`Pilihan ${option.id.toUpperCase()}`}
                            maxLength={500}
                            value={option.text}
                            onChange={(event) =>
                              setFOptions((prev) =>
                                prev.map((item, idx) =>
                                  idx === index ? { ...item, text: event.target.value } : item,
                                ),
                              )
                            }
                            className={FIELD}
                            placeholder={`Opsi ${option.id.toUpperCase()}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {fType === 'true_false' && (
                    <select
                      aria-label="Kunci jawaban benar atau salah"
                      value={String(fTrueAnswer)}
                      onChange={(event) => setFTrueAnswer(event.target.value === 'true')}
                      className={FIELD}
                    >
                      <option value="true">Benar</option>
                      <option value="false">Salah</option>
                    </select>
                  )}

                  {fType === 'matching' && (
                    <div className="space-y-2">
                      {fPairs.map((pair, index) => (
                        <div
                          key={pair.id}
                          className="rounded-lg border border-[var(--qb-line)] p-3"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              aria-label={`Pernyataan pasangan ${index + 1}`}
                              maxLength={1000}
                              value={pair.prompt}
                              onChange={(event) =>
                                setFPairs((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index ? { ...item, prompt: event.target.value } : item,
                                  ),
                                )
                              }
                              className={FIELD}
                              placeholder="Pernyataan"
                            />
                            <input
                              aria-label={`Jawaban pasangan ${index + 1}`}
                              maxLength={1000}
                              value={pair.match}
                              onChange={(event) =>
                                setFPairs((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index ? { ...item, match: event.target.value } : item,
                                  ),
                                )
                              }
                              className={FIELD}
                              placeholder="Pasangan benar"
                            />
                          </div>
                          <select
                            aria-label={`Kunci pasangan ${index + 1}`}
                            value={fMatchingAnswer[pair.id] ?? pair.id}
                            onChange={(event) =>
                              setFMatchingAnswer((prev) => ({
                                ...prev,
                                [pair.id]: event.target.value,
                              }))
                            }
                            className={clsx(FIELD, 'mt-2')}
                          >
                            {fPairs.map((choice) => (
                              <option key={choice.id} value={choice.id}>
                                {choice.match || choice.id}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={fPairs.length >= 20}
                        onClick={() => {
                          const id = `p${fPairs.length + 1}`;
                          setFPairs((prev) => [...prev, { id, prompt: '', match: '' }]);
                          setFMatchingAnswer((prev) => ({ ...prev, [id]: id }));
                        }}
                        className={`${BTN} ${QB_OUTLINE}`}
                      >
                        <Copy className="h-4 w-4" />
                        Tambah pasangan
                      </button>
                    </div>
                  )}

                  {fType === 'essay' && (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold">
                        Panduan jawaban (khusus guru)
                        <textarea
                          maxLength={5000}
                          value={fGuideAnswer}
                          onChange={(event) => setFGuideAnswer(event.target.value)}
                          className={FIELD}
                          rows={3}
                        />
                      </label>
                      {fRubric.map((criterion, index) => (
                        <div
                          key={criterion.id}
                          className="rounded-lg border border-[var(--qb-line)] p-3"
                        >
                          <input
                            aria-label={`Nama kriteria ${index + 1}`}
                            maxLength={120}
                            value={criterion.name}
                            onChange={(event) =>
                              setFRubric((prev) =>
                                prev.map((item, idx) =>
                                  idx === index ? { ...item, name: event.target.value } : item,
                                ),
                              )
                            }
                            className={FIELD}
                            placeholder="Nama kriteria"
                          />
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="text-sm">
                              Bobot (%)
                              <input
                                aria-label={`Bobot kriteria ${index + 1}`}
                                type="number"
                                min={1}
                                max={100}
                                value={criterion.weight}
                                onChange={(event) =>
                                  setFRubric((prev) =>
                                    prev.map((item, idx) =>
                                      idx === index
                                        ? { ...item, weight: Number(event.target.value) }
                                        : item,
                                    ),
                                  )
                                }
                                className={FIELD}
                              />
                            </label>
                            <label className="text-sm">
                              Skor maksimal
                              <input
                                aria-label={`Skor maksimal kriteria ${index + 1}`}
                                type="number"
                                min={1}
                                max={100}
                                value={criterion.maxScore}
                                onChange={(event) =>
                                  setFRubric((prev) =>
                                    prev.map((item, idx) =>
                                      idx === index
                                        ? { ...item, maxScore: Number(event.target.value) }
                                        : item,
                                    ),
                                  )
                                }
                                className={FIELD}
                              />
                            </label>
                          </div>
                          <label className="mt-2 block text-sm">
                            Keterangan kriteria
                            <textarea
                              maxLength={1000}
                              rows={2}
                              value={criterion.description ?? ''}
                              onChange={(event) =>
                                setFRubric((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index
                                      ? { ...item, description: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              className={FIELD}
                            />
                          </label>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={fRubric.length >= 12}
                        onClick={() =>
                          setFRubric((prev) => [
                            ...prev,
                            {
                              id: `c${prev.length + 1}`,
                              name: '',
                              weight: 100,
                              maxScore: 100,
                              description: '',
                            },
                          ])
                        }
                        className={`${BTN} ${QB_OUTLINE}`}
                      >
                        <Plus className="h-4 w-4" />
                        Tambah kriteria
                      </button>
                    </div>
                  )}
                </fieldset>
              )}
            </div>
          </div>
          <footer className="shrink-0 border-t border-[var(--qb-line)] bg-[var(--qb-bg)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            {showForm && formError && (
              <p
                ref={formErrorRef}
                tabIndex={-1}
                role="alert"
                className="mb-3 rounded-lg bg-[var(--qb-error-bg)] p-3 text-sm text-[var(--qb-error-ink)]"
              >
                {formError}
              </p>
            )}
            {mode === 'ai' && aiError && (
              <p
                role="alert"
                className="mb-3 rounded-lg bg-[var(--qb-error-bg)] p-3 text-sm text-[var(--qb-error-ink)]"
              >
                {aiError}
              </p>
            )}
            {mode === 'ai' && aiNotice && (
              <p role="status" className="mb-2 text-sm text-[var(--qb-ok-ink)]">
                {aiNotice}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-[var(--qb-muted)]">
                {showForm ? (
                  editingDraftKey ? (
                    'Perubahan draft belum masuk ke Bank Soal.'
                  ) : (
                    'Soal disimpan untuk digunakan kembali.'
                  )
                ) : mode === 'ai' && aiStep === 'review' ? (
                  <>
                    <b className="text-[var(--qb-ink)]">{aiSelected.size} soal dipilih</b>
                    {aiSaved.length ? ` · ${aiSaved.length} tersimpan` : ''}
                  </>
                ) : mode === 'ai' && aiStep === 'saved' ? (
                  'Belum diterbitkan ke siswa.'
                ) : mode === 'bank' && selectable ? (
                  `${selectedCount} soal dipilih untuk asesmen ini.`
                ) : (
                  'Periksa isi dan kunci sebelum digunakan.'
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>button]:flex-1">
                {showForm ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (manualSaveUncertain) setExitConfirm(true);
                        else resetForm();
                      }}
                      className={`${BTN} ${QB_OUTLINE}`}
                    >
                      Batal edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (manualSaveConflict) {
                          resetForm();
                          load();
                        } else handleSave();
                      }}
                      className={`${BTN} ${QB_PRIMARY}`}
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      {manualSaveConflict
                        ? 'Periksa Bank Soal'
                        : manualSaveUncertain
                          ? 'Coba simpan lagi'
                          : editingDraftKey
                            ? 'Perbarui draft'
                            : 'Simpan soal'}
                    </button>
                  </>
                ) : mode === 'ai' && aiStep === 'setup' ? (
                  <button
                    type="button"
                    onClick={handleGenerateAiDrafts}
                    disabled={
                      busy ||
                      !canGenerateAi ||
                      !aiDistributionValid ||
                      aiSelectedTpRefs.length === 0
                    }
                    className={`${BTN} ${QB_PRIMARY}`}
                  >
                    {aiAction === 'generate' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {aiAction === 'generate' ? 'Membuat draft…' : 'Buat draft soal'}
                  </button>
                ) : mode === 'ai' && aiStep === 'review' ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || saveUncertain}
                      onClick={() =>
                        aiSaved.length ? setExitConfirm(true) : setDiscardConfirm(true)
                      }
                      className={`${BTN} text-[var(--qb-muted)]`}
                    >
                      {aiSaved.length ? 'Keluar tanpa menyimpan sisa' : 'Buang draft…'}
                    </button>
                    <button
                      type="button"
                      onClick={handleAcceptAiDrafts}
                      disabled={
                        busy ||
                        aiSelected.size === 0 ||
                        aiDrafts.some(
                          (item) => aiSelected.has(item.itemKey) && !aiReviewed.has(item.itemKey),
                        )
                      }
                      className={`${BTN} ${QB_PRIMARY}`}
                    >
                      {aiAction === 'accept' && <Loader2 className="h-4 w-4 animate-spin" />}
                      {aiAction === 'accept'
                        ? 'Menyimpan…'
                        : `Simpan ${aiSelected.size} soal ke Bank Soal`}
                    </button>
                  </>
                ) : mode === 'ai' && aiStep === 'saved' ? (
                  <>
                    <button
                      type="button"
                      onClick={newDraftBatch}
                      className={`${BTN} ${QB_OUTLINE}`}
                    >
                      Buat draft baru
                    </button>
                    <button
                      type="button"
                      onClick={selectable ? useSavedQuestions : () => setMode('bank')}
                      className={`${BTN} ${QB_PRIMARY}`}
                    >
                      {selectable ? 'Gunakan untuk asesmen' : 'Buka Bank Soal'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={requestClose}
                    className={`${BTN} ${QB_OUTLINE}`}
                  >
                    {selectable && selectedCount
                      ? `Gunakan ${selectedCount} soal`
                      : 'Tutup Bank Soal'}
                  </button>
                )}
              </div>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
        title="Hapus soal"
        description="Soal ini akan dihapus dari Bank Soal. Snapshot sesi yang sudah aktif tidak berubah."
        variant="danger"
        confirmLabel="Hapus"
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={exitConfirm}
        onOpenChange={setExitConfirm}
        title="Tutup Bank Soal?"
        description={
          saveUncertain || manualSaveUncertain
            ? 'Hasil simpan belum pasti. Sebaiknya coba simpan lagi sebelum menutup. Soal yang sudah tersimpan tetap ada di Bank Soal.'
            : 'Isian yang belum disimpan di jendela ini tidak dapat dilanjutkan setelah ditutup. Soal yang sudah tersimpan tetap aman.'
        }
        confirmLabel={
          saveUncertain || manualSaveUncertain ? 'Tutup Bank Soal' : 'Keluar tanpa menyimpan'
        }
        cancelLabel="Lanjut mengedit"
        onConfirm={onClose}
      />
      <ConfirmDialog
        open={discardConfirm}
        onOpenChange={setDiscardConfirm}
        title="Buang draft soal?"
        description="Draft yang belum disimpan akan ditolak. Soal yang sudah ada di Bank Soal tidak berubah."
        variant="danger"
        confirmLabel="Buang draft"
        error={aiError ?? undefined}
        onConfirm={handleRejectAiDrafts}
      />
    </>
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
      <div className="text-sm font-semibold">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <label key={option.key} className="min-w-0 text-xs font-medium text-[var(--qb-muted)]">
            {option.label}
            <input
              type="number"
              min={0}
              max={20}
              value={values[option.key] ?? 0}
              onChange={(event) =>
                onChange(option.key, Math.max(0, Math.min(20, Number(event.target.value) || 0)))
              }
              className={`${FIELD} mt-1`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
