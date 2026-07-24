/**
 * AudioEngine — Singleton managing all audio recording & playback.
 *
 * Uses a single AudioContext + AudioRecorder + AnalyserNode as recommended by
 * the React Native Audio API best-practices guide.
 *
 * Key guarantees:
 * - Only one voice memo can play at a time across the entire app.
 * - The AudioContext is suspended when idle to save battery.
 * - Raw analyser data is available for waveform components via getTimeDomainData()
 *   and getCurrentRmsAmplitude().
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
const URI_DECODE_DIRECT_EXTENSIONS = new Set(['m4a', 'wav']);

// ── Playback gain tuning ───────────────────────────────────────────────
// Quiet recordings (Android records through a VOICE_RECOGNITION-preset
// stream, which the platform requires to have AGC disabled) are boosted at
// playback time instead of being destructively re-encoded. The stored file
// is always the recorder's original output.

/** Target voiced-speech RMS after playback boost (≈ -13 dBFS, messenger-loud). */
const GAIN_TARGET_RMS = 0.22;

/**
 * How far the percentile peak may be driven INTO the tanh limiter. Values > 1
 * deliberately overdrive the limiter so it soft-compresses peaks (this is what
 * makes quiet recordings loud without hard-clipping); higher = louder but more
 * saturation distortion on transients.
 */
const GAIN_PEAK_DRIVE = 1.6;

/** Maximum gain multiplier to prevent boosting pure noise (~30 dB). */
const GAIN_MAX = 31.6;

/** Minimum useful gain; lower boosts are inaudible, so skip the boost graph. */
const GAIN_MIN = 1.15;

/** Minimum peak below which we skip boosting (essentially silence). */
const GAIN_SILENCE_THRESHOLD = 0.005;

/** Samples below this level are ignored for voice RMS/percentile analysis. */
const GAIN_VOICE_FLOOR = 0.01;

/** Avoid amplifying files that contain only tiny bursts/noise. */
const GAIN_MIN_VOICED_RATIO = 0.005;

/** Histogram resolution for percentile peak analysis. */
const GAIN_PERCENTILE_BINS = 1024;

/** Upper percentile used as a robust peak proxy. */
const GAIN_PEAK_PERCENTILE = 0.95;

/** Maximum number of URIs to remember a computed playback gain for. */
const GAIN_CACHE_LIMIT = 32;

/**
 * Build a soft-limiter curve for a WaveShaperNode.
 * Uses tanh to gently clip signals that exceed ±1.0 after gain boost.
 */
function buildSoftLimiterCurve(samples = 8192): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    // Map index to [-1, 1] input range
    const x = (2 * i) / (samples - 1) - 1;
    // tanh gives a smooth S-curve: passes small signals, clips large ones
    curve[i] = Math.tanh(x);
  }
  return curve;
}

let softLimiterCurve: Float32Array | null = null;

function getSoftLimiterCurve(): Float32Array {
  if (!softLimiterCurve) {
    softLimiterCurve = buildSoftLimiterCurve();
  }
  return softLimiterCurve;
}

