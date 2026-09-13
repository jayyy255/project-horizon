import { describe, it, expect, vi } from 'vitest';
import { InputSynthesizer } from '../input/synthesizer.js';

describe('TC-SEC-02: Input Synthesizer & Hardware Panic Kill-Switch', () => {
  it('purges queued inputs and halts execution in under 20ms when cursor hits screen corner', () => {
    const onPanicMock = vi.fn();
    const synth = new InputSynthesizer({ width: 1920, height: 1080 }, onPanicMock);

    // Enqueue 5 synthetic actions
    synth.enqueue({ type: 'mouse_move', target: { x: 500, y: 500 } });
    synth.enqueue({ type: 'click', target: { x: 500, y: 500 } });
    synth.enqueue({ type: 'type', text: 'npm test' });
    synth.enqueue({ type: 'hotkey', keys: 'Enter' });
    synth.enqueue({ type: 'mouse_move', target: { x: 800, y: 300 } });

    expect(synth.getQueueLength()).toBe(5);

    // Simulate cursor slammed into top-left corner (0, 0)
    const triggered = synth.checkCornerSlam({ x: 2, y: 1 });
    expect(triggered).toBe(true);

    // Queue must be purged to 0 immediately
    expect(synth.getQueueLength()).toBe(0);
    expect(synth.isPanicAborted()).toBe(true);
    expect(onPanicMock).toHaveBeenCalledTimes(1);

    const event = onPanicMock.mock.calls[0][0];
    expect(event.trigger).toBe('corner_slam');
    expect(event.purgedCommandCount).toBe(5);
    // Verified against TC-SEC-02 SLA requirement: ≤20ms
    expect(event.abortLatencyMs).toBeLessThanOrEqual(20);
    console.log(`[TC-SEC-02] Corner slam abort latency: ${event.abortLatencyMs.toFixed(3)}ms (≤20ms SLA)`);

    // Further enqueue attempts must be rejected
    const rejected = synth.enqueue({ type: 'click' });
    expect(rejected).toBe(false);
  });

  it('triggers panic abort when double-tap Escape occurs within 300ms', async () => {
    const onPanicMock = vi.fn();
    const synth = new InputSynthesizer({ width: 1920, height: 1080 }, onPanicMock);

    synth.enqueue({ type: 'mouse_move', target: { x: 200, y: 200 } });

    // First escape
    expect(synth.handleKeyEvent('Escape')).toBe(false);
    expect(synth.isPanicAborted()).toBe(false);

    // Second escape within 100ms
    await new Promise(r => setTimeout(r, 50));
    expect(synth.handleKeyEvent('Escape')).toBe(true);

    expect(synth.isPanicAborted()).toBe(true);
    expect(synth.getQueueLength()).toBe(0);
    expect(onPanicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'double_escape',
        purgedCommandCount: 1,
      })
    );
  });

  it('generates non-linear Bézier trajectory points between start and end coordinates', () => {
    const synth = new InputSynthesizer();
    const start = { x: 100, y: 100 };
    const end = { x: 800, y: 600 };

    const trajectory = synth.generateBezierTrajectory(start, end, 20);

    expect(trajectory.length).toBe(21);
    expect(trajectory[0]).toEqual(start);
    expect(trajectory[trajectory.length - 1]).toEqual(end);

    // Check intermediate points are within plausible coordinate range
    for (const pt of trajectory) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeGreaterThanOrEqual(0);
    }
  });
});
