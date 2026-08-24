'use server';

import { revalidatePath } from 'next/cache';
import { apiAction } from '@/lib/server-actions';
import type { DisplayProfile } from '@/lib/display-contract';

const MONITORING_PATH = '/dashboard/monitoring';

export interface PairingResult {
  id: string;
  pairingCode: string;
  expiresAt: string;
  profile: DisplayProfile;
}

function refresh() {
  revalidatePath(MONITORING_PATH);
}

export async function createDisplayPairingAction(body: {
  label: string;
  profile: DisplayProfile;
  audioEnabled: boolean;
}) {
  const result = await apiAction<PairingResult>('/display-devices/pairing', 'POST', body);
  if (!result.error) refresh();
  return result;
}

export async function rotateDisplayDeviceAction(id: string) {
  const result = await apiAction<PairingResult>(`/display-devices/${id}/rotate`, 'POST', {});
  if (!result.error) refresh();
  return result;
}

export async function revokeDisplayDeviceAction(id: string) {
  const result = await apiAction(`/display-devices/${id}`, 'DELETE');
  if (!result.error) refresh();
  return result;
}

export async function revokeAllDisplayDevicesAction() {
  const result = await apiAction('/display-devices/revoke-all', 'POST');
  if (!result.error) refresh();
  return result;
}