function computePlaybackGain(buffer: AudioBuffer): number {
  const histogram = new Uint32Array(GAIN_PERCENTILE_BINS);
  let peak = 0;
  let sumSq = 0;
  let voicedSampleCount = 0;
  let totalSampleCount = 0;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    totalSampleCount += channelData.length;

    for (let i = 0; i < channelData.length; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) peak = abs;

      if (abs >= GAIN_VOICE_FLOOR) {
        sumSq += abs * abs;
        voicedSampleCount++;
        const bin = Math.min(
          GAIN_PERCENTILE_BINS - 1,
          Math.floor(abs * (GAIN_PERCENTILE_BINS - 1)),
        );
        histogram[bin]++;
      }
    }
  }

  if (peak < GAIN_SILENCE_THRESHOLD || voicedSampleCount === 0) {
    return 1;
  }

  if (voicedSampleCount / totalSampleCount < GAIN_MIN_VOICED_RATIO) {
    return 1;
  }

  const targetCount = Math.ceil(voicedSampleCount * GAIN_PEAK_PERCENTILE);
  let runningCount = 0;
  let percentilePeak = peak;
  for (let bin = 0; bin < histogram.length; bin++) {
    runningCount += histogram[bin];
    if (runningCount >= targetCount) {
      percentilePeak = Math.max(GAIN_VOICE_FLOOR, bin / (GAIN_PERCENTILE_BINS - 1));
      break;
    }
  }

  const rms = Math.sqrt(sumSq / voicedSampleCount);
  const rmsGain = GAIN_TARGET_RMS / Math.max(rms, 0.000001);
  const percentilePeakGain = GAIN_PEAK_DRIVE / Math.max(percentilePeak, 0.000001);
  const gain = Math.min(rmsGain, percentilePeakGain, GAIN_MAX);

  return gain >= GAIN_MIN ? gain : 1;
}

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

  // Playback loudness compensation (see "Playback gain tuning" above)
  private playbackGainCache = new Map<string, number>();
  private currentPlaybackGain = 1;
  private boostNode: ReturnType<AudioContext['createGain']> | null = null;
  private limiterNode: ReturnType<AudioContext['createWaveShaper']> | null = null;

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
        try {
          return await ctx.decodeAudioData(uri);
        } catch (nativeError) {
          this.throwDecodeError(uri, { nativeError, fallbackError });
        }
      }
    }

    return ctx.decodeAudioData(uri);
  }

  // ====================================================================
  // Playback gain (loudness compensation for quiet recordings)
  // ====================================================================

  /**
   * Return the playback gain for a file, computing and caching it from the
   * decoded buffer on first sight. Analysis is a single pass over the samples,
   * so it only runs once per URI per app session.
   */
  private resolvePlaybackGain(uri: string, buffer: AudioBuffer): number {
    const cached = this.playbackGainCache.get(uri);
    if (cached !== undefined) return cached;

    const gain = computePlaybackGain(buffer);
    if (this.playbackGainCache.size >= GAIN_CACHE_LIMIT) {
      const oldest = this.playbackGainCache.keys().next().value;
      if (oldest !== undefined) this.playbackGainCache.delete(oldest);
    }
    this.playbackGainCache.set(uri, gain);
    return gain;
  }

  /**
   * Wire a source node into the output graph. Quiet recordings get a gain
   * boost followed by a tanh soft limiter, so peaks pushed past full scale
   * are rounded off instead of hard-clipping.
   */
  private connectSourceToOutput(source: AudioBufferSourceNode): void {
    const ctx = this.ensureContext();
    const analyser = this.ensureAnalyser();

    if (this.currentPlaybackGain === 1) {
      source.connect(analyser);
      return;
    }

    // Boost/limiter nodes are created lazily once and reused: seekTo() runs on
    // every scrub-gesture frame, so per-call allocation would churn native nodes.
    if (!this.boostNode || !this.limiterNode) {
      this.boostNode = ctx.createGain();
      this.limiterNode = ctx.createWaveShaper();
      this.limiterNode.curve = getSoftLimiterCurve();
      this.limiterNode.oversample = '4x';
      this.boostNode.connect(this.limiterNode);
      this.limiterNode.connect(analyser);
    }

    this.boostNode.gain.value = this.currentPlaybackGain;
    source.connect(this.boostNode);
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
      const [path] = result.paths;
      return path ? { path, duration: result.duration } : {};
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
    this.ensureAnalyser();

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

      // Boost quiet recordings at playback time (single-pass analysis,
      // cached per URI — see resolvePlaybackGain).
      this.currentPlaybackGain = this.resolvePlaybackGain(uri, this.currentBuffer);
    } catch (error) {
      this.stopPlayback();
      throw error;
    }

    // Create source
    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.currentBuffer;
    this.connectSourceToOutput(this.sourceNode);

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

    // Ensure analyser is connected to speakers for audible playback
    this.unmuteOutput();

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.currentBuffer;
    this.connectSourceToOutput(this.sourceNode);

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

      // Ensure analyser is connected to speakers for audible playback
      this.unmuteOutput();

      this.sourceNode = ctx.createBufferSource();
      this.sourceNode.buffer = this.currentBuffer;
      this.connectSourceToOutput(this.sourceNode);

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
    this.currentPlaybackGain = 1;

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
  // Analysis (for waveform components)
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
   * Return a raw 0..1-ish RMS amplitude from the current time-domain data.
   *
   * This is intentionally left unshaped so the live waveform component can own
   * all final display tuning in one place.
   */
  getCurrentRmsAmplitude(): number {
    const data = this.getTimeDomainData();
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSq += v * v;
    }
    return Math.sqrt(sumSq / data.length);
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
   * Decode an audio file and return raw chunk-peak amplitudes (0..1).
   * Used as renderer input for the static waveform at rest and during playback.
   *
   * Values are intentionally left unshaped: StaticWaveform normalizes them
   * against the clip's own loudest peak, so bar heights show the recording's
   * internal dynamics while playback gain handles absolute loudness.
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

      amplitudes.push(peak);
    }

    // Warm the playback-gain cache while we have the decoded buffer, so the
    // first play of this file doesn't pay the analysis pass on tap.
    this.resolvePlaybackGain(uri, buffer);

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
    this.boostNode = null;
    this.limiterNode = null;
  }
}

// ============================================================================
// Export singleton
// ============================================================================

export const audioEngine = new AudioEngine();
