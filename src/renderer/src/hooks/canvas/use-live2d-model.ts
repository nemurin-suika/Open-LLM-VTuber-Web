/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-use-before-define */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-nocheck
import { useEffect, useRef, useCallback, useState, RefObject } from "react";
import { ModelInfo } from "@/context/live2d-config-context";
import { updateModelConfig } from '../../../WebSDK/src/lappdefine';
import { LAppDelegate } from '../../../WebSDK/src/lappdelegate';
import { initializeLive2D } from '@cubismsdksamples/main';
import { useMode } from '@/context/mode-context';
import { wsService } from '@/services/websocket-service';

interface UseLive2DModelProps {
  modelInfo: ModelInfo | undefined;
  canvasRef: RefObject<HTMLCanvasElement>;
}

interface Position {
  x: number;
  y: number;
}

// Thresholds for tap vs drag detection
const TAP_DURATION_THRESHOLD_MS = 200; // Max duration for a tap
const DRAG_DISTANCE_THRESHOLD_PX = 5; // Min distance to be considered a drag

function parseModelUrl(url: string): { baseUrl: string; modelDir: string; modelFileName: string } {
  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;

    const lastSlashIndex = pathname.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      throw new Error('Invalid model URL format');
    }

    const fullFileName = pathname.substring(lastSlashIndex + 1);
    const modelFileName = fullFileName.replace('.model3.json', '');

    const secondLastSlashIndex = pathname.lastIndexOf('/', lastSlashIndex - 1);
    if (secondLastSlashIndex === -1) {
      throw new Error('Invalid model URL format');
    }

    const modelDir = pathname.substring(secondLastSlashIndex + 1, lastSlashIndex);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}${pathname.substring(0, secondLastSlashIndex + 1)}`;

    return { baseUrl, modelDir, modelFileName };
  } catch (error) {
    console.error('Error parsing model URL:', error);
    return { baseUrl: '', modelDir: '', modelFileName: '' };
  }
}

export const playAudioWithLipSync = (audioPath: string, modelIndex = 0): Promise<void> => new Promise((resolve, reject) => {
  const live2dManager = window.LAppLive2DManager?.getInstance();
  if (!live2dManager) {
    reject(new Error('Live2D manager not initialized'));
    return;
  }

  const fullPath = `/Resources/${audioPath}`;
  const audio = new Audio(fullPath);

  audio.addEventListener('canplaythrough', () => {
    const model = live2dManager.getModel(modelIndex);
    if (model) {
      if (model._wavFileHandler) {
        model._wavFileHandler.start(fullPath);
        audio.play();
      } else {
        reject(new Error('Wav file handler not available on model'));
      }
    } else {
      reject(new Error(`Model index ${modelIndex} not found`));
    }
  });

  audio.addEventListener('ended', () => {
    resolve();
  });

  audio.addEventListener('error', () => {
    reject(new Error(`Failed to load audio: ${fullPath}`));
  });

  audio.load();
});

export const useLive2DModel = ({
  modelInfo,
  canvasRef,
}: UseLive2DModelProps) => {
  const { mode } = useMode();
  const isPet = mode === 'pet';
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const dragStartPos = useRef<Position>({ x: 0, y: 0 }); // Screen coordinates at drag start
  const modelStartPos = useRef<Position>({ x: 0, y: 0 }); // Model coordinates at drag start
  const modelPositionRef = useRef<Position>({ x: 0, y: 0 });
  const prevModelUrlRef = useRef<string | null>(null);
  const isHoveringModelRef = useRef(false);
  const electronApi = (window as any).electron;

  // --- State for Tap vs Drag ---
  const mouseDownTimeRef = useRef<number>(0);
  const mouseDownPosRef = useRef<Position>({ x: 0, y: 0 }); // Screen coords at mousedown
  const isPotentialTapRef = useRef<boolean>(false); // Flag for ongoing potential tap/drag action
  // ---

  useEffect(() => {
    const currentUrl = modelInfo?.url;
    const sdkScale = (window as any).LAppDefine?.CurrentKScale;
    const modelScale = modelInfo?.kScale !== undefined ? Number(modelInfo.kScale) : undefined;

    const needsUpdate = currentUrl &&
                        (currentUrl !== prevModelUrlRef.current ||
                         (sdkScale !== undefined && modelScale !== undefined && sdkScale !== modelScale));

    if (needsUpdate) {
      prevModelUrlRef.current = currentUrl;

      try {
        const { baseUrl, modelDir, modelFileName } = parseModelUrl(currentUrl);

        if (baseUrl && modelDir) {
          updateModelConfig(baseUrl, modelDir, modelFileName, Number(modelInfo.kScale));

          setTimeout(() => {
            if ((window as any).LAppLive2DManager?.releaseInstance) {
              (window as any).LAppLive2DManager.releaseInstance();
            }
            initializeLive2D();
          }, 500);
        }
      } catch (error) {
        console.error('Error processing model URL:', error);
      }
    }
  }, [modelInfo?.url, modelInfo?.kScale]);

  const getModelPosition = useCallback(() => {
    const adapter = (window as any).getLAppAdapter?.();
    if (adapter) {
      const model = adapter.getModel();
      if (model && model._modelMatrix) {
        const matrix = model._modelMatrix.getArray();
        return {
          x: matrix[12],
          y: matrix[13],
        };
      }
    }
    return { x: 0, y: 0 };
  }, []);

  // Converts model matrix NDC coordinates to normalized screen position (0-1)
  // and sends it to the backend so gaze calculation can use the real position.
  const sendScreenPosition = useCallback(() => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const adapter = (window as any).getLAppAdapter?.();
    if (!adapter) return;
    const model = adapter.getModel();
    if (!model?._modelMatrix) return;

    const matrix = model._modelMatrix.getArray();
    // matrix[12], matrix[13] are the NDC position of the model's canvas origin.
    // For models without a Layout section the origin sits at the canvas centre,
    // so these values track the visual centre of the character.
    const modelNdcX: number = matrix[12];
    const modelNdcY: number = matrix[13];

    // modelInfo.kScale is stored as (model_dict kScale * 2) by live2d-config-context.
    // Divide by 2 to get the original kScale value for screen-fraction calculations.
    const kScale: number = (modelInfo?.kScale ?? 1.0) / 2;

    const rect = canvas.getBoundingClientRect();

    // LAppLive2DManager applies projection.scale(height/width, 1.0) before rendering.
    // This aspect-ratio correction scales the X axis by h/w (≈0.5625 for 16:9),
    // so the actual rendered screen X differs from the raw NDC value.
    // Y is unaffected (projYScale = 1.0).
    const projXScale = canvas.height / canvas.width; // = h/w

    // Compute viewport-relative CSS pixel positions using the projection-corrected NDC.
    const viewportX = rect.left + (modelNdcX * projXScale + 1) / 2 * rect.width;
    const viewportY = rect.top  + (1 - modelNdcY)             / 2 * rect.height;

    // In pet mode the Electron window covers the entire virtual screen (all monitors).
    // The canvas fills window.innerWidth × window.innerHeight (virtual screen in CSS px).
    // viewportX/Y is already relative to the virtual screen top-left, so we normalise
    // directly against window.innerWidth/Height — no window.screenX/Y offset needed.
    //
    // In window mode the canvas is smaller than the screen, so we normalise against
    // window.screen.width/height (the physical screen) and add window.screenX/Y so
    // the coordinate is in absolute screen space.
    const isPetMode = window.innerWidth > window.screen.width || window.innerHeight > window.screen.height
      || window.screenX !== 0 || window.screenY !== 0;

    let normX: number;
    let normY: number;
    if (isPetMode) {
      // Virtual screen coords: viewportX/Y go from 0 to window.innerWidth/Height
      normX = viewportX / window.innerWidth;
      normY = viewportY / window.innerHeight;
    } else {
      const screenX = window.screenX + viewportX;
      const screenY = window.screenY + viewportY;
      normX = screenX / window.screen.width;
      normY = screenY / window.screen.height;
    }
    normX = Math.max(-1.0, Math.min(2.0, normX));
    normY = Math.max(-1.0, Math.min(2.0, normY));

    // normHeight is used by the backend to convert canvas-fraction eye offsets
    // (eyeTopRatio, eyeLeftRatio) into screen-fraction offsets.
    //
    // setHeight(2.0) always makes canvas_height_ndc = 2.0, so:
    //   eye_screen_offset = eyeTopRatio_canvas_offset × (rect.height / screen.height)
    //
    // In pet mode:  rect.height / screen.height = 1.0 (canvas IS the screen).
    // In window mode: < 1.0 (canvas is smaller than the screen).
    // kScale does NOT belong here — it affects visual size, not the canvas→screen mapping.
    const normHeight = Math.max(0.05, Math.min(1.5, rect.height / window.screen.height));

    wsService.sendMessage({ type: 'vtuber-screen-position', x: normX, y: normY, height: normHeight });
    console.debug('[VTuber pos debug]', {
      matrix: { m12: modelNdcX.toFixed(4), m13: modelNdcY.toFixed(4), m0: matrix[0].toFixed(4), m5: matrix[5].toFixed(4) },
      canvas: { w: canvas.width, h: canvas.height, cssW: rect.width, cssH: rect.height },
      window: { screenX: window.screenX, screenY: window.screenY, screenW: window.screen.width, screenH: window.screen.height, innerW: window.innerWidth, innerH: window.innerHeight },
      computed: { canvasPixelX: canvasPixelX.toFixed(1), canvasPixelY: canvasPixelY.toFixed(1), viewportX: viewportX.toFixed(1), viewportY: viewportY.toFixed(1) },
      result: { normX: normX.toFixed(3), normY: normY.toFixed(3), kScale },
    });
  }, [modelInfo?.kScale]);

  const setModelPosition = useCallback((x: number, y: number) => {
    const adapter = (window as any).getLAppAdapter?.();
    if (adapter) {
      const model = adapter.getModel();
      if (model && model._modelMatrix) {
        const matrix = model._modelMatrix.getArray();

        const newMatrix = [...matrix];
        newMatrix[12] = x;
        newMatrix[13] = y;

        model._modelMatrix.setMatrix(newMatrix);
        modelPositionRef.current = { x, y };
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const currentPos = getModelPosition();
      modelPositionRef.current = currentPos;
      setPosition(currentPos);
      sendScreenPosition();
    }, 500);

    return () => clearTimeout(timer);
  }, [modelInfo?.url, getModelPosition, sendScreenPosition]);

  const getCanvasScale = useCallback(() => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) return { width: 1, height: 1, scale: 1 };

    const { width } = canvas;
    const { height } = canvas;
    const scale = width / canvas.clientWidth;

    return { width, height, scale };
  }, []);

  const screenToModelPosition = useCallback((screenX: number, screenY: number) => {
    const { width, height, scale } = getCanvasScale();

    const x = ((screenX * scale) / width) * 2 - 1;
    const y = -((screenY * scale) / height) * 2 + 1;

    return { x, y };
  }, [getCanvasScale]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const adapter = (window as any).getLAppAdapter?.();
    if (!adapter || !canvasRef.current) return;

    const model = adapter.getModel();
    const view = LAppDelegate.getInstance().getView();
    if (!view || !model) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left; // Screen X relative to canvas
    const y = e.clientY - rect.top; // Screen Y relative to canvas

    // --- Check if click is on model ---
    const scale = canvas.width / canvas.clientWidth;
    const scaledX = x * scale;
    const scaledY = y * scale;
    const modelX = view._deviceToScreen.transformX(scaledX);
    const modelY = view._deviceToScreen.transformY(scaledY);

    const hitAreaName = model.anyhitTest(modelX, modelY);
    const isHitOnModel = model.isHitOnModel(modelX, modelY);
    // --- End Check ---

    if (hitAreaName !== null || isHitOnModel) {
      // Record potential tap/drag start
      mouseDownTimeRef.current = Date.now();
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }; // Use clientX/Y for distance check
      isPotentialTapRef.current = true;
      setIsDragging(false); // Ensure dragging is false initially

      // Store initial model position IF drag starts later
      if (model._modelMatrix) {
        const matrix = model._modelMatrix.getArray();
        modelStartPos.current = { x: matrix[12], y: matrix[13] };
      }
    }
  }, [canvasRef, modelInfo]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const adapter = (window as any).getLAppAdapter?.();
    const view = LAppDelegate.getInstance().getView();
    const model = adapter?.getModel();

    // --- Start Drag Logic ---
    if (isPotentialTapRef.current && adapter && view && model && canvasRef.current) {
      const timeElapsed = Date.now() - mouseDownTimeRef.current;
      const deltaX = e.clientX - mouseDownPosRef.current.x;
      const deltaY = e.clientY - mouseDownPosRef.current.y;
      const distanceMoved = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Check if it's a drag (moved enough distance OR held long enough while moving slightly)
      if (distanceMoved > DRAG_DISTANCE_THRESHOLD_PX || (timeElapsed > TAP_DURATION_THRESHOLD_MS && distanceMoved > 1)) {
        isPotentialTapRef.current = false; // It's a drag, not a tap
        setIsDragging(true);

        // Set initial drag screen position using the position from mousedown
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        dragStartPos.current = {
          x: mouseDownPosRef.current.x - rect.left,
          y: mouseDownPosRef.current.y - rect.top,
        };
        // modelStartPos is already set in handleMouseDown
      }
    }
    // --- End Start Drag Logic ---

    // --- Continue Drag Logic ---
    if (isDragging && adapter && view && model && canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const currentX = e.clientX - rect.left; // Current screen X relative to canvas
      const currentY = e.clientY - rect.top; // Current screen Y relative to canvas

      // Convert screen delta to model delta
      const scale = canvas.width / canvas.clientWidth;
      const startScaledX = dragStartPos.current.x * scale;
      const startScaledY = dragStartPos.current.y * scale;
      const startModelX = view._deviceToScreen.transformX(startScaledX);
      const startModelY = view._deviceToScreen.transformY(startScaledY);

      const currentScaledX = currentX * scale;
      const currentScaledY = currentY * scale;
      const currentModelX = view._deviceToScreen.transformX(currentScaledX);
      const currentModelY = view._deviceToScreen.transformY(currentScaledY);

      const dx = currentModelX - startModelX;
      const dy = currentModelY - startModelY;

      const newX = modelStartPos.current.x + dx;
      const newY = modelStartPos.current.y + dy;

      // Use the adapter's setModelPosition method if available, otherwise update matrix directly
      if (adapter.setModelPosition) {
        adapter.setModelPosition(newX, newY);
      } else if (model._modelMatrix) {
        const matrix = model._modelMatrix.getArray();
        const newMatrix = [...matrix];
        newMatrix[12] = newX;
        newMatrix[13] = newY;
        model._modelMatrix.setMatrix(newMatrix);
      }

      modelPositionRef.current = { x: newX, y: newY };
      setPosition({ x: newX, y: newY }); // Update React state if needed for UI feedback
    }
    // --- End Continue Drag Logic ---

    // --- Pet Hover Logic (Unchanged) ---
    if (isPet && !isDragging && !isPotentialTapRef.current && electronApi && adapter && view && model && canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scale = canvas.width / canvas.clientWidth;
      const scaledX = x * scale;
      const scaledY = y * scale;
      const modelX = view._deviceToScreen.transformX(scaledX);
      const modelY = view._deviceToScreen.transformY(scaledY);

      const currentHitState = model.anyhitTest(modelX, modelY) !== null || model.isHitOnModel(modelX, modelY);

      if (currentHitState !== isHoveringModelRef.current) {
        isHoveringModelRef.current = currentHitState;
        electronApi.ipcRenderer.send('update-component-hover', 'live2d-model', currentHitState);
      }
    }
    // --- End Pet Hover Logic ---
  }, [isPet, isDragging, electronApi, canvasRef]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const adapter = (window as any).getLAppAdapter?.();
    const model = adapter?.getModel();
    const view = LAppDelegate.getInstance().getView();

    if (isDragging) {
      // Finalize drag
      setIsDragging(false);
      if (adapter) {
        const currentModel = adapter.getModel(); // Re-get model in case adapter changed
        if (currentModel && currentModel._modelMatrix) {
          const matrix = currentModel._modelMatrix.getArray();
          const finalPos = { x: matrix[12], y: matrix[13] };
          modelPositionRef.current = finalPos;
          modelStartPos.current = finalPos; // Update base position for next potential drag
          setPosition(finalPos);
          sendScreenPosition();
        }
      }
    } else if (isPotentialTapRef.current && adapter && model && view && canvasRef.current) {
      // --- Tap Motion Logic ---
      const timeElapsed = Date.now() - mouseDownTimeRef.current;
      const deltaX = e.clientX - mouseDownPosRef.current.x;
      const deltaY = e.clientY - mouseDownPosRef.current.y;
      const distanceMoved = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Check if it qualifies as a tap (short duration, minimal movement)
      if (timeElapsed < TAP_DURATION_THRESHOLD_MS && distanceMoved < DRAG_DISTANCE_THRESHOLD_PX) {
        const allowTapMotion = modelInfo?.pointerInteractive !== false;

        if (allowTapMotion && modelInfo?.tapMotions) {
          // Use mouse down position for hit testing
          const canvas = canvasRef.current;
          const rect = canvas.getBoundingClientRect();
          const scale = canvas.width / canvas.clientWidth;
          const downX = (mouseDownPosRef.current.x - rect.left) * scale;
          const downY = (mouseDownPosRef.current.y - rect.top) * scale;
          const modelX = view._deviceToScreen.transformX(downX);
          const modelY = view._deviceToScreen.transformY(downY);

          const hitAreaName = model.anyhitTest(modelX, modelY);
          // Trigger tap motion using the specific hit area name or null for general body tap
          model.startTapMotion(hitAreaName, modelInfo.tapMotions);
        }
      }
      // --- End Tap Motion Logic ---
    }

    // Reset potential tap flag regardless of outcome
    isPotentialTapRef.current = false;
  }, [isDragging, canvasRef, modelInfo]);

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      // If dragging and mouse leaves, treat it like a mouse up to end drag
      handleMouseUp({} as React.MouseEvent); // Pass a dummy event or adjust handleMouseUp signature
    }
    // Reset potential tap if mouse leaves before mouse up
    if (isPotentialTapRef.current) {
      isPotentialTapRef.current = false;
    }
    // --- Pet Hover Logic (Unchanged) ---
    if (isPet && electronApi && isHoveringModelRef.current) {
      isHoveringModelRef.current = false;
      electronApi.ipcRenderer.send('update-component-hover', 'live2d-model', false);
    }
  }, [isPet, isDragging, electronApi, handleMouseUp]);

  useEffect(() => {
    if (!isPet && electronApi && isHoveringModelRef.current) {
      isHoveringModelRef.current = false;
    }
  }, [isPet, electronApi]);

  // Expose motion debugging functions to window for console testing
  useEffect(() => {
    const playMotion = (motionGroup: string, motionIndex: number = 0, priority: number = 3) => {
      const adapter = (window as any).getLAppAdapter?.();
      if (!adapter) {
        console.error('Live2D adapter not available');
        return false;
      }

      const model = adapter.getModel();
      if (!model) {
        console.error('Live2D model not available');
        return false;
      }

      try {
        console.log(`Playing motion: group="${motionGroup}", index=${motionIndex}, priority=${priority}`);
        const result = model.startMotion(motionGroup, motionIndex, priority);
        console.log('Motion start result:', result);
        return result;
      } catch (error) {
        console.error('Error playing motion:', error);
        return false;
      }
    };

    const playRandomMotion = (motionGroup: string, priority: number = 3) => {
      const adapter = (window as any).getLAppAdapter?.();
      if (!adapter) {
        console.error('Live2D adapter not available');
        return false;
      }

      const model = adapter.getModel();
      if (!model) {
        console.error('Live2D model not available');
        return false;
      }

      try {
        console.log(`Playing random motion from group: "${motionGroup}", priority=${priority}`);
        const result = model.startRandomMotion(motionGroup, priority);
        console.log('Random motion start result:', result);
        return result;
      } catch (error) {
        console.error('Error playing random motion:', error);
        return false;
      }
    };

    const getMotionInfo = () => {
      const adapter = (window as any).getLAppAdapter?.();
      if (!adapter) {
        console.error('Live2D adapter not available');
        return null;
      }

      const model = adapter.getModel();
      if (!model) {
        console.error('Live2D model not available');
        return null;
      }

      try {
        const motionGroups = [];
        const setting = model._modelSetting;
        if (setting) {
          // Get all motion groups
          const groups = setting._json?.FileReferences?.Motions;
          if (groups) {
            for (const groupName in groups) {
              const motions = groups[groupName];
              motionGroups.push({
                name: groupName,
                count: motions.length,
                motions: motions.map((motion: any, index: number) => ({
                  index,
                  file: motion.File
                }))
              });
            }
          }
        }
        
        console.log('Available motion groups:', motionGroups);
        return motionGroups;
      } catch (error) {
        console.error('Error getting motion info:', error);
        return null;
      }
    };

    // Expose to window for console access
    (window as any).Live2DDebug = {
      playMotion,
      playRandomMotion,
      getMotionInfo,
      // Helper functions
      help: () => {
        console.log(`
Live2D Motion Debug Functions:
- Live2DDebug.getMotionInfo() - Get all available motion groups and their motions
- Live2DDebug.playMotion(group, index, priority) - Play specific motion
- Live2DDebug.playRandomMotion(group, priority) - Play random motion from group  
- Live2DDebug.help() - Show this help

Example usage:
Live2DDebug.getMotionInfo()  // See available motions
Live2DDebug.playMotion("", 0)  // Play first motion from default group
Live2DDebug.playRandomMotion("")  // Play random motion from default group
        `);
      }
    };

    console.log('Live2D Debug functions exposed to window.Live2DDebug');
    console.log('Type Live2DDebug.help() for usage information');

    // Cleanup function
    return () => {
      delete (window as any).Live2DDebug;
    };
  }, []);

  return {
    position,
    isDragging,
    handlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave,
    },
  };
};
