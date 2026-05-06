/**
 * Wind effect animator for Live2D physics.
 *
 * Produces a smoothly varying angle offset that is read by lappmodel.ts
 * and added to ParamAngleX before the physics step. The physics chains
 * (hair, skirt, ribbon, etc.) then react as if blown by wind — the body
 * itself is not moved.
 *
 * Exposed on window.getWindValue() so lappmodel.ts (inside WebSDK) can
 * read the current value without importing this module directly.
 *
 * The angle is in the same unit as the drag offsets in lappmodel.ts
 * (dragX * 30 → ±30 units). max_strength=1.0 maps to 30 units.
 */

const MAX_ANGLE_UNITS = 30; // matches the drag scale in lappmodel.ts

export interface WindConfig {
  enabled: boolean;
  max_strength: number;     // 0.0–1.0
  transition_speed: number; // lerp decay rate per second
  interval_min: number;     // seconds between direction changes
  interval_max: number;
}

interface WindState {
  enabled: boolean;
  current: number;
  target: number;
  maxAngle: number;
  transitionSpeed: number;
  intervalMin: number;
  intervalMax: number;
  nextChangeAt: number; // performance.now() timestamp (ms)
  rafId: number | null;
  lastTime: number;
}

const state: WindState = {
  enabled: false,
  current: 0,
  target: 0,
  maxAngle: MAX_ANGLE_UNITS * 0.5,
  transitionSpeed: 0.5,
  intervalMin: 3,
  intervalMax: 8,
  nextChangeAt: 0,
  rafId: null,
  lastTime: 0,
};

function pickNewTarget(): void {
  const direction = Math.random() < 0.5 ? -1 : 1;
  // Vary strength 30–100 % of max so it doesn't always feel the same
  const strength = (0.3 + Math.random() * 0.7) * state.maxAngle;
  state.target = direction * strength;

  const interval =
    state.intervalMin +
    Math.random() * (state.intervalMax - state.intervalMin);
  state.nextChangeAt = performance.now() + interval * 1000;
}

function tick(now: number): void {
  if (!state.enabled) {
    state.current = 0;
    state.rafId = null;
    return;
  }

  const dt = Math.min((now - state.lastTime) / 1000, 0.1);
  state.lastTime = now;

  if (now >= state.nextChangeAt) {
    pickNewTarget();
  }

  // Exponential lerp — feels more natural than linear
  const alpha = Math.min(state.transitionSpeed * dt, 1);
  state.current += (state.target - state.current) * alpha;

  state.rafId = requestAnimationFrame(tick);
}

function startLoop(): void {
  if (state.rafId !== null) return;
  state.lastTime = performance.now();
  pickNewTarget();
  state.rafId = requestAnimationFrame(tick);
}

/** Current wind angle offset in Live2D units. Called every frame by lappmodel. */
export function getWindValue(): number {
  return state.enabled ? state.current : 0;
}

/** Apply (or update) wind configuration received from the backend. */
export function configureWind(config: WindConfig): void {
  state.enabled = config.enabled;
  state.maxAngle = config.max_strength * MAX_ANGLE_UNITS;
  state.transitionSpeed = config.transition_speed;
  state.intervalMin = config.interval_min;
  state.intervalMax = config.interval_max;

  if (state.enabled) {
    startLoop();
  } else {
    state.current = 0;
    state.target = 0;
  }
}

// Expose on window so lappmodel.ts (WebSDK, separate module graph) can read it
if (typeof window !== 'undefined') {
  (window as any).getWindValue = getWindValue;
}
