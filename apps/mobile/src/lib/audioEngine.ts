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
  OfflineAudioContext,
  FileFormat,
  FilePreset,
  type AudioBuffer,
  type AudioBufferSourceNode,
  type AnalyserNode,
} from 'react-native-audio-api';
import { File, Paths } from 'expo-file-system';
import { requireNativeModule } from 'expo';

// ============================================================================
// Native Audio Encoder (WAV → M4A)
// ============================================================================

type AudioEncoderNativeModule = {
  encodeWavToM4a(wavUri: string, bitrate: number): Promise<string>;
};

/** Voice-optimised AAC bitrate (kbps). 64k is plenty for mono speech. */
const VOICE_AAC_BITRATE = 64000;

function getAudioEncoder(): AudioEncoderNativeModule {
  return requireNativeModule<AudioEncoderNativeModule>('AudioEncoderModule');
}

// ============================================================================
// Constants
// ============================================================================

const FFT_SIZE = 256;
const URI_DECODE_DIRECT_EXTENSIONS = new Set(['m4a', 'wav']);

// ── Audio normalization tuning ─────────────────────────────────────────
// These control the post-recording normalization pipeline.

/** Target speech RMS after normalization. */
const NORM_TARGET_RMS = 0.12;

/** Target high percentile peak after normalization (≈ -1 dBFS). */
const NORM_TARGET_PEAK = 0.89;

/** Maximum gain multiplier to prevent boosting pure noise (~20 dB). */
const NORM_MAX_GAIN = 10;

/** Minimum useful gain; lower changes are not worth re-encoding. */
const NORM_MIN_GAIN = 1.15;

/** Minimum peak below which we skip normalization (essentially silence). */
const NORM_SILENCE_THRESHOLD = 0.005;

/** Samples below this level are ignored for voice RMS/percentile analysis. */
const NORM_VOICE_FLOOR = 0.01;

/** Avoid amplifying files that contain only tiny bursts/noise. */
const NORM_MIN_VOICED_RATIO = 0.005;

/** Histogram resolution for percentile peak analysis. */
const NORM_PERCENTILE_BINS = 1024;

/** Upper percentile used as a robust peak proxy. */
const NORM_PEAK_PERCENTILE = 0.95;

/** High-pass filter cutoff frequency to remove low-frequency rumble. */
const NORM_HIGHPASS_HZ = 80;

// ── WAV encoding helper ───────────────────────────────────────────────

/**
 * Encode an AudioBuffer as a WAV file (16-bit PCM, little-endian).
 * Returns a Uint8Array containing the complete .wav file data.
 */
function encodeWav(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numFrames = buffer.length;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const out = new ArrayBuffer(fileSize);
  const view = new DataView(out);

  // Helper to write ASCII string
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true); // file size - 8
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size (16 for PCM)
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channel data and write 16-bit PCM samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      // Clamp to [-1, 1] then convert to 16-bit signed integer
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += bytesPerSample;
    }
  }

  return new Uint8Array(out);
}

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

