
type PickerSignal = 'visibility_hidden' | 'fullscreen_exit' | 'window_blur';
const PICKER_LIMIT = 120_000;
const RETURN_LIMIT = 350;

export class AssessmentPhotoActivity {
  private active: {
    signals: Map<PickerSignal, () => void>;
    timer: ReturnType<typeof setTimeout>;
    until: number;
    confirmed: boolean;
  } | null = null;

  begin() {
    this.close();
    this.active = {
      signals: new Map(), timer: setTimeout(() => this.close(), PICKER_LIMIT),
      until: Date.now() + PICKER_LIMIT, confirmed: false,
    };
  }

  complete() {
    const active = this.active;
    if (!active || Date.now() > active.until) { this.close(); return; }
    active.confirmed = true;
    clearTimeout(active.timer);
    active.until = Date.now() + RETURN_LIMIT;
    active.timer = setTimeout(() => this.close(), RETURN_LIMIT);
  }

  hold(signal: PickerSignal, send: () => void): boolean {
    const active = this.active;
    if (!active || Date.now() > active.until || active.signals.has(signal)) return false;
    active.signals.set(signal, send);
    return true;
  }

  awaitingResult(): boolean { return this.inProgress() && this.active?.confirmed === false; }

  inProgress(): boolean {
    return !!this.active && Date.now() <= this.active.until;
  }

  close() {
    const active = this.active;
    this.active = null;
    if (!active) return;
    clearTimeout(active.timer);
    if (!active.confirmed) for (const send of active.signals.values()) send();
  }
}
