const VOLUME_STORAGE_KEY = 'tts_volume';
const DEFAULT_VOLUME = 0.2;

/**
 * Global audio manager for handling audio playback and interruption
 * This ensures all components share the same audio reference
 */
class AudioManager {
  private currentAudio: HTMLAudioElement | null = null;
  private currentModel: any | null = null;
  private volume: number;
  // Temporary volume applied during a conversation chain (null = use base volume)
  private temporaryVolume: number | null = null;

  constructor() {
    const stored = localStorage.getItem(VOLUME_STORAGE_KEY);
    this.volume = stored !== null ? parseFloat(stored) : DEFAULT_VOLUME;
  }

  getVolume(): number {
    return this.volume;
  }

  /** Effective playback volume: temporary override if active, else stored base. */
  getEffectiveVolume(): number {
    return this.temporaryVolume !== null ? this.temporaryVolume : this.volume;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    localStorage.setItem(VOLUME_STORAGE_KEY, this.volume.toString());
    // Also reset temporary so manual slider changes take effect immediately
    this.temporaryVolume = null;
    if (this.currentAudio) {
      this.currentAudio.volume = this.volume;
    }
  }

  /**
   * Save current volume as the conversation baseline and reset the temporary override.
   * Called on conversation-chain-start so we know what to restore later.
   */
  saveBaseVolume(): void {
    this.temporaryVolume = this.volume;
  }

  /**
   * Apply a cumulative adjustment (±percentage-points, 0-100 scale) to the temporary volume.
   * E.g. +5 adds 0.05 to the 0-1 internal scale.
   */
  applyVolumeAdjustment(delta: number): void {
    const base = this.temporaryVolume !== null ? this.temporaryVolume : this.volume;
    this.temporaryVolume = Math.max(0, Math.min(1, base + delta / 100));
  }

  /**
   * Restore the stored base volume and clear any temporary override.
   * Called on conversation-chain-end.
   */
  restoreBaseVolume(): void {
    this.temporaryVolume = null;
    if (this.currentAudio) {
      this.currentAudio.volume = this.volume;
    }
  }

  /**
   * Set the current playing audio
   */
  setCurrentAudio(audio: HTMLAudioElement, model: any) {
    this.currentAudio = audio;
    this.currentModel = model;
    audio.volume = this.getEffectiveVolume();
  }

  /**
   * Stop current audio playback and lip sync
   */
  stopCurrentAudioAndLipSync() {
    if (this.currentAudio) {
      console.log('[AudioManager] Stopping current audio and lip sync');
      const audio = this.currentAudio;
      
      // Stop audio playback
      audio.pause();
      audio.src = '';
      audio.load();

      // Stop Live2D lip sync
      const model = this.currentModel;
      if (model && model._wavFileHandler) {
        try {
          // Release PCM data to stop lip sync calculation in update()
          model._wavFileHandler.releasePcmData();
          console.log('[AudioManager] Called _wavFileHandler.releasePcmData()');

          // Additional reset of state variables as fallback
          model._wavFileHandler._lastRms = 0.0;
          model._wavFileHandler._sampleOffset = 0;
          model._wavFileHandler._userTimeSeconds = 0.0;
          console.log('[AudioManager] Also reset _lastRms, _sampleOffset, _userTimeSeconds as fallback');
        } catch (e) {
          console.error('[AudioManager] Error stopping/resetting wavFileHandler:', e);
        }
      } else if (model) {
        console.warn('[AudioManager] Current model does not have _wavFileHandler to stop/reset.');
      } else {
        console.log('[AudioManager] No associated model found to stop lip sync.');
      }

      // Clear references
      this.currentAudio = null;
      this.currentModel = null;
    } else {
      console.log('[AudioManager] No current audio playing to stop.');
    }
  }

  /**
   * Clear the current audio reference (called when audio ends naturally)
   */
  clearCurrentAudio(audio: HTMLAudioElement) {
    if (this.currentAudio === audio) {
      this.currentAudio = null;
      this.currentModel = null;
    }
  }

  /**
   * Check if there's currently playing audio
   */
  hasCurrentAudio(): boolean {
    return this.currentAudio !== null;
  }
}

// Export singleton instance
export const audioManager = new AudioManager();