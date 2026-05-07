/* eslint-disable func-names */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiState } from '@/context/ai-state-context';
import { useSubtitle } from '@/context/subtitle-context';
import { useChatHistory } from '@/context/chat-history-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { audioManager } from '@/utils/audio-manager';
import { toaster } from '@/components/ui/toaster';
import { useWebSocket } from '@/context/websocket-context';
import { DisplayText } from '@/services/websocket-service';
import { useLive2DExpression } from '@/hooks/canvas/use-live2d-expression';
import { stripLLMTags } from '@/utils/text-filter';
import { setGazeTarget, resetGazeToCenter } from '@/utils/gaze-animator';
import { setMovementTarget, addMovementDelta, setScaleTarget } from '@/utils/model-movement-animator';
import * as LAppDefine from '../../../WebSDK/src/lappdefine';

// Simple type alias for Live2D model
type Live2DModel = any;

interface AudioTaskOptions {
  audioBase64: string
  volumes: number[]
  sliceLength: number
  displayText?: DisplayText | null
  expressions?: string[] | number[] | null
  gaze?: { x: number; y: number } | null
  movement?: { x: number; y: number } | null
  model_scale?: number | null
  volume_adjustment?: number | null
  speaker_uid?: string
  forwarded?: boolean
}

/**
 * Custom hook for handling audio playback tasks with Live2D lip sync
 */
