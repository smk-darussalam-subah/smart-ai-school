import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AssessmentAnswerMap,
  AssessmentItemScore,
  StoredQuestionSnapshotSchema,
  QuestionPayload,
  StoredQuestionSnapshot,
} from './assessment-contract';

type QuestionRecord = {
  id: string;
  subject: string;
  type: string;
  body: string;
  options: Prisma.JsonValue | null;
  answer: string | null;
  difficulty: string;
  tags: string[];
  rubric: Prisma.JsonValue | null;
};

function matchingChoiceId(questionId: string, pairId: string): string {
  let hash = 0;
  const input = `${questionId}:${pairId}`;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return `choice-${hash.toString(36)}`;
}

function matchingChoices(question: Extract<StoredQuestionSnapshot, { type: 'matching' }>) {
  return question.pairs
    .map((pair) => ({ id: matchingChoiceId(question.id, pair.id), text: pair.match }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function questionPayloadToData(dto: QuestionPayload): {
  options?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  answer?: string | null;
  rubric?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
} {
  switch (dto.type) {
    case 'multiple_choice':
      return { options: dto.options as Prisma.InputJsonValue, answer: dto.answer, rubric: Prisma.JsonNull };
    case 'true_false':
      return { options: Prisma.JsonNull, answer: String(dto.answer), rubric: Prisma.JsonNull };
    case 'matching':
      return { options: dto.pairs as Prisma.InputJsonValue, answer: JSON.stringify(dto.answer), rubric: Prisma.JsonNull };
    case 'essay':
      return { options: Prisma.JsonNull, answer: dto.guideAnswer ?? null, rubric: dto.rubric as Prisma.InputJsonValue };
  }
}

export function dbQuestionToSnapshot(question: QuestionRecord, points: number): StoredQuestionSnapshot {
  const base = {
    id: question.id,
    subject: question.subject,
    body: question.body,
    difficulty: question.difficulty as 'easy' | 'medium' | 'hard',
    tags: question.tags,
    points,
  };

  if (question.type === 'multiple_choice') {
    if (!Array.isArray(question.options) || !question.answer) {
      throw new ConflictException('Soal pilihan ganda belum lengkap');
    }
    return {
      ...base,
      type: 'multiple_choice',
      options: question.options as Array<{ id: string; text: string }>,
      answer: question.answer,
    };
  }

  if (question.type === 'true_false') {
    if (question.answer !== 'true' && question.answer !== 'false') {
      throw new ConflictException('Kunci benar/salah belum lengkap');
    }
    return {
      ...base,
      type: 'true_false',
      answer: question.answer === 'true',
    };
  }

  if (question.type === 'matching') {
    if (!Array.isArray(question.options) || !question.answer) {
      throw new ConflictException('Soal menjodohkan belum lengkap');
    }
    let answer: Record<string, string>;
    try {
      answer = JSON.parse(question.answer) as Record<string, string>;
    } catch {
      throw new ConflictException('Kunci menjodohkan tidak valid');
    }
    return {
      ...base,
      type: 'matching',
      pairs: question.options as Array<{ id: string; prompt: string; match: string }>,
      answer,
    };
  }

  if (question.type === 'essay') {
    if (!Array.isArray(question.rubric) || question.rubric.length === 0) {
      throw new ConflictException('Rubrik esai belum lengkap');
    }
    return {
      ...base,
      type: 'essay',
      guideAnswer: question.answer ?? undefined,
      rubric: question.rubric as Array<{ id: string; name: string; description?: string; weight: number; maxScore: number }>,
    };
  }

  throw new ConflictException('Tipe soal tidak didukung');
}

export function sanitizeQuestionForStudent(question: StoredQuestionSnapshot) {
  const base = {
    id: question.id,
    type: question.type,
    body: question.body,
    subject: question.subject,
    difficulty: question.difficulty,
    tags: question.tags,
    points: question.points,
  };
  switch (question.type) {
    case 'multiple_choice':
      return { ...base, options: question.options };
    case 'true_false':
      return base;
    case 'matching':
      return {
        ...base,
        prompts: question.pairs.map((pair) => ({ id: pair.id, prompt: pair.prompt })),
        choices: matchingChoices(question),
      };
    case 'essay':
      return {
        ...base,
        rubricCriteria: question.rubric.map((criterion) => ({
          id: criterion.id,
          name: criterion.name,
          maxScore: criterion.maxScore,
        })),
      };
  }
}

export function parseSnapshotQuestions(raw: Prisma.JsonValue): StoredQuestionSnapshot[] {
  if (!Array.isArray(raw)) throw new ConflictException('Snapshot soal tidak valid');
  try {
    return raw.map((question) => StoredQuestionSnapshotSchema.parse(question));
  } catch {
    throw new ConflictException('Snapshot soal tidak valid');
  }
}

export function orderSnapshotForAttempt(questions: StoredQuestionSnapshot[], order: string[]): StoredQuestionSnapshot[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const ordered = order.map((id) => byId.get(id)).filter((question): question is StoredQuestionSnapshot => Boolean(question));
  return ordered.length === questions.length ? ordered : questions;
}

export function shuffleQuestionIds(questions: StoredQuestionSnapshot[]): string[] {
  const ids = questions.map((question) => question.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = tmp;
  }
  return ids;
}

export function validateAnswersForSnapshot(
  answers: AssessmentAnswerMap,
  questions: StoredQuestionSnapshot[],
): void {
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  for (const [questionId, answer] of Object.entries(answers)) {
    const question = questionMap.get(questionId);
    if (!question) throw new BadRequestException(`Jawaban mengandung ID soal tidak valid: ${questionId}`);
    if (answer.type !== question.type) throw new BadRequestException(`Tipe jawaban tidak sesuai untuk soal ${questionId}`);

    if (question.type === 'multiple_choice' && answer.type === 'multiple_choice') {
      if (!question.options.some((option) => option.id === answer.optionId)) {
        throw new BadRequestException(`Opsi jawaban tidak valid untuk soal ${questionId}`);
      }
    }

    if (question.type === 'matching' && answer.type === 'matching') {
      const validPromptIds = new Set(question.pairs.map((pair) => pair.id));
      const validChoiceIds = new Set(question.pairs.map((pair) => matchingChoiceId(question.id, pair.id)));
      for (const [left, right] of Object.entries(answer.pairs)) {
        if (!validPromptIds.has(left) || !validChoiceIds.has(right)) {
          throw new BadRequestException(`Pasangan jawaban tidak valid untuk soal ${questionId}`);
        }
      }
    }
  }
}

export function scoreAnswers(
  answers: AssessmentAnswerMap,
  questions: StoredQuestionSnapshot[],
  previousItemScores: AssessmentItemScore[] = [],
): { score: number | null; itemScores: AssessmentItemScore[]; manualPendingCount: number } {
  const previousManual = new Map(
    previousItemScores
      .filter((item) => item.status === 'manual_scored')
      .map((item) => [item.questionId, item]),
  );
  const itemScores: AssessmentItemScore[] = [];
  let earned = 0;
  let max = 0;
  let manualPendingCount = 0;

  for (const question of questions) {
    max += question.points;
    const answer = answers[question.id];
    if (question.type === 'essay') {
      const scored = previousManual.get(question.id);
      if (scored) {
        earned += scored.points;
        itemScores.push(scored);
      } else {
        manualPendingCount++;
        itemScores.push({
          questionId: question.id,
          type: question.type,
          status: 'manual_pending',
          points: 0,
          maxPoints: question.points,
          scorePct: null,
        });
      }
      continue;
    }

    let itemEarned = 0;
    if (question.type === 'multiple_choice' && answer?.type === 'multiple_choice') {
      itemEarned = answer.optionId === question.answer ? question.points : 0;
    } else if (question.type === 'true_false' && answer?.type === 'true_false') {
      itemEarned = answer.value === question.answer ? question.points : 0;
    } else if (question.type === 'matching' && answer?.type === 'matching') {
      const totalPairs = question.pairs.length;
      const correctPairs = question.pairs.filter((pair) => {
        const correctPairId = question.answer[pair.id];
        return correctPairId ? answer.pairs[pair.id] === matchingChoiceId(question.id, correctPairId) : false;
      }).length;
      itemEarned = totalPairs > 0 ? Math.round((correctPairs / totalPairs) * question.points * 100) / 100 : 0;
    }

    earned += itemEarned;
    itemScores.push({
      questionId: question.id,
      type: question.type,
      status: 'auto',
      points: itemEarned,
      maxPoints: question.points,
      scorePct: question.points > 0 ? Math.round((itemEarned / question.points) * 100) : 0,
    });
  }

  return {
    score: manualPendingCount > 0 ? null : Math.round((earned / Math.max(max, 1)) * 100),
    itemScores,
    manualPendingCount,
  };
}

export function sanitizeCsvCell(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(protectedText)) {
    return `"${protectedText.replace(/"/g, '""')}"`;
  }
  return protectedText;
}