function getNormalizationGain(buffer: AudioBuffer): number {
  const histogram = new Uint32Array(NORM_PERCENTILE_BINS);
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

      if (abs >= NORM_VOICE_FLOOR) {
        sumSq += abs * abs;
        voicedSampleCount++;
        const bin = Math.min(
          NORM_PERCENTILE_BINS - 1,
          Math.floor(abs * (NORM_PERCENTILE_BINS - 1)),
        );
        histogram[bin]++;
      }
    }
  }

  if (peak < NORM_SILENCE_THRESHOLD || voicedSampleCount === 0) {
    return 1;
  }

  if (voicedSampleCount / totalSampleCount < NORM_MIN_VOICED_RATIO) {
    return 1;
  }

  const targetCount = Math.ceil(voicedSampleCount * NORM_PEAK_PERCENTILE);
  let runningCount = 0;
  let percentilePeak = peak;
  for (let bin = 0; bin < histogram.length; bin++) {
    runningCount += histogram[bin];
    if (runningCount >= targetCount) {
      percentilePeak = Math.max(NORM_VOICE_FLOOR, bin / (NORM_PERCENTILE_BINS - 1));
      break;
    }
  }

  const rms = Math.sqrt(sumSq / voicedSampleCount);
  const rmsGain = NORM_TARGET_RMS / Math.max(rms, 0.000001);
  const percentilePeakGain = NORM_TARGET_PEAK / Math.max(percentilePeak, 0.000001);
  const gain = Math.min(rmsGain, percentilePeakGain, NORM_MAX_GAIN);

  return gain >= NORM_MIN_GAIN ? gain : 1;
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
   * These values are intentionally left unshaped so the UI layer can own all
   * static waveform display tuning in one place.
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

    return { amplitudes, duration: audioDuration };
  }

  // ====================================================================
  // Audio Normalization (post-recording)
  // ====================================================================

  /**
   * Normalize a recorded audio file to boost quiet recordings.
   *
   * Pipeline: decode → analyze voiced RMS/percentile → highpass filter → gain → soft limiter → WAV
   *
   * If the recording is already at a reasonable level or is essentially
   * silence, the original file is returned unchanged.
   *
   * @returns The URI of the (possibly new) normalized file.
   */
  async normalizeAudio(uri: string): Promise<string> {
    // 1. Decode the recorded file into an AudioBuffer
    const sourceBuffer = await this.decodeAudioBuffer(uri);
    const { numberOfChannels, sampleRate, length: numFrames } = sourceBuffer;

    if (numFrames === 0) return uri;

    // 2. Calculate robust voice gain from voiced RMS and high-percentile peak.
    // A single tap/pop should not prevent quiet speech from being boosted.
    const gain = getNormalizationGain(sourceBuffer);
    if (gain === 1) return uri;

    // 3. Process through OfflineAudioContext
    const offlineCtx = new OfflineAudioContext(numberOfChannels, numFrames, sampleRate);

    // Source
    const source = offlineCtx.createBufferSource();
    source.buffer = sourceBuffer;

    // High-pass filter: remove low-frequency rumble that wastes headroom
    const highpass = offlineCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = NORM_HIGHPASS_HZ;

    // Gain node: boost the signal
    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = gain;

    // Soft limiter: prevent clipping after gain boost
    const limiter = offlineCtx.createWaveShaper();
    limiter.curve = buildSoftLimiterCurve();
    limiter.oversample = '4x';

    // Wire the graph: source → highpass → gain → limiter → destination
    source.connect(highpass);
    highpass.connect(gainNode);
    gainNode.connect(limiter);
    limiter.connect(offlineCtx.destination);

    // Start source and render
    source.start(0);
    const processedBuffer = await offlineCtx.startRendering();

    // 4. Encode the processed buffer as intermediate WAV
    const wavData = encodeWav(processedBuffer);

    // 5. Write intermediate WAV to cache
    const wavFile = new File(Paths.cache, `normalized_${Date.now()}.wav`);
    wavFile.write(wavData);

    // 6. Encode WAV → M4A via native module (hardware-accelerated AAC)
    let finalUri: string;
    try {
      finalUri = await getAudioEncoder().encodeWavToM4a(wavFile.uri, VOICE_AAC_BITRATE);
    } catch {
      // If native encoding fails, fall back to WAV
      finalUri = wavFile.uri;
    }

    // 7. Clean up intermediate WAV (if we successfully encoded to M4A)
    if (finalUri !== wavFile.uri) {
      try {
        if (wavFile.exists) wavFile.delete();
      } catch {
        // Ignore — cleanup is best-effort
      }
    }

    // 8. Delete the original temp recording file (best-effort)
    try {
      const originalFile = new File(uri);
      if (originalFile.exists) originalFile.delete();
    } catch {
      // Ignore — cleanup is best-effort
    }

    return finalUri;
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
