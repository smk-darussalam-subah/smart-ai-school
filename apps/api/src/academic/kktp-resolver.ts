import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const SYSTEM_DEFAULT_KKTP = 75;

export type KktpProvenance = 'module' | 'config' | 'system_default' | 'unconfigured';
export type PersistedKktpProvenance = Exclude<KktpProvenance, 'unconfigured'>;

type KktpDb = PrismaService | Prisma.TransactionClient;

interface ParticipantSnapshotInput {
  value: unknown;
  provenance?: string | null;
}

interface ResolveKktpInput {
  participantSnapshot?: ParticipantSnapshotInput | null;
  moduleKktp?: number | null;
  subject?: string | null;
  academicYear?: string | null;
  semester?: number | null;
}

export interface ResolvedKktp {
  value: number | null;
  provenance: KktpProvenance;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeProvenance(value?: string | null): KktpProvenance {
  if (value === 'module' || value === 'config' || value === 'system_default' || value === 'unconfigured') {
    return value;
  }
  return 'system_default';
}

export async function resolveKktpThreshold(
  db: KktpDb,
  input: ResolveKktpInput,
): Promise<ResolvedKktp> {
  const participantValue = toNumber(input.participantSnapshot?.value);
  if (participantValue !== null) {
    return {
      value: participantValue,
      provenance: normalizeProvenance(input.participantSnapshot?.provenance),
    };
  }

  if (input.moduleKktp !== null && input.moduleKktp !== undefined) {
    return { value: input.moduleKktp, provenance: 'module' };
  }

  const subject = input.subject?.trim();
  if (!subject || !input.academicYear || !input.semester) {
    return { value: null, provenance: 'unconfigured' };
  }

  const config = await db.kktpConfig.findUnique({
    where: {
      subject_academicYear_semester: {
        subject,
        academicYear: input.academicYear,
        semester: input.semester,
      },
    },
    select: { kktp: true },
  });
  if (config) return { value: config.kktp, provenance: 'config' };

  return { value: SYSTEM_DEFAULT_KKTP, provenance: 'system_default' };
}
