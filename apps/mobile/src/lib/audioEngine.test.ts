type AppStateListener = (state: string) => void;

const mockAppStateListeners: AppStateListener[] = [];

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_event: 'change', listener: AppStateListener) => {
      mockAppStateListeners.push(listener);
      return { remove: jest.fn() };
    },
  },
}));

jest.mock('expo-file-system', () => ({ File: jest.fn() }));

jest.mock('react-native-audio-api', () => {
  const node = () => ({ connect: jest.fn(), disconnect: jest.fn() });
  const sources: { start: jest.Mock; stop: jest.Mock }[] = [];
  const contexts: { state: string; resume: jest.Mock; suspend: jest.Mock }[] = [];
  class AudioContext {
    constructor() {
      contexts.push(this);
    }
    state = 'running';
    currentTime = 0;
    destination = {};
    createAnalyser = () => ({ ...node(), fftSize: 0, smoothingTimeConstant: 0 });
    createGain = () => ({ ...node(), gain: { value: 1 } });
    createBufferSource = () => {
      const source = { ...node(), buffer: null, start: jest.fn(), stop: jest.fn() };
      sources.push(source);
      return source;
    };
    decodeAudioData = jest.fn(async () => ({
      duration: 10,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(16),
    }));
    resume = jest.fn(async () => {
      this.state = 'running';
    });
    suspend = jest.fn(async () => {
      this.state = 'suspended';
    });
    close = jest.fn();
  }
  return {
    AudioContext,
    AudioRecorder: jest.fn(),
    AudioManager: {
      setAudioSessionOptions: jest.fn(),
      setAudioSessionActivity: jest.fn(async () => {}),
    },
    FileFormat: {},
    FilePreset: {},
    sources,
    contexts,
  };
});

const { sources: mockSources, contexts: mockContexts } = jest.requireMock(
  'react-native-audio-api',
) as {
  sources: { start: jest.Mock; stop: jest.Mock }[];
  contexts: { state: string; resume: jest.Mock; suspend: jest.Mock }[];
};

function setAppState(state: string) {
  mockAppStateListeners.forEach((listener) => listener(state));
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { audioEngine } = require('./audioEngine') as typeof import('./audioEngine');

afterEach(() => {
  setAppState('active');
  audioEngine.stopPlayback();
  mockSources.length = 0;
});

test('going to background pauses playback, and returning leaves it paused', async () => {
  await audioEngine.loadAndPlay('file:///note.m4a');
  expect(audioEngine.playbackState).toBe('playing');

  setAppState('background');
  expect(mockSources[0].stop).toHaveBeenCalled();
  expect(audioEngine.playbackState).toBe('paused');
  // No output stream stays open in background.
  expect(mockContexts.at(-1)!.state).toBe('suspended');
  expect(audioEngine.currentUri).toBe('file:///note.m4a');

  setAppState('active');
  expect(audioEngine.playbackState).toBe('paused');
  expect(mockSources).toHaveLength(1);
});

test('inactive (app switcher, Control Center) keeps playing', async () => {
  await audioEngine.loadAndPlay('file:///note.m4a');
  setAppState('inactive');
  expect(audioEngine.playbackState).toBe('playing');
});

test('a file that finishes loading in background does not start playing', async () => {
  const playing = audioEngine.loadAndPlay('file:///note.m4a', 3);
  setAppState('background');
  await playing;
  expect(mockSources).toHaveLength(0);
  expect(audioEngine.playbackState).toBe('paused');
  expect(audioEngine.currentTime).toBe(3);

  setAppState('active');
  await audioEngine.resumePlayback();
  expect(audioEngine.playbackState).toBe('playing');
  expect(mockSources[0].start).toHaveBeenCalledWith(0, 3);
});

test('a resume still waiting for the audio context when the app leaves stays paused', async () => {
  await audioEngine.loadAndPlay('file:///note.m4a');
  setAppState('background');
  setAppState('active');
  const context = mockContexts.at(-1)!;
  let finishResume: () => void = () => {};
  context.resume.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishResume = () => {
          context.state = 'running';
          resolve();
        };
      }),
  );

  const resuming = audioEngine.resumePlayback();
  // Let it reach the pending context resume.
  await new Promise((resolve) => setImmediate(resolve));
  expect(context.resume).toHaveBeenCalled();
  setAppState('background');
  finishResume();
  await resuming;
  expect(audioEngine.playbackState).toBe('paused');
  expect(mockSources).toHaveLength(1);
  expect(context.state).toBe('suspended');
});

test('a resume requested while in background does not start playing', async () => {
  await audioEngine.loadAndPlay('file:///note.m4a');
  setAppState('background');
  await audioEngine.resumePlayback();
  expect(audioEngine.playbackState).toBe('paused');
  expect(mockSources).toHaveLength(1);
});
