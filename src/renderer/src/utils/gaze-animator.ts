/**
 * Live2D gaze animator — two independent systems:
 *
 * LLM gaze  (setGazeTarget / resetGazeToCenter)
 *   Uses onDrag() so head, body, and eyes all move together.
 *   Triggered by [look_*] tags in LLM output.
 *
 * Idle gaze  (enableIdleGaze / disableIdleGaze / configureIdleGaze)
 *   Wanders ParamAngleX/Y directly for a natural "looking around" feel.
 *   lappmodel.ts reads window.getIdleGazeXY() every frame and adds the
 *   values to AngleX/Y before the physics step.
 *   Active in all states except loading.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IdleGazeConfig {
  enabled: boolean;
  range_x: number;      // 0–1, maps to ±(range_x * 30) AngleX units
  range_y: number;      // 0–1, maps to ±(range_y * 30) AngleY units
  transition_speed: number;
  interval_min: number;
  interval_max: number;
}

// ── LLM gaze (onDrag-based) ───────────────────────────────────────────────────

const LLM_LERP_SPEED   = 2.0;
const RESET_LERP_SPEED = 1.5;
const EPSILON = 0.005;

interface LLMGazeState {
  currentX: number; currentY: number;
  targetX: number;  targetY: number;
  lerpSpeed: number;
  rafId: number | null;
  lastTime: number;
}

const llmState: LLMGazeState = {
  currentX: 0, currentY: 0,
  targetX: 0,  targetY: 0,
  lerpSpeed: LLM_LERP_SPEED,
  rafId: null, lastTime: 0,
};

function applyLLMGaze(x: number, y: number) {
  const mgr = (window as any).getLive2DManager?.();
  mgr?.onDrag(x, y);
}

function llmTick(now: number) {
  const dt = Math.min((now - llmState.lastTime) / 1000, 0.1);
  llmState.lastTime = now;

  const dx = llmState.targetX - llmState.currentX;
  const dy = llmState.targetY - llmState.currentY;

  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    llmState.currentX = llmState.targetX;
    llmState.currentY = llmState.targetY;
    applyLLMGaze(llmState.currentX, llmState.currentY);
    llmState.rafId = null;
    return;
  }

  const alpha = Math.min(llmState.lerpSpeed * dt, 1);
  llmState.currentX += dx * alpha;
  llmState.currentY += dy * alpha;
  applyLLMGaze(llmState.currentX, llmState.currentY);
  llmState.rafId = requestAnimationFrame(llmTick);
}

function ensureLLMLoop() {
  if (llmState.rafId === null) {
    llmState.lastTime = performance.now();
    llmState.rafId = requestAnimationFrame(llmTick);
  }
}

export function setGazeTarget(x: number, y: number) {
  llmState.targetX = x;
  llmState.targetY = y;
  llmState.lerpSpeed = LLM_LERP_SPEED;
  // Give the LLM gaze time to be seen before idle picks a new target
  idleState.nextPickAt = performance.now() + idleState.intervalMin * 1000;
  ensureLLMLoop();
}

export function resetGazeToCenter() {
  llmState.targetX = 0;
  llmState.targetY = 0;
  llmState.lerpSpeed = RESET_LERP_SPEED;
  // Resume idle wandering shortly after returning to center
  idleState.nextPickAt = performance.now() + 1000;
  ensureLLMLoop();
}

// ── Idle gaze (direct AngleX/Y) ───────────────────────────────────────────────

interface IdleGazeState {
  active: boolean;
  currentX: number; currentY: number;
  targetX: number;  targetY: number;
  rangeX: number;   // 0–1
  rangeY: number;
  speed: number;
  intervalMin: number;
  intervalMax: number;
  nextPickAt: number;
  rafId: number | null;
  lastTime: number;
}

const ANGLE_SCALE = 30; // matches dragX * 30 in lappmodel.ts

const idleState: IdleGazeState = {
  active: false,
  currentX: 0, currentY: 0,
  targetX: 0,  targetY: 0,
  rangeX: 0.7, rangeY: 0.6,
  speed: 0.5,
  intervalMin: 3, intervalMax: 8,
  nextPickAt: 0,
  rafId: null, lastTime: 0,
};

function pickIdleTarget() {
  const lookCenter = Math.random() < 0.2;
  idleState.targetX = lookCenter ? 0 : (Math.random() * 2 - 1) * idleState.rangeX;
  idleState.targetY = lookCenter ? 0 : (Math.random() * 2 - 1) * idleState.rangeY;

  const interval =
    idleState.intervalMin +
    Math.random() * (idleState.intervalMax - idleState.intervalMin);
  idleState.nextPickAt = performance.now() + interval * 1000;
}

function idleTick(now: number) {
  if (!idleState.active) {
    idleState.currentX = 0;
    idleState.currentY = 0;
    idleState.rafId = null;
    return;
  }

  const dt = Math.min((now - idleState.lastTime) / 1000, 0.1);
  idleState.lastTime = now;

  if (now >= idleState.nextPickAt) {
    pickIdleTarget();
  }

  const alpha = Math.min(idleState.speed * dt, 1);
  idleState.currentX += (idleState.targetX - idleState.currentX) * alpha;
  idleState.currentY += (idleState.targetY - idleState.currentY) * alpha;

  idleState.rafId = requestAnimationFrame(idleTick);
}

function ensureIdleLoop() {
  if (idleState.rafId === null) {
    idleState.lastTime = performance.now();
    idleState.rafId = requestAnimationFrame(idleTick);
  }
}

/** Returns {x, y} in AngleX/Y units (already scaled by ANGLE_SCALE). */
export function getIdleGazeXY(): { x: number; y: number } {
  return {
    x: idleState.currentX * ANGLE_SCALE,
    y: idleState.currentY * ANGLE_SCALE,
  };
}

export function enableIdleGaze() {
  if (!idleState.active) {
    idleState.active = true;
    idleState.nextPickAt = 0;
    ensureIdleLoop();
  }
}

export function disableIdleGaze() {
  idleState.active = false;
}

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

// Expose idle gaze values for lappmodel.ts (WebSDK)
if (typeof window !== 'undefined') {
  (window as any).getIdleGazeXY = getIdleGazeXY;
}
