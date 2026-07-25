import { isPositionCode, type UserRole } from '@smk/auth';

const ELIGIBLE_MIGRATION_ROLES = new Set<UserRole>(['GURU', 'TATA_USAHA']);

export type AppointmentMigrationClassification =
  | {
      status: 'MIGRATED';
      appointmentStatus: 'ACTIVE' | 'APPROVED' | 'ENDED';
      reason: string;
    }
  | {
      status: 'QUARANTINED';
      reason: string;
    }
  | {
      status: 'SKIPPED';
      reason: string;
    };

export interface StaffPositionMigrationInput {
  staffPositionId: string;
  userRole: UserRole;
  userIsActive?: boolean;
  userDeletedAt?: Date | null;
  staffDeletedAt?: Date | null;
  positionCode: string;
  positionScopeType: 'NONE' | 'MAJOR';
  majorId: string | null;
  academicYearIsActive: boolean;
  academicYearStartDate: Date;
  academicYearEndDate: Date;
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
  duplicateLiveScope: boolean;
  alreadyMigrated: boolean;
}

export function classifyStaffPositionForAppointment(
  row: StaffPositionMigrationInput,
  asOf: Date = todayUtc(),
): AppointmentMigrationClassification {
  if (row.alreadyMigrated) {
    return { status: 'SKIPPED', reason: 'source StaffPosition sudah memiliki appointment migrasi' };
  }

  if (row.staffDeletedAt || row.userDeletedAt) {
    return { status: 'QUARANTINED', reason: 'pegawai atau user sudah dihapus' };
  }

  if (row.userIsActive === false) {
    return { status: 'QUARANTINED', reason: 'user tidak aktif' };
  }

  if (isPositionCode(row.userRole)) {
    return {
      status: 'QUARANTINED',
      reason: `role identitas ${row.userRole} harus dimapping eksplisit ke role stabil sebelum migrasi appointment`,
    };
  }

  if (!ELIGIBLE_MIGRATION_ROLES.has(row.userRole)) {
    return {
      status: 'QUARANTINED',
      reason: `role identitas ${row.userRole} bukan role pegawai yang eligible untuk appointment`,
    };
  }

  if (row.positionScopeType === 'MAJOR' && !row.majorId) {
    return { status: 'QUARANTINED', reason: 'jabatan scope MAJOR tidak memiliki majorId' };
  }

  if (row.positionScopeType === 'NONE' && row.majorId) {
    return { status: 'QUARANTINED', reason: 'jabatan scope NONE memiliki majorId' };
  }

  const effectiveFrom = row.startDate ?? row.academicYearStartDate;
  const effectiveUntil = row.endDate ?? null;
  if (effectiveFrom > row.academicYearEndDate) {
    return { status: 'QUARANTINED', reason: 'tanggal mulai berada di luar tahun ajaran' };
  }
  if (effectiveUntil && effectiveUntil < effectiveFrom) {
    return { status: 'QUARANTINED', reason: 'tanggal akhir lebih awal dari tanggal mulai' };
  }
  if (effectiveUntil && effectiveUntil > row.academicYearEndDate) {
    return { status: 'QUARANTINED', reason: 'tanggal akhir melewati tahun ajaran' };
  }

  const appointmentStatus = resolveAppointmentStatus(row, effectiveFrom, effectiveUntil, asOf);
  if (appointmentStatus !== 'ENDED' && row.duplicateLiveScope) {
    return { status: 'QUARANTINED', reason: 'duplikat live scope jabatan pada StaffPosition' };
  }

  return {
    status: 'MIGRATED',
    appointmentStatus,
    reason: `StaffPosition ${row.staffPositionId} dimigrasikan fail-closed sebagai ${appointmentStatus}`,
  };
}

function resolveAppointmentStatus(
  row: StaffPositionMigrationInput,
  effectiveFrom: Date,
  effectiveUntil: Date | null,
  asOf: Date,
): 'ACTIVE' | 'APPROVED' | 'ENDED' {
  if (!row.isActive || (effectiveUntil && effectiveUntil < asOf)) return 'ENDED';
  if (row.academicYearIsActive && effectiveFrom <= asOf) return 'ACTIVE';
  return 'APPROVED';
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
