import React, { useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { useNavigateOnce } from './useNavigateOnce';

let mockFocus: () => void = () => {};
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    mockFocus = effect;
  },
}));

let navigateOnce: ReturnType<typeof useNavigateOnce>;
function Harness({ onReady }: { onReady: (run: typeof navigateOnce) => void }) {
  const run = useNavigateOnce();
  useEffect(() => onReady(run), [onReady, run]);
  return null;
}

beforeEach(async () => {
  await act(async () => {
    create(
      <Harness
        onReady={(run) => {
          navigateOnce = run;
        }}
      />,
    );
  });
});

test('a double tap moves on only once', async () => {
  const push = jest.fn();
  await act(async () => {
    navigateOnce(push);
    navigateOnce(push);
  });
  expect(push).toHaveBeenCalledTimes(1);
});

test('coming back to the step lets it move on again', async () => {
  const push = jest.fn();
  await act(async () => navigateOnce(push));
  act(() => mockFocus());
  await act(async () => navigateOnce(push));
  expect(push).toHaveBeenCalledTimes(2);
});

test('an action that did not navigate frees the buttons', async () => {
  const failing = jest.fn(async () => false);
  await act(async () => navigateOnce(failing));
  await act(async () => navigateOnce(failing));
  expect(failing).toHaveBeenCalledTimes(2);
});

test('a slow action still blocks a second tap while it runs', async () => {
  let finish: () => void = () => {};
  const slow = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
  await act(async () => {
    navigateOnce(slow);
    navigateOnce(slow);
  });
  expect(slow).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  // It navigated, so the step stays blocked until it regains focus.
  await act(async () => navigateOnce(slow));
  expect(slow).toHaveBeenCalledTimes(1);
});

test('an action that throws or rejects frees the buttons', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const throwing = jest.fn(() => {
    throw new Error('no route');
  });
  expect(() => navigateOnce(throwing)).toThrow('no route');
  expect(() => navigateOnce(throwing)).toThrow('no route');
  expect(throwing).toHaveBeenCalledTimes(2);

  const rejecting = jest.fn(async () => {
    throw new Error('save failed');
  });
  await act(async () => navigateOnce(rejecting));
  await act(async () => navigateOnce(rejecting));
  expect(rejecting).toHaveBeenCalledTimes(2);
  error.mockRestore();
});