export const useAudioTask = () => {
  const { t } = useTranslation();
  const { aiState, backendSynthComplete, setBackendSynthComplete } = useAiState();
  const { setSubtitleText } = useSubtitle();
  const { appendResponse, appendAIMessage } = useChatHistory();
  const { sendMessage } = useWebSocket();
  const { setExpression } = useLive2DExpression();

  // State refs to avoid stale closures
  const stateRef = useRef({
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  });

  // Note: currentAudioRef and currentModelRef are now managed by the global audioManager

  stateRef.current = {
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  };

  /**
   * Stop current audio playback and lip sync (delegates to global audioManager)
   */
  const stopCurrentAudioAndLipSync = useCallback(() => {
    audioManager.stopCurrentAudioAndLipSync();
  }, []);

  /**
   * Handle audio playback with Live2D lip sync
   */
  const handleAudioPlayback = (options: AudioTaskOptions): Promise<void> => new Promise((resolve) => {
    const {
      aiState: currentAiState,
      setSubtitleText: updateSubtitle,
      appendResponse: appendText,
      appendAIMessage: appendAI,
    } = stateRef.current;

    const label = `"${options.displayText?.text ?? '(no text)'}"`;
    console.log(`[AudioTask] handleAudioPlayback start — ${label}, aiState="${currentAiState}", hasAudio=${!!options.audioBase64}`);

    // Skip if already interrupted
    if (currentAiState === 'interrupted') {
      console.warn(`[AudioTask] Blocked by interruption — ${label}`);
      resolve();
      return;
    }

    const { audioBase64, displayText, expressions, gaze, movement, model_scale, volume_adjustment, forwarded } = options;

    // Apply cumulative volume adjustment before playback
    if (volume_adjustment != null) {
      const before = audioManager.getEffectiveVolume();
      audioManager.applyVolumeAdjustment(volume_adjustment);
      const after = audioManager.getEffectiveVolume();
      console.log(`[VolumeCtrl] adjustment=${volume_adjustment > 0 ? '+' : ''}${volume_adjustment}, ${(before*100).toFixed(0)}% → ${(after*100).toFixed(0)}%`);
    }

    // Update display text (strip LLM control tags before showing)
    if (displayText) {
      const cleanText = stripLLMTags(displayText.text);
      appendText(cleanText);
      appendAI(cleanText, displayText.name, displayText.avatar);
      if (audioBase64) {
        updateSubtitle(cleanText);
      }
      if (!forwarded) {
        sendMessage({
          type: "audio-play-start",
          display_text: displayText,
          forwarded: true,
        });
      }
    }

    try {
      // Apply Live2D actions regardless of whether audio is present.
      // (Tag-only sentences produce no audio but still carry valid actions.)
      {
        const lappAdapter = (window as any).getLAppAdapter?.();
        if (lappAdapter && expressions?.[0] !== undefined) {
          setExpression(expressions[0], lappAdapter, `Set expression to: ${expressions[0]}`);
        }
        if (gaze) setGazeTarget(gaze.x, gaze.y);
        if (movement) {
          if ('dx' in movement) {
            addMovementDelta(movement.dx, movement.dy);  // relative delta
          } else {
            setMovementTarget(movement.x, movement.y);   // absolute (move_center)
          }
        }
        if (model_scale != null) setScaleTarget(model_scale);
      }

      // Process audio if available
      if (audioBase64) {
        const audioDataUrl = `data:audio/wav;base64,${audioBase64}`;

        // Get Live2D manager and model
        const live2dManager = (window as any).getLive2DManager?.();
        if (!live2dManager) {
          console.error(`[AudioTask] Live2D manager not found — ${label}`);
          resolve();
          return;
        }

        const model = live2dManager.getModel(0);
        if (!model) {
          console.error(`[AudioTask] Live2D model not found at index 0 — ${label}`);
          resolve();
          return;
        }

        if (!model._wavFileHandler) {
          console.warn(`[AudioTask] Model has no _wavFileHandler (lip sync disabled) — ${label}`);
        }

        // Start talk motion
        if (LAppDefine && LAppDefine.PriorityNormal) {
          model.startRandomMotion("Talk", LAppDefine.PriorityNormal);
        } else {
          console.warn('[AudioTask] LAppDefine.PriorityNormal not found — cannot start talk motion');
        }

        // Setup audio element
        const audio = new Audio(audioDataUrl);

        // Register with global audio manager IMMEDIATELY after creating audio
        audioManager.setCurrentAudio(audio, model);
        let isFinished = false;

        const cleanup = (reason: string) => {
          console.log(`[AudioTask] cleanup(${reason}) — ${label}`);
          audioManager.clearCurrentAudio(audio);
          if (!isFinished) {
            isFinished = true;
            resolve();
          }
        };

        // Timeout guard: if canplay never fires, unblock the queue
        const canplayTimeout = setTimeout(() => {
          if (!isFinished) {
            console.error(`[AudioTask] canplay timed out after 10s — ${label}. Skipping.`);
            cleanup('canplay-timeout');
          }
        }, 10000);

        // Enhance lip sync sensitivity
        const lipSyncScale = 2.0;

        audio.addEventListener('canplay', () => {
          clearTimeout(canplayTimeout);
          // Check for interruption before playback
          if (stateRef.current.aiState === 'interrupted' || !audioManager.hasCurrentAudio()) {
            console.warn(`[AudioTask] Cancelled before play (interrupted or stopped) — ${label}`);
            cleanup('pre-play-cancelled');
            return;
          }

          console.log(`[AudioTask] canplay — starting play — ${label}`);
          audio.play().then(() => {
            console.log(`[AudioTask] play() resolved — ${label}`);
          }).catch((err) => {
            console.error(`[AudioTask] play() rejected — ${label}`, err);
            cleanup('play-error');
          });

          // Setup lip sync
          if (model._wavFileHandler) {
            if (!model._wavFileHandler._initialized) {
              model._wavFileHandler._initialized = true;

              const originalUpdate = model._wavFileHandler.update.bind(model._wavFileHandler);
              model._wavFileHandler.update = function (deltaTimeSeconds: number) {
                const result = originalUpdate(deltaTimeSeconds);
                // @ts-ignore
                this._lastRms = Math.min(2.0, this._lastRms * lipSyncScale);
                return result;
              };
            }

            if (audioManager.hasCurrentAudio()) {
              model._wavFileHandler.start(audioDataUrl);
            } else {
              console.warn(`[AudioTask] WavFileHandler start skipped — audio was stopped — ${label}`);
            }
          }
        });

        audio.addEventListener('ended', () => {
          clearTimeout(canplayTimeout);
          console.log(`[AudioTask] ended — ${label}`);
          cleanup('ended');
        });

        audio.addEventListener('error', (error) => {
          clearTimeout(canplayTimeout);
          console.error(`[AudioTask] audio element error — ${label}`, error);
          cleanup('audio-element-error');
        });

        console.log(`[AudioTask] audio.load() called — ${label}`);
        audio.load();
      } else {
        console.log(`[AudioTask] No audio data — resolving immediately — ${label}`);
        resolve();
      }
    } catch (error) {
      console.error(`[AudioTask] Setup error — ${label}:`, error);
      toaster.create({
        title: `${t('error.audioPlayback')}: ${error}`,
        type: "error",
        duration: 2000,
      });
      resolve();
    }
  });

  // Keep stable refs to avoid re-triggering the effect when these functions change identity
  const sendMessageRef = useRef(sendMessage);
  const stopCurrentAudioAndLipSyncRef = useRef(stopCurrentAudioAndLipSync);
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  useEffect(() => { stopCurrentAudioAndLipSyncRef.current = stopCurrentAudioAndLipSync; }, [stopCurrentAudioAndLipSync]);

  // Handle backend synthesis completion
  // Only depend on backendSynthComplete so this fires exactly once per true→false cycle.
  // Using refs for sendMessage/stop prevents re-firing when those change identity mid-cycle.
  useEffect(() => {
    if (!backendSynthComplete) return;

    let cancelled = false;

    (async () => {
      await audioTaskQueue.waitForCompletion();
      if (!cancelled) {
        console.log('[AudioTask] backend-synth-complete: sending frontend-playback-complete');
        stopCurrentAudioAndLipSyncRef.current();
        sendMessageRef.current({ type: "frontend-playback-complete" });
        setBackendSynthComplete(false);
      }
    })();

    return () => { cancelled = true; };
  }, [backendSynthComplete, setBackendSynthComplete]);

  /**
   * Add a new audio task to the queue
   */
  const addAudioTask = async (options: AudioTaskOptions) => {
    const { aiState: currentState } = stateRef.current;

    if (currentState === 'interrupted') {
      console.warn(`[AudioTask] Skipping — aiState="interrupted", text="${options.displayText?.text ?? ''}"`);
      return;
    }

    console.log(`[AudioTask] Enqueuing — aiState="${currentState}", text="${options.displayText?.text ?? ''}", hasAudio=${!!options.audioBase64}`);
    audioTaskQueue.addTask(() => handleAudioPlayback(options));
  };

  return {
    addAudioTask,
    appendResponse,
    stopCurrentAudioAndLipSync,
  };
};
