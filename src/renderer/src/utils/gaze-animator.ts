/**
 * Live2D gaze animator.
 *
 * Two modes:
 *   LLM mode  — setGazeTarget(x, y) drives gaze to a specific position quickly
 *               (called by use-audio-task when LLM outputs [look_*] tags).
 *   Idle mode — when the AI is not responding, the gaze wanders gently around
 *               to avoid the "dead stare" look. Picks random targets within a
 *               configurable range and transitions slowly between them.
 *
 * Both modes share the same lerp loop; the active lerp speed differs.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IdleGazeConfig {
  enabled: boolean;
  range_x: number;      // max horizontal range (0–1, maps to onDrag x units)
  range_y: number;      // max vertical range
  transition_speed: number; // lerp decay rate per second (smaller = slower)
  interval_min: number; // seconds at each target
  interval_max: number;
}

// ── Shared lerp state ─────────────────────────────────────────────────────────

interface GazeState {
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  lerpSpeed: number;   // current active speed (fast for LLM, slow for idle)
  rafId: number | null;
  lastTime: number;
}

const LLM_LERP_SPEED  = 2.0;  // units/sec — snappy for explicit LLM gaze
const RESET_LERP_SPEED = 1.5; // units/sec — medium for returning to center
const EPSILON = 0.005;

const state: GazeState = {
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
  lerpSpeed: LLM_LERP_SPEED,
  rafId: null,
  lastTime: 0,
};

// ── Idle gaze state ───────────────────────────────────────────────────────────

interface IdleState {
  active: boolean;        // idle mode is currently running
  rangeX: number;
  rangeY: number;
  speed: number;
  intervalMin: number;
  intervalMax: number;
  nextPickAt: number;     // performance.now() ms timestamp
  timerId: ReturnType<typeof setTimeout> | null;
}

const idleState: IdleState = {
  active: false,
  rangeX: 0.3,
  rangeY: 0.2,
  speed: 0.8,
  intervalMin: 2,
  intervalMax: 5,
  nextPickAt: 0,
  timerId: null,
};

// ── Core lerp loop ────────────────────────────────────────────────────────────

function tick(now: number) {
  const dt = Math.min((now - state.lastTime) / 1000, 0.1);
  state.lastTime = now;

  // In idle mode, schedule the next target pick if the timer expired
  if (idleState.active && now >= idleState.nextPickAt) {
    scheduleNextIdleTarget();
  }

  const dx = state.targetX - state.currentX;
  const dy = state.targetY - state.currentY;

  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    state.currentX = state.targetX;
    state.currentY = state.targetY;
    applyGaze(state.currentX, state.currentY);
    state.rafId = null;
    return;
  }

  const alpha = Math.min(state.lerpSpeed * dt, 1);
  state.currentX += dx * alpha;
  state.currentY += dy * alpha;
  applyGaze(state.currentX, state.currentY);

  state.rafId = requestAnimationFrame(tick);
}

function applyGaze(x: number, y: number) {
  const mgr = (window as any).getLive2DManager?.();
  mgr?.onDrag(x, y);
}

function ensureLoop() {
  if (state.rafId === null) {
    state.lastTime = performance.now();
    state.rafId = requestAnimationFrame(tick);
  }
}

// ── Idle target picker ────────────────────────────────────────────────────────

function scheduleNextIdleTarget() {
  if (!idleState.active) return;

  // 25 % chance to look at center for a natural "reset" feel
  const lookCenter = Math.random() < 0.25;
  const tx = lookCenter ? 0 : (Math.random() * 2 - 1) * idleState.rangeX;
  const ty = lookCenter ? 0 : (Math.random() * 2 - 1) * idleState.rangeY;

  state.targetX = tx;
  state.targetY = ty;
  state.lerpSpeed = idleState.speed;

  const interval =
    idleState.intervalMin +
    Math.random() * (idleState.intervalMax - idleState.intervalMin);
  idleState.nextPickAt = performance.now() + interval * 1000;

  ensureLoop();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Animate gaze to (x, y) at full LLM speed (called by LLM [look_*] tags).
 * Delays the next idle pick by at least intervalMin so the LLM target holds
 * long enough to be visible before idle wandering resumes.
 */
export function setGazeTarget(x: number, y: number) {
  state.targetX = x;
  state.targetY = y;
  state.lerpSpeed = LLM_LERP_SPEED;
  // Give the LLM gaze time to be visible before idle picks a new target
  idleState.nextPickAt = performance.now() + idleState.intervalMin * 1000;
  ensureLoop();
}

/** Smoothly return to center gaze (0, 0), then idle wandering resumes shortly. */
export function resetGazeToCenter() {
  state.targetX = 0;
  state.targetY = 0;
  state.lerpSpeed = RESET_LERP_SPEED;
  // Let idle pick a new target soon after returning to center
  idleState.nextPickAt = performance.now() + 1000;
  ensureLoop();
}

/**
 * Start idle gaze wandering.
 * Call when AI enters idle state (not thinking/speaking/listening).
 */
export function enableIdleGaze() {
  if (!idleState.active) {
    idleState.active = true;
    idleState.nextPickAt = 0; // pick immediately on next tick
    ensureLoop();
  }
}

/**
 * Stop idle gaze wandering.
 * Call when AI leaves idle state (starts thinking/speaking/listening/etc.).
 */
export function disableIdleGaze() {
  idleState.active = false;
  if (idleState.timerId !== null) {
    clearTimeout(idleState.timerId);
    idleState.timerId = null;
  }
}

/**
 * Apply idle gaze configuration received from the backend.
 * Does not start or stop the idle loop — call enable/disableIdleGaze separately.
 */
export function configureIdleGaze(config: IdleGazeConfig) {
  idleState.rangeX = config.range_x;
  idleState.rangeY = config.range_y;
  idleState.speed = config.transition_speed;
  idleState.intervalMin = config.interval_min;
  idleState.intervalMax = config.interval_max;

  if (!config.enabled && idleState.active) {
    disableIdleGaze();
  }
}
