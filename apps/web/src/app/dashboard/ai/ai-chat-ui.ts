export function normalizeInitialQuestion(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  return first.trim().slice(0, 500);
}

export function shouldSendChatKey(input: {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
}): boolean {
  return input.key === 'Enter' && !input.shiftKey && !input.isComposing;
}

export function shouldApplyAiChatResponse(input: {
  requestEpoch: number;
  currentEpoch: number;
  aborted?: boolean;
  mounted?: boolean;
}): boolean {
  return input.mounted !== false && !input.aborted && input.requestEpoch === input.currentEpoch;
}

export function setupAiChatMountedGuard(ref: { current: boolean }, onCleanup: () => void): () => void {
  ref.current = true;
  return () => {
    ref.current = false;
    onCleanup();
  };
}
