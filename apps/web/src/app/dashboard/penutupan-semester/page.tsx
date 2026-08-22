import React from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/api';
import { resolveDashboardAuthority } from '@/lib/dashboard-authority';
import SemesterClosingClient from './_components/SemesterClosingClient';
import type { SemesterClosureSummary, SemesterReadiness } from './actions';
import {
  canCloseSemesterFromAuthority,
  canReadSemesterClosingReadiness,
  canReadSemesterFinalReport,
  type SemesterClosingUnavailableReason,
} from './semester-closing-ui';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; status: number; message: string };

async function fetchSemesterClosingJson<T>(path: string, token: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { message: text };
    }

    if (!res.ok) {
      if (res.status === 401) redirect('/login?reason=session');
      return {
        success: false,
        status: res.status,
        message: apiErrorMessage(parsed, 'Data penutupan semester tidak dapat dimuat.'),
      };
    }

    return { success: true, data: parsed as T };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { success: false, status: 0, message: 'Koneksi ke server gagal.' };
  }
}

function unavailableReasonFromStatus(status: number): SemesterClosingUnavailableReason {
  if (status === 403) return 'access-denied';
  if (status === 409 || status === 404) return 'no-active-period';
  return 'api-error';
}

export default async function SemesterClosingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) redirect('/login?reason=session');

  const authority = await resolveDashboardAuthority(session);
  const canReadFinalReport = canReadSemesterFinalReport(authority);
  const canCloseSemester = canCloseSemesterFromAuthority(authority);
  const canReadReadiness = canReadSemesterClosingReadiness(authority);

  if (!canReadReadiness) {
    return (
      <SemesterClosingClient
        initialReadiness={null}
        initialClosures={[]}
        canReadFinalReport={false}
        canCloseSemester={false}
        unavailableReason="access-denied"
      />
    );
  }

  const readiness = await fetchSemesterClosingJson<SemesterReadiness>('/semester-closing/readiness', session.accessToken);
  if (!readiness.success) {
    return (
      <SemesterClosingClient
        initialReadiness={null}
        initialClosures={[]}
        canReadFinalReport={canReadFinalReport}
        canCloseSemester={canCloseSemester}
        unavailableReason={unavailableReasonFromStatus(readiness.status)}
      />
    );
  }

  const closures = canReadFinalReport
    ? await fetchSemesterClosingJson<{ data: SemesterClosureSummary[] }>('/semester-closing/closures', session.accessToken)
    : { success: true as const, data: { data: [] } };

  return (
    <SemesterClosingClient
      initialReadiness={readiness.data}
      initialClosures={closures.success ? closures.data.data : []}
      canReadFinalReport={canReadFinalReport}
      canCloseSemester={canCloseSemester}
      initialClosuresError={closures.success ? null : closures.message}
    />
  );
}
