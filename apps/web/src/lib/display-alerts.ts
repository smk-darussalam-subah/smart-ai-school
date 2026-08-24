import type { DisplayAlert } from './display-contract';

export function neutralAlertSpeech(alert: Pick<DisplayAlert, 'className' | 'room'>): string {
  const room = alert.room ? ` di ${alert.room}` : '';
  return `Perhatian. Sesi kelas ${alert.className}${room} memerlukan tindak lanjut.`;
}

export function chooseIndonesianVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return voices.find((voice) => voice.lang.toLowerCase().startsWith('id')) ?? null;
}
