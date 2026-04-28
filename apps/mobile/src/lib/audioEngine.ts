/**
 * AudioEngine — Singleton managing all audio recording & playback.
 *
 * Uses a single AudioContext + AudioRecorder + AnalyserNode as recommended by
 * the React Native Audio API best-practices guide.
 *
 * Key guarantees:
 * - Only one voice memo can play at a time across the entire app.
 * - The AudioContext is suspended when idle to save battery.
 * - Time-domain data is available for waveform visualization via getTimeDomainData().
 */

import {
  AudioContext,
  AudioRecorder,
  AudioManager,
  FileFormat,
  FilePreset,
  type AudioBuffer,
  type AudioBufferSourceNode,
  type AnalyserNode,
} from 'react-native-audio-api';
import { File } from 'expo-file-system';

// ============================================================================
// Constants
// ============================================================================

const FFT_SIZE = 256;
const URI_DECODE_DIRECT_EXTENSIONS = new Set(['m4a']);

// ── Visual amplitude compression tuning ────────────────────────────────
// These control the adaptive scaling curve in getCurrentAmplitude().
// The curve gates noise, boosts whispers, and soft-clamps loud sounds.

/** Raw RMS below this is treated as ambient noise and gated to zero. */
const NOISE_FLOOR = 0.01;

/** Approximate peak raw RMS for normal-to-loud speech on a phone mic. */
const PRACTICAL_MAX = 0.35;

/** Power curve exponent (<1 = compress: boost quiet, tame loud). */
const VISUAL_EXPONENT = 0.55;

// ============================================================================
// Types
// ============================================================================

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused';

type PlaybackEndCallback = () => void;

/** Listener ID for unsubscribing */
type ListenerId = number;

// ============================================================================
// Engine
// ============================================================================

class AudioEngine {
  // ── Core Audio Graph ─────────────────────────────────────────────────
  private audioContext: AudioContext | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private analyser: AnalyserNode | null = null;
  private outputGain: ReturnType<AudioContext['createGain']> | null = null;

  // ── Recording ────────────────────────────────────────────────────────
  private _isRecording = false;
  private recorderAdapter: ReturnType<AudioContext['createRecorderAdapter']> | null =
    null;

  // ── Playback ─────────────────────────────────────────────────────────
  private sourceNode: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private _playbackState: PlaybackState = 'idle';
  private _currentUri: string | null = null;
  private loadRequestId = 0;

  // Timing for seek & progress
  private playStartContextTime = 0; // audioContext.currentTime when play() began
  private playStartOffset = 0; // offset within the buffer (for seeks)

  // Playback end listeners
  private playbackEndListeners = new Map<ListenerId, PlaybackEndCallback>();
  private nextListenerId = 0;
  private playbackEndTimer: ReturnType<typeof setTimeout> | null = null;

  // ====================================================================
  // Initialisation (lazy)
  // ====================================================================

  private ensureContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private ensureAnalyser(): AnalyserNode {
    if (!this.analyser) {
      const ctx = this.ensureContext();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.8;

      // Insert a GainNode between analyser and destination.
      // This lets us mute speaker output during recording (gain=0)
      // while keeping the analyser connected so it still processes
      // audio data for live waveform visualization.
      this.outputGain = ctx.createGain();
      this.outputGain.gain.value = 1; // audible by default (for playback)
      this.analyser.connect(this.outputGain);
      this.outputGain.connect(ctx.destination);
    }
    return this.analyser;
  }

  /** Mute speaker output (gain=0). Used during recording to avoid feedback. */
  private muteOutput(): void {
    if (this.outputGain) {
      this.outputGain.gain.value = 0;
    }
  }

  /** Unmute speaker output (gain=1). Used during playback. */
  private unmuteOutput(): void {
    if (this.outputGain) {
      this.outputGain.gain.value = 1;
    }
  }

  private ensureRecorder(): AudioRecorder {
    if (!this.audioRecorder) {
      this.audioRecorder = new AudioRecorder();
      this.audioRecorder.enableFileOutput({
        format: FileFormat.M4A,
        preset: FilePreset.Medium,
      });
    }
    return this.audioRecorder;
  }

  private shouldDecodeAudioFromBytes(uri: string): boolean {
    if (!uri.startsWith('file://')) {
      return false;
    }

    const extension = uri.split('.').pop()?.toLowerCase();
    return !extension || !URI_DECODE_DIRECT_EXTENSIONS.has(extension);
  }

  private throwDecodeError(
    uri: string,
    cause: { nativeError?: unknown; fallbackError: unknown },
  ): never {
    throw new Error(`Failed to decode audio for ${uri}`, { cause });
  }

