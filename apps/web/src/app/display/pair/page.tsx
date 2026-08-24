import DisplayPairing from '@/components/display/DisplayPairing';

export default async function DisplayPairPage({ searchParams }: { searchParams: Promise<{ reason?: string; device?: string }> }) {
  const { reason, device } = await searchParams;
  return <DisplayPairing reason={reason === 'legacy' || reason === 'credential' ? reason : undefined} initialDeviceId={device?.slice(0, 36)} />;
}
