/**
 * Smoothly animates the Live2D model's gaze direction using onDrag().
 *
 * Uses linear interpolation toward the target at a configurable speed so the
 * head movement feels natural instead of snapping instantly.
 */

const LERP_SPEED = 2.0;   // units per second (lower = slower)
const EPSILON    = 0.005; // stop animating when this close to target

interface GazeState {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  rafId: number | null;
  lastTime: number;
}

const state: GazeState = {
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
  rafId: null,
  lastTime: 0,
};

function tick(now: number) {
  const dt = Math.min((now - state.lastTime) / 1000, 0.1); // cap at 100 ms
  state.lastTime = now;

  const dx = state.targetX - state.currentX;
  const dy = state.targetY - state.currentY;

  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    state.currentX = state.targetX;
    state.currentY = state.targetY;
    applyGaze(state.currentX, state.currentY);
    state.rafId = null;
    return;
  }

  state.currentX += dx * Math.min(LERP_SPEED * dt, 1);
  state.currentY += dy * Math.min(LERP_SPEED * dt, 1);
  applyGaze(state.currentX, state.currentY);

  state.rafId = requestAnimationFrame(tick);
}

function applyGaze(x: number, y: number) {
  const mgr = (window as any).getLive2DManager?.();
  mgr?.onDrag(x, y);
}

/** Animate gaze toward (x, y). Call repeatedly for each sentence. */
export function setGazeTarget(x: number, y: number) {
  state.targetX = x;
  state.targetY = y;
  if (state.rafId === null) {
    state.lastTime = performance.now();
    state.rafId = requestAnimationFrame(tick);
  }
}

/** Smoothly return to center gaze (0, 0). */
export function resetGazeToCenter() {
  setGazeTarget(0, 0);
}
