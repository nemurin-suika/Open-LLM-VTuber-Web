/**
 * Smoothly animates the Live2D model's body position and scale.
 *
 * Position uses the model matrix translation (matrix[12], matrix[13]).
 * Scale calls applyScale() which overwrites matrix[0] / matrix[5].
 */

import { wsService } from '@/services/websocket-service';

const MOVE_SPEED  = 1.2;  // NDC units / second
const SCALE_SPEED = 1.5;  // scale units / second
const EPSILON     = 0.003;

interface State {
  curX: number; curY: number;
  targetX: number; targetY: number;
  curScale: number; targetScale: number;
  baseScale: number;   // reference kScale (modelInfo.kScale from SDK)
  rafId: number | null;
  lastTime: number;
}

const state: State = {
  curX: 0, curY: 0,
  targetX: 0, targetY: 0,
  curScale: 1, targetScale: 1,
  baseScale: 1,
  rafId: null,
  lastTime: 0,
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(t, 1);
}

function applyToModel(x: number, y: number, scale: number) {
  const adapter = (window as any).getLAppAdapter?.();
  if (!adapter) return;
  const model = adapter.getModel();
  if (!model?._modelMatrix) return;

  // Position
  const matrix = model._modelMatrix.getArray();
  const newMatrix = [...matrix];
  newMatrix[12] = x;
  newMatrix[13] = y;
  model._modelMatrix.setMatrix(newMatrix);

  // Scale (overwrites matrix[0] and matrix[5])
  model._modelMatrix.scale(scale, scale);
}

function sendPosition(x: number, y: number, scale: number) {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const projXScale = canvas.height / canvas.width;
  const viewportX = rect.left + (x * projXScale + 1) / 2 * rect.width;
  const viewportY = rect.top  + (1 - y)              / 2 * rect.height;
  const normX = viewportX / window.innerWidth;
  const normY = viewportY / window.innerHeight;
  const normHeight = rect.height / window.screen.height;
  wsService.sendMessage({ type: 'vtuber-screen-position', x: normX, y: normY, height: normHeight });
}

function tick(now: number) {
  const dt = Math.min((now - state.lastTime) / 1000, 0.1);
  state.lastTime = now;

  const dx = state.targetX - state.curX;
  const dy = state.targetY - state.curY;
  const ds = state.targetScale - state.curScale;

  const moved = Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON;
  const scaled = Math.abs(ds) > EPSILON;

  if (!moved && !scaled) {
    state.curX = state.targetX;
    state.curY = state.targetY;
    state.curScale = state.targetScale;
    applyToModel(state.curX, state.curY, state.curScale);
    sendPosition(state.curX, state.curY, state.curScale);
    state.rafId = null;
    return;
  }

  state.curX     = lerp(state.curX,     state.targetX,     MOVE_SPEED  * dt);
  state.curY     = lerp(state.curY,     state.targetY,     MOVE_SPEED  * dt);
  state.curScale = lerp(state.curScale, state.targetScale, SCALE_SPEED * dt);

  applyToModel(state.curX, state.curY, state.curScale);

  state.rafId = requestAnimationFrame(tick);
}

/** Read the actual NDC position from the model matrix. */
function readModelPosition(): { x: number; y: number } | null {
  const adapter = (window as any).getLAppAdapter?.();
  const model = adapter?.getModel();
  if (model?._modelMatrix) {
    const m = model._modelMatrix.getArray();
    return { x: m[12], y: m[13] };
  }
  return null;
}

/**
 * Sync cur/target from the actual model matrix when the animation is idle.
 * Called before any new movement so we never start from a stale (0, 0) state.
 */
function syncIfIdle() {
  if (state.rafId !== null) return; // animation running → target already valid
  const pos = readModelPosition();
  if (pos) {
    state.curX    = pos.x;
    state.curY    = pos.y;
    state.targetX = pos.x;
    state.targetY = pos.y;
  }
}

function ensureRunning() {
  if (state.rafId === null) {
    state.lastTime = performance.now();
    state.rafId = requestAnimationFrame(tick);
  }
}

/** Set the model's position target (NDC coordinates, absolute). */
export function setMovementTarget(x: number, y: number) {
  syncIfIdle(); // sync curX/curY for a smooth animation start
  state.targetX = x;
  state.targetY = y;
  ensureRunning();
}

/** Add a relative delta to the current position target. */
export function addMovementDelta(dx: number, dy: number) {
  syncIfIdle(); // ensure targetX/targetY reflect the actual current position
  state.targetX += dx;
  state.targetY += dy;
  ensureRunning();
}

/** Set the model's scale target as a multiplier of baseScale. */
export function setScaleTarget(multiplier: number) {
  state.targetScale = state.baseScale * multiplier;
  ensureRunning();
}

/** Update the reference scale when the model loads. */
export function setBaseScale(kScale: number) {
  state.baseScale  = kScale;
  state.curScale   = kScale;
  state.targetScale = kScale;
}

/**
 * Explicitly sync the animator state with known NDC coordinates.
 * Mainly used during model initialization; syncIfIdle() handles runtime cases.
 */
export function syncCurrentPosition(x: number, y: number) {
  state.curX    = x;
  state.curY    = y;
  state.targetX = x;
  state.targetY = y;
}

/** Reset model to center + original scale (for the reset button). */
export function resetModelToCenter() {
  state.targetX     = 0;
  state.targetY     = 0;
  state.targetScale = state.baseScale;
  ensureRunning();
}
