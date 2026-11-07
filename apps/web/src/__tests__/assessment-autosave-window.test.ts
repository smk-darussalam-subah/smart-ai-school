import {
  AssessmentAutosaveWindow,
  ASSESSMENT_AUTOSAVE_INTERVAL_MS,
} from '../lib/assessment-autosave-window';

describe('assessment automatic network save window', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('coalesces repeated edits into the latest answer within five seconds of the first edit', () => {
    const gate = new AssessmentAutosaveWindow();
    let answer = 'first';
    const send = jest.fn(() => {
      gate.markStarted();
      return answer;
    });
    gate.schedule(send);
    for (let second = 1; second < 5; second++) {
      jest.advanceTimersByTime(1000);
      answer = `edit-${second}`;
      gate.schedule(send);
    }
    expect(send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveReturnedWith('edit-4');
    expect(ASSESSMENT_AUTOSAVE_INTERVAL_MS).toBe(5000);
  });

  it('does not starve while typing continues beyond several windows', () => {
    const gate = new AssessmentAutosaveWindow();
    const sends: number[] = [];
    const send = () => {
      sends.push(performance.now());
      gate.markStarted();
    };
    gate.schedule(send);
    for (let edit = 0; edit < 30; edit++) {
      jest.advanceTimersByTime(500);
      gate.schedule(send);
    }
    expect(sends).toEqual([5000, 10000, 15000]);
    gate.cancel();
  });

  it('measures the next automatic send from start, not from a slow acknowledgement', () => {
    const gate = new AssessmentAutosaveWindow();
    const send = jest.fn(() => gate.markStarted());
    gate.markStarted();
    // The old response acknowledges at4s; its older revision needs a fresh save.
    jest.advanceTimersByTime(4000);
    gate.retry(send, 1000);
    jest.advanceTimersByTime(999);
    expect(send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not shorten server-busy backoff when new answers arrive', () => {
    const gate = new AssessmentAutosaveWindow();
    const retry = jest.fn(() => gate.markStarted());
    gate.markStarted();
    gate.retry(retry, 12000);
    jest.advanceTimersByTime(1000);
    gate.schedule(retry);
    jest.advanceTimersByTime(10999);
    expect(retry).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('honors the five-second floor on a fast failure/reconnect retry', () => {
    const gate = new AssessmentAutosaveWindow();
    const send = jest.fn(() => gate.markStarted());
    gate.markStarted();
    jest.advanceTimersByTime(100);
    gate.retry(send, 0);
    jest.advanceTimersByTime(4899);
    expect(send).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('allows a manual send now, then pushes a pending automatic timer behind it', () => {
    const gate = new AssessmentAutosaveWindow();
    const send = jest.fn(() => gate.markStarted());
    gate.schedule(send);
    jest.advanceTimersByTime(3000);
    // The component's manual action calls the transport directly.
    send();
    jest.advanceTimersByTime(4999);
    expect(send).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('cancels pending automatic work for final submit/unmount', () => {
    const gate = new AssessmentAutosaveWindow();
    const send = jest.fn();
    gate.schedule(send);
    jest.advanceTimersByTime(4999);
    gate.cancel();
    jest.runOnlyPendingTimers();
    expect(send).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('an obsolete effect cleanup cannot cancel a newer pending save', () => {
    const gate = new AssessmentAutosaveWindow();
    const send = jest.fn();
    const obsoleteCleanup = gate.retry(send, 6000);
    gate.retry(send, 9000);
    obsoleteCleanup();
    jest.advanceTimersByTime(9000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('uses a monotonic clock when the system wall clock moves backwards', () => {
    const gate = new AssessmentAutosaveWindow();
    const send = jest.fn(() => gate.markStarted());
    gate.markStarted();
    gate.retry(send, 0);
    jest.setSystemTime(Date.now() - 60000);
    jest.advanceTimersByTime(5000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
