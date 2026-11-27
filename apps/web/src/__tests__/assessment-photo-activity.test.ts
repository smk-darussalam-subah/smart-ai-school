
import { AssessmentPhotoActivity } from '@/lib/assessment-photo-activity';

describe('assessment photo picker activity', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('leaves ordinary focus changes on the monitoring path', () => {
    const activity = new AssessmentPhotoActivity();
    const send = jest.fn();
    expect(activity.hold('visibility_hidden', send)).toBe(false);
  });

  it('only absorbs the correlated signals for a completed picker, including cancellation', () => {
    const activity = new AssessmentPhotoActivity();
    const send = jest.fn();
    activity.begin();
    expect(activity.awaitingResult()).toBe(true);
    expect(activity.hold('window_blur', send)).toBe(true);
    expect(activity.hold('window_blur', send)).toBe(false);
    activity.complete();
    expect(activity.awaitingResult()).toBe(false);
    expect(activity.hold('fullscreen_exit', send)).toBe(true);
    jest.advanceTimersByTime(350);
    expect(send).not.toHaveBeenCalled();
    expect(activity.hold('visibility_hidden', send)).toBe(false);
  });

  it('releases unmatched signals on timeout and when navigation interrupts the picker', () => {
    const activity = new AssessmentPhotoActivity();
    const send = jest.fn();
    activity.begin();
    expect(activity.hold('window_blur', send)).toBe(true);
    jest.advanceTimersByTime(120_000);
    expect(send).toHaveBeenCalledTimes(1);
    activity.begin();
    expect(activity.hold('visibility_hidden', send)).toBe(true);
    activity.close();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
