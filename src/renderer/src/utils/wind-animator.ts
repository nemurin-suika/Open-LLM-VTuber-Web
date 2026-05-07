/**
 * Wind effect animator for Live2D physics.
 *
 * Sets the Cubism physics wind vector (physics.getOption().wind.x) each frame
 * so that hair, cloth, and other physics-driven parts flutter naturally.
 * The body and face parameters are unaffected.
 *
 * Exposed on window.getWindValue() so lappmodel.ts (inside WebSDK) can
 * read the current value without importing this module directly.
 *
 * Scale reference: Cubism physics gravity defaults to y = -1.0.
 * With AirResistance = 5.0 the effect is heavily damped, so large values
 * are needed for visible movement.
 * MAX_WIND_FORCE = 10.0 → max_strength=1.0 gives wind = ±10 (10× gravity).
 * In practice 0.2–0.5 in conf.yaml gives gentle to moderate sway.
 */

const MAX_WIND_FORCE = 10.0;

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
  maxForce: number;
  transitionSpeed: number;
  intervalMin: number;
  intervalMax: number;
  nextChangeAt: number;
  rafId: number | null;
  lastTime: number;
}

const state: WindState = {
  enabled: false,
  current: 0,
  target: 0,
  maxForce: MAX_WIND_FORCE * 0.5,
  transitionSpeed: 1.5,
  intervalMin: 3,
  intervalMax: 8,
  nextChangeAt: 0,
  rafId: null,
  lastTime: 0,
};

function pickNewTarget(): void {
  const direction = Math.random() < 0.5 ? -1 : 1;
  const strength = (0.4 + Math.random() * 0.6) * state.maxForce;
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

export function getWindValue(): number {
  return state.enabled ? state.current : 0;
}

export function configureWind(config: WindConfig): void {
  state.enabled = config.enabled;
  state.maxForce = config.max_strength * MAX_WIND_FORCE;
  state.transitionSpeed = config.transition_speed;
  state.intervalMin = config.interval_min;
  state.intervalMax = config.interval_max;

  console.log('[wind] configureWind called:', config, '→ maxForce:', state.maxForce);

  if (state.enabled) {
    startLoop();
  } else {
    state.current = 0;
    state.target = 0;
  }
}

if (typeof window !== 'undefined') {
  (window as any).getWindValue = getWindValue;
}