  private async decodeAudioBuffer(uri: string): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const shouldDecodeFromBytes = this.shouldDecodeAudioFromBytes(uri);
    const decodeFromBytes = async (): Promise<AudioBuffer> => {
      const file = new File(uri);
      const bytes = await file.bytes();
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      return ctx.decodeAudioData(buffer);
    };

    if (shouldDecodeFromBytes) {
      try {
        return await decodeFromBytes();
      } catch (fallbackError) {
        this.throwDecodeError(uri, { fallbackError });
      }
    }

    return ctx.decodeAudioData(uri);
  }

  // ====================================================================
  // Recording
  // ====================================================================

  async startRecording(): Promise<{ status: 'success' | 'error'; message?: string }> {
    // Stop any playback first
    this.stopPlayback();

    const ctx = this.ensureContext();
    const analyser = this.ensureAnalyser();
    const recorder = this.ensureRecorder();

    // iOS audio session for record + play (preview)
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playAndRecord',
      iosMode: 'default',
      iosOptions: [],
    });

    const sessionOk = await AudioManager.setAudioSessionActivity(true);
    if (!sessionOk) {
      return { status: 'error', message: 'Could not activate audio session' };
    }

    // Mute speaker output during recording to prevent mic → speaker feedback loop.
    // The analyser remains connected via the silent GainNode so waveform
    // visualization still works.
    this.muteOutput();

    // Graph: recorder → adapter → analyser → gain(0) → destination
    const adapter = ctx.createRecorderAdapter();
    this.recorderAdapter = adapter;
    adapter.connect(analyser);
    recorder.connect(adapter);

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const result = recorder.start();
    if (result.status === 'error') {
      // Tear down the partially-built graph so the singleton isn't left
      // half-initialised for the next attempt.
      recorder.disconnect();
      adapter.disconnect();
      this.recorderAdapter = null;
      void ctx.suspend();
      void AudioManager.setAudioSessionActivity(false);
      this.unmuteOutput();
      return { status: 'error', message: result.message };
    }

    this._isRecording = true;
    return { status: 'success' };
  }

  stopRecording(): { path?: string; duration?: number } {
    const recorder = this.audioRecorder;
    if (!recorder || !this._isRecording) return {};

    const result = recorder.stop();
    this._isRecording = false;

    // Disconnect recorder and adapter from graph
    recorder.disconnect();
    this.recorderAdapter?.disconnect();
    this.recorderAdapter = null;

    // Suspend context since we're done recording
    this.audioContext?.suspend();
    // Fire-and-forget: nothing below depends on the session being deactivated
    // before returning, so we don't need to await (same pattern as stopPlayback).
    void AudioManager.setAudioSessionActivity(false);

    if (result.status === 'success') {
      return { path: result.path, duration: result.duration };
    }
    return {};
  }

  getRecordingDuration(): number {
    if (!this.audioRecorder || !this._isRecording) return 0;
    return this.audioRecorder.getCurrentDuration();
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  // ====================================================================
  // Playback
  // ====================================================================

  async loadAndPlay(uri: string, offset = 0): Promise<void> {
    // Stop any previous playback
    this.stopPlayback();

    const requestId = ++this.loadRequestId;

    const ctx = this.ensureContext();
    const analyser = this.ensureAnalyser();

    // Connect analyser to speakers so audio is audible during playback
    this.unmuteOutput();

    this._playbackState = 'loading';
    this._currentUri = uri;

    // iOS audio session for playback
    AudioManager.setAudioSessionOptions({
      iosCategory: 'playback',
      iosMode: 'default',
      iosOptions: [],
    });

    try {
      const sessionOk = await AudioManager.setAudioSessionActivity(true);
      if (!sessionOk) {
        throw new Error('Could not activate audio session');
      }

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Guard: if we were stopped/replaced while loading
      if (this._currentUri !== uri || requestId !== this.loadRequestId) return;

      // Decode audio data from file URI. Fallback to in-memory decode for
      // formats that are more reliable through byte-based detection.
      this.currentBuffer = await this.decodeAudioBuffer(uri);

      // Guard: if we were stopped/replaced while decoding
      if (this._currentUri !== uri || requestId !== this.loadRequestId) return;
    } catch (error) {
      this.stopPlayback();
      throw error;
    }

    // Create source
    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.currentBuffer;
    this.sourceNode.connect(analyser);

    // Track timing
    this.playStartOffset = Math.min(offset, this.currentBuffer.duration);
    this.playStartContextTime = ctx.currentTime;

    this.sourceNode.start(0, this.playStartOffset);
    this._playbackState = 'playing';

    // Schedule playback-end notification
    this.schedulePlaybackEnd(this.currentBuffer.duration - this.playStartOffset);
  }

  pausePlayback(): void {
    if (this._playbackState !== 'playing') return;

    // Capture current position before stopping
    const pos = this.currentTime;
    this.sourceNode?.stop();
    this.sourceNode = null;
    this.clearPlaybackEndTimer();

    this.playStartOffset = pos;
    this._playbackState = 'paused';
  }

  async resumePlayback(): Promise<void> {
    if (this._playbackState !== 'paused' || !this.currentBuffer) return;

    const ctx = this.ensureContext();
    const analyser = this.ensureAnalyser();

    // Ensure analyser is connected to speakers for audible playback
    this.unmuteOutput();

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.currentBuffer;
    this.sourceNode.connect(analyser);

    this.playStartContextTime = ctx.currentTime;
    this.sourceNode.start(0, this.playStartOffset);
    this._playbackState = 'playing';

    this.schedulePlaybackEnd(this.currentBuffer.duration - this.playStartOffset);
  }

  seekTo(time: number): void {
    if (!this.currentBuffer) return;

    const wasPlaying = this._playbackState === 'playing';

    // Stop current source
    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode = null;
    }
    this.clearPlaybackEndTimer();

    this.playStartOffset = Math.max(0, Math.min(time, this.currentBuffer.duration));

    if (wasPlaying) {
      const ctx = this.ensureContext();
      const analyser = this.ensureAnalyser();

      // Ensure analyser is connected to speakers for audible playback
      this.unmuteOutput();

      this.sourceNode = ctx.createBufferSource();
      this.sourceNode.buffer = this.currentBuffer;
      this.sourceNode.connect(analyser);

      this.playStartContextTime = ctx.currentTime;
      this.sourceNode.start(0, this.playStartOffset);
      this._playbackState = 'playing';

      this.schedulePlaybackEnd(this.currentBuffer.duration - this.playStartOffset);
    } else {
      this._playbackState = 'paused';
    }
  }

  stopPlayback(): void {
    const wasActive = this._playbackState !== 'idle';

    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        // May already be stopped
      }
      this.sourceNode = null;
    }
    this.clearPlaybackEndTimer();
    this.currentBuffer = null;
    this._currentUri = null;
    this._playbackState = 'idle';
    this.playStartOffset = 0;
    this.playStartContextTime = 0;

    // Suspend when we stop
    if (!this._isRecording) {
      this.audioContext?.suspend();
      AudioManager.setAudioSessionActivity(false);
    }

    if (wasActive) {
      this.notifyPlaybackStopped();
    }
  }

  // ── Playback State Getters ──────────────────────────────────────────

  get playbackState(): PlaybackState {
    return this._playbackState;
  }

  get currentUri(): string | null {
    return this._currentUri;
  }

  get currentTime(): number {
    if (!this.audioContext || !this.currentBuffer) return 0;

    if (this._playbackState === 'playing') {
      const elapsed = this.audioContext.currentTime - this.playStartContextTime;
      return Math.min(this.playStartOffset + elapsed, this.currentBuffer.duration);
    }

    return Math.min(this.playStartOffset, this.currentBuffer?.duration ?? 0);
  }

  get duration(): number {
    return this.currentBuffer?.duration ?? 0;
  }

  // ── Playback-end listeners ──────────────────────────────────────────

  onPlaybackEnd(callback: PlaybackEndCallback): ListenerId {
    const id = this.nextListenerId++;
    this.playbackEndListeners.set(id, callback);
    return id;
  }

  removePlaybackEndListener(id: ListenerId): void {
    this.playbackEndListeners.delete(id);
  }

  private notifyPlaybackStopped(): void {
    this.playbackEndListeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // Ignore listener errors
      }
    });
  }

  private schedulePlaybackEnd(remainingSeconds: number): void {
    this.clearPlaybackEndTimer();
    this.playbackEndTimer = setTimeout(() => {
      this._playbackState = 'idle';
      this._currentUri = null;
      this.playStartOffset = 0;
      this.sourceNode = null;

      // Suspend when playback ends
      if (!this._isRecording) {
        this.audioContext?.suspend();
        AudioManager.setAudioSessionActivity(false);
      }

      this.notifyPlaybackStopped();
    }, remainingSeconds * 1000);
  }

  private clearPlaybackEndTimer(): void {
    if (this.playbackEndTimer !== null) {
      clearTimeout(this.playbackEndTimer);
      this.playbackEndTimer = null;
    }
  }

  // ====================================================================
  // Analysis (for waveform visualization)
  // ====================================================================

  getTimeDomainData(): Uint8Array {
    const analyser = this.analyser;
    if (!analyser) {
      return new Uint8Array(FFT_SIZE).fill(127);
    }
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    return data;
  }

  /**
   * Return a single 0..1 amplitude from the current time-domain data.
   *
   * The value is **visually compressed** so the waveform looks natural:
   *   1. Noise gate  – raw RMS below NOISE_FLOOR is suppressed to zero.
   *   2. Normalise   – map the useful dynamic range [NOISE_FLOOR … PRACTICAL_MAX] → [0 … 1].
   *   3. Power curve – pow(x, VISUAL_EXPONENT) boosts quiet speech and
   *                    soft-clamps loud speech with no discontinuities.
   *
   * This is **purely visual** — it does NOT affect the recorded audio signal.
   */
  getCurrentAmplitude(): number {
    const data = this.getTimeDomainData();
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSq += v * v;
    }
    const rawRms = Math.sqrt(sumSq / data.length);

    // 1. Gate: suppress ambient / static noise
    const gated = Math.max(0, rawRms - NOISE_FLOOR);

    // 2. Normalise into [0, 1] based on practical phone-mic range
    const normalized = Math.min(1, gated / (PRACTICAL_MAX - NOISE_FLOOR));

    // 3. Compress: pow(x, 0.55) boosts whispers, tames loud speech
    return Math.pow(normalized, VISUAL_EXPONENT);
  }

  // ====================================================================
  // Permissions
  // ====================================================================

  async checkPermission(): Promise<'Granted' | 'Denied' | 'Undetermined'> {
    return AudioManager.checkRecordingPermissions();
  }

  async requestPermission(): Promise<'Granted' | 'Denied' | 'Undetermined'> {
    return AudioManager.requestRecordingPermissions();
  }

  // ====================================================================
  // Amplitude Extraction (for static waveform display)
  // ====================================================================

  /**
   * Decode an audio file and return an array of peak amplitude values (0..1).
   * Used to display the full waveform shape at rest and during playback.
   *
   * Each peak is run through the same visual compression curve used by
   * getCurrentAmplitude() (noise gate → normalise → power curve) so the
   * static waveform matches the live recording waveform's look and feel.
   */
  async extractAmplitudes(
    uri: string,
    sampleCount: number,
  ): Promise<{ amplitudes: number[]; duration: number }> {
    // Decode the file into a buffer (read-only, doesn't affect playback)
    const buffer = await this.decodeAudioBuffer(uri);
    const channelData = buffer.getChannelData(0); // mono or first channel
    const totalFrames = channelData.length;
    const audioDuration = buffer.duration;

    if (totalFrames === 0 || sampleCount <= 0) {
      return { amplitudes: new Array(sampleCount).fill(0), duration: audioDuration };
    }

    const framesPerSample = totalFrames / sampleCount;
    const amplitudes: number[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const start = Math.floor(i * framesPerSample);
      const end = Math.min(Math.floor((i + 1) * framesPerSample), totalFrames);

      // Find peak absolute value in this chunk
      let peak = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > peak) peak = abs;
      }

      // Apply the same visual compression as getCurrentAmplitude():
      // 1. Gate ambient noise  2. Normalise  3. Power-curve compress
      const gated = Math.max(0, peak - NOISE_FLOOR);
      const normalized = Math.min(1, gated / (PRACTICAL_MAX - NOISE_FLOOR));
      const compressed = Math.pow(normalized, VISUAL_EXPONENT);

      // Keep a small minimum so silent bars remain faintly visible
      amplitudes.push(Math.max(0.05, compressed));
    }

    return { amplitudes, duration: audioDuration };
  }

  // ====================================================================
  // Lifecycle
  // ====================================================================

  cleanup(): void {
    this.stopPlayback();
    if (this._isRecording) {
      this.audioRecorder?.stop();
      this._isRecording = false;
      // Fire-and-forget: cleanup() tears everything down immediately after this,
      // so there's nothing to wait for.
      void AudioManager.setAudioSessionActivity(false);
    }
    this.audioRecorder?.disconnect();
    this.audioContext?.close();
    this.audioContext = null;
    this.audioRecorder = null;
    this.analyser = null;
    this.outputGain = null;
  }
}

// ============================================================================
// Export singleton
// ============================================================================

export const audioEngine = new AudioEngine();
