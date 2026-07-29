import React from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { getEffectiveRoles } from '@/lib/view-as';
import LoadError from '@/components/LoadError';
import StrukturClient from './_components/StrukturClient';
import {
  type AcademicYear,
  type AppointmentRegistryResponse,
  type AppointmentStatus,
  type Major,
  type Position,
  type PositionCapability,
  normalizeStrukturTab,
} from './struktur-ui';

type SearchParams = Promise<Record<string, string | undefined>>;

interface MyPositionsResponse {
  academicYear: { id: string; code: string } | null;
  positions: Array<{
    id: string;
    position: { code: string; name: string };
  }>;
}

function queryStatus(value: string | undefined): AppointmentStatus | undefined {
  const allowed: AppointmentStatus[] = [
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'ACTIVE',
    'SUSPENDED',
    'ENDED',
    'REJECTED',
    'CANCELLED',
    'SUPERSEDED',
  ];
  return allowed.includes(value as AppointmentStatus) ? value as AppointmentStatus : undefined;
}

function queryPage(value: string | undefined) {
  const page = Number(value ?? '1');
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export default async function StrukturOrganisasiPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  const roles = await getEffectiveRoles(session);
  const token = session?.accessToken ?? '';
  if (!token) redirect('/login');

  const sp = await searchParams;
  const tab = normalizeStrukturTab(sp.tab);

  const myPositionsRes = await apiFetch<MyPositionsResponse>('/positions/my-positions', token);
  if (myPositionsRes === null) {
    return <LoadError />;
  }

  const hasActiveKepalaSekolah = myPositionsRes.positions.some((item) =>
    item.position.code === 'KEPALA_SEKOLAH',
  );
  if (!roles.includes('SUPER_ADMIN') && !hasActiveKepalaSekolah) redirect('/dashboard');

  const [positionsRes, yearsRes, majorsRes] = await Promise.all([
    apiFetch<Position[]>('/positions', token),
    apiFetch<AcademicYear[]>('/school/academic-years', token),
    apiFetch<Major[]>('/school/majors?activeOnly=true', token),
  ]);

  if (positionsRes === null || yearsRes === null || majorsRes === null) {
    return <LoadError />;
  }

  const activeYear = yearsRes.find((year) => year.isActive) ?? yearsRes[0] ?? null;
  const selectedYearId = sp.yearId && yearsRes.some((year) => year.id === sp.yearId)
    ? sp.yearId
    : activeYear?.id;
  const page = queryPage(sp.page);
  const status = queryStatus(sp.status);

  const appointmentParams: Record<string, string> = {
    page: String(page),
    limit: '20',
  };
  if (selectedYearId) appointmentParams.academicYearId = selectedYearId;
  if (status) appointmentParams.status = status;
  if (sp.q) appointmentParams.search = sp.q;
  if (sp.positionId) appointmentParams.positionId = sp.positionId;
  if (sp.majorId) appointmentParams.majorId = sp.majorId;
  if (sp.kind === 'DEFINITIVE' || sp.kind === 'PLT') appointmentParams.kind = sp.kind;

  const structureParams: Record<string, string> = { limit: '100' };
  if (selectedYearId) structureParams.academicYearId = selectedYearId;

  const replacementSourceParams: Record<string, string> = {
    limit: '100',
    status: 'ACTIVE,SUSPENDED',
  };
  if (activeYear?.id) replacementSourceParams.academicYearId = activeYear.id;

  const [
    appointmentsRes,
    structureAppointmentsRes,
    replacementSourceAppointmentsRes,
    positionCapabilitiesRes,
  ] = await Promise.all([
    apiFetch<AppointmentRegistryResponse>('/appointments', token, appointmentParams),
    apiFetch<AppointmentRegistryResponse>('/appointments', token, structureParams),
    apiFetch<AppointmentRegistryResponse>('/appointments', token, replacementSourceParams),
    apiFetch<PositionCapability[]>('/appointments/position-capabilities', token),
  ]);

  if (
    appointmentsRes === null ||
    structureAppointmentsRes === null ||
    replacementSourceAppointmentsRes === null ||
    positionCapabilitiesRes === null
  ) return <LoadError />;

  return (
    <StrukturClient
      tab={tab}
      roles={roles}
      positions={positionsRes}
      positionCapabilities={positionCapabilitiesRes}
      years={yearsRes}
      majors={majorsRes}
      selectedYearId={selectedYearId ?? ''}
      appointments={appointmentsRes}
      structureAppointments={structureAppointmentsRes.data}
      replacementAppointments={replacementSourceAppointmentsRes.data}
      filters={{
        q: sp.q ?? '',
        status: status ?? '',
        positionId: sp.positionId ?? '',
        majorId: sp.majorId ?? '',
        kind: sp.kind === 'DEFINITIVE' || sp.kind === 'PLT' ? sp.kind : '',
        page,
      }}
    />
  );
}
