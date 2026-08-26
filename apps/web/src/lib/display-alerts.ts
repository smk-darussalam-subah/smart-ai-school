import type { DisplayAlert } from './display-contract';

export const INDONESIAN_SPEECH_RATE = 0.92;

export type DisplayAlertPlaybackFailure =
  | 'timeout'
  | 'speech-error'
  | 'start-failed'
  | 'confirmation-failed';

export type DisplayAlertPlaybackResult =
  | { status: 'played' }
  | { status: 'retryable'; reason: DisplayAlertPlaybackFailure };

export function canRunDisplayAudioTest(input: {
  audioEnabled: boolean;
  muted: boolean;
  alertSpeaking: boolean;
  playbackInFlight: number;
}): boolean {
  return input.audioEnabled && !input.muted && !input.alertSpeaking && input.playbackInFlight === 0;
}

export async function processDisplayAudioQueue<T>(
  takeNext: () => T | undefined,
  process: (item: T) => Promise<void>,
): Promise<void> {
  let item = takeNext();
  while (item !== undefined) {
    await process(item);
    item = takeNext();
  }
}

export function playClaimedDisplayAlert(input: {
  utterance: SpeechSynthesisUtterance;
  synthesis: Pick<SpeechSynthesis, 'speak' | 'cancel'>;
  markPlayed: () => Promise<boolean>;
  releaseClaim: () => Promise<unknown>;
  onFailure?: (reason: DisplayAlertPlaybackFailure) => void;
  timeoutMs?: number;
}): Promise<DisplayAlertPlaybackResult> {
  const timeoutMs = input.timeoutMs ?? 40_000;

  return new Promise((resolve) => {
    let settled = false;
    let speechEnded = false;
    const timeout = globalThis.setTimeout(() => {
      void finalizeRetryable('timeout', !speechEnded);
    }, timeoutMs);

    const release = async () => {
      await input.releaseClaim().catch(() => undefined);
    };

    async function finalizeRetryable(
      reason: DisplayAlertPlaybackFailure,
      cancelSpeech: boolean,
    ): Promise<void> {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      if (cancelSpeech) input.synthesis.cancel();
      await release();
      input.onFailure?.(reason);
      resolve({ status: 'retryable', reason });
    }

    async function finalizePlayed(): Promise<void> {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      await release();
      resolve({ status: 'played' });
    }

    input.utterance.onend = () => {
      if (settled || speechEnded) return;
      speechEnded = true;
      void input
        .markPlayed()
        .then((marked) => {
          if (!marked) {
            void finalizeRetryable('confirmation-failed', false);
            return;
          }
          void finalizePlayed();
        })
        .catch(() => void finalizeRetryable('confirmation-failed', false));
    };
    input.utterance.onerror = () => {
      if (speechEnded) return;
      void finalizeRetryable('speech-error', true);
    };

    try {
      input.synthesis.speak(input.utterance);
    } catch {
      void finalizeRetryable('start-failed', true);
    }
  });
}

export function neutralAlertSpeech(alert: Pick<DisplayAlert, 'className' | 'room'>): string {
  const room = alert.room ? `, di ${alert.room},` : ',';
  return `Perhatian. Pembelajaran kelas ${alert.className}${room} belum dikonfirmasi dimulai. Mohon segera ditindaklanjuti.`;
}

export function chooseIndonesianVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const candidates = voices.filter((voice) => /^id(?:-|_)/i.test(voice.lang));
  return (
    candidates.find((voice) => /bahasa indonesia/i.test(voice.name)) ??
    candidates.find((voice) => voice.default) ??
    candidates[0] ??
    null
  );
}

export function configureIndonesianSpeech(
  utterance: SpeechSynthesisUtterance,
  voice: SpeechSynthesisVoice,
): void {
  utterance.lang = 'id-ID';
  utterance.voice = voice;
  utterance.rate = INDONESIAN_SPEECH_RATE;
  utterance.pitch = 1;
  utterance.volume = 1;
}

export async function resolveIndonesianVoice(
  synthesis: SpeechSynthesis,
  timeoutMs = 1_200,
): Promise<SpeechSynthesisVoice | null> {
  const immediate = chooseIndonesianVoice(synthesis.getVoices());
  if (immediate) return immediate;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synthesis.removeEventListener('voiceschanged', finish);
      window.clearTimeout(timer);
      resolve(chooseIndonesianVoice(synthesis.getVoices()));
    };
    const timer = window.setTimeout(finish, timeoutMs);
    synthesis.addEventListener('voiceschanged', finish, { once: true });
  });
}
