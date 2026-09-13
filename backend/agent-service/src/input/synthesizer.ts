import { Point } from '../math/aabb.js';

export interface ScreenBounds {
  width: number;
  height: number;
}

export interface InputCommand {
  id: string;
  type: 'mouse_move' | 'click' | 'type' | 'hotkey';
  target?: Point;
  text?: string;
  keys?: string;
  timestamp: number;
}

export interface PanicAbortEvent {
  trigger: 'corner_slam' | 'double_escape';
  timestamp: number;
  cursorPosition?: Point;
  purgedCommandCount: number;
  abortLatencyMs: number;
}

export class InputSynthesizer {
  private screenBounds: ScreenBounds;
  private inputQueue: InputCommand[] = [];
  private isAborted = false;
  private lastEscapeTimestamp = 0;
  private onPanicCallback?: (event: PanicAbortEvent) => void;

  constructor(
    screenBounds: ScreenBounds = { width: 1920, height: 1080 },
    onPanicCallback?: (event: PanicAbortEvent) => void
  ) {
    this.screenBounds = screenBounds;
    this.onPanicCallback = onPanicCallback;
  }

  /**
   * Generates a cubic Bézier trajectory with randomized micro-velocity jitter
   * between start and end points to simulate human cursor dynamics.
   */
  public generateBezierTrajectory(
    start: Point,
    end: Point,
    steps = 25
  ): Point[] {
    const trajectory: Point[] = [];
    if (steps <= 0) return [end];

    // Compute randomized control points perpendicular to the chord
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);

    const normalX = -dy / (dist || 1);
    const normalY = dx / (dist || 1);

    // Random deflection between -15% and +15% of distance
    const deflection1 = (Math.random() - 0.5) * 0.3 * dist;
    const deflection2 = (Math.random() - 0.5) * 0.3 * dist;

    const p0 = start;
    const p1: Point = {
      x: start.x + dx * 0.25 + normalX * deflection1,
      y: start.y + dy * 0.25 + normalY * deflection1,
    };
    const p2: Point = {
      x: start.x + dx * 0.75 + normalX * deflection2,
      y: start.y + dy * 0.75 + normalY * deflection2,
    };
    const p3 = end;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Ease in-out cubic pacing
      const easedT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const u = 1 - easedT;
      const tt = easedT * easedT;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * easedT;

      const x = uuu * p0.x + 3 * uu * easedT * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
      const y = uuu * p0.y + 3 * uu * easedT * p1.y + 3 * u * tt * p2.y + ttt * p3.y;

      trajectory.push({
        x: Math.round(x),
        y: Math.round(y),
      });
    }

    return trajectory;
  }

  /**
   * Enqueues an input action to be dispatched.
   */
  public enqueue(command: Omit<InputCommand, 'id' | 'timestamp'>): boolean {
    if (this.isAborted) {
      return false;
    }

    this.inputQueue.push({
      ...command,
      id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    });
    return true;
  }

  /**
   * Checks cursor position for corner slam panic trigger (≤5px of screen corners).
   * Returns true if corner slam panic was triggered.
   */
  public checkCornerSlam(cursor: Point): boolean {
    const start = performance.now();
    const threshold = 5; // within 5px of any screen corner

    const isTopLeft = cursor.x <= threshold && cursor.y <= threshold;
    const isTopRight = cursor.x >= this.screenBounds.width - threshold && cursor.y <= threshold;
    const isBottomLeft = cursor.x <= threshold && cursor.y >= this.screenBounds.height - threshold;
    const isBottomRight =
      cursor.x >= this.screenBounds.width - threshold &&
      cursor.y >= this.screenBounds.height - threshold;

    if (isTopLeft || isTopRight || isBottomLeft || isBottomRight) {
      this.triggerPanic('corner_slam', cursor, start);
      return true;
    }

    return false;
  }

  /**
   * Evaluates keypress for double-tap Escape abort (<300ms window).
   */
  public handleKeyEvent(key: string): boolean {
    if (key.toLowerCase() === 'escape') {
      const now = performance.now();
      if (this.lastEscapeTimestamp > 0 && now - this.lastEscapeTimestamp < 300) {
        this.triggerPanic('double_escape', undefined, now);
        this.lastEscapeTimestamp = 0;
        return true;
      }
      this.lastEscapeTimestamp = now;
    }
    return false;
  }

  /**
   * TC-SEC-02: Panic Kill-Switch — Immediately halts execution (≤20ms SLA)
   * and purges all queued synthetic inputs.
   */
  public triggerPanic(
    trigger: 'corner_slam' | 'double_escape',
    cursorPosition?: Point,
    triggerStartTime?: number
  ): PanicAbortEvent {
    const startTime = triggerStartTime ?? performance.now();
    this.isAborted = true;

    const count = this.inputQueue.length;
    // Purge queue immediately
    this.inputQueue = [];

    const latency = performance.now() - startTime;
    const event: PanicAbortEvent = {
      trigger,
      timestamp: Date.now(),
      cursorPosition,
      purgedCommandCount: count,
      abortLatencyMs: latency,
    };

    if (this.onPanicCallback) {
      this.onPanicCallback(event);
    }

    return event;
  }

  public reset(): void {
    this.isAborted = false;
    this.inputQueue = [];
    this.lastEscapeTimestamp = 0;
  }

  public getQueueLength(): number {
    return this.inputQueue.length;
  }

  public isPanicAborted(): boolean {
    return this.isAborted;
  }
}
