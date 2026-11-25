import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { measureCoachMarkTarget, useCoachMarkTarget } from './coachMarkTargets';

jest.mock('react-native', () => ({ View: 'View' }));

function Target({ enabled, y }: { enabled: boolean; y: number }) {
  const ref = useCoachMarkTarget('entry', enabled);
  return React.createElement('View', { ref, y });
}

const createNodeMock = (element: React.ReactElement<{ y: number }>) => ({
  measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) =>
    callback(0, element.props.y, 100, 40),
});

test('a target handed to another view is not dropped by the old one', async () => {
  let first: ReactTestRenderer;
  let second: ReactTestRenderer;
  await act(async () => {
    first = create(<Target enabled y={100} />, { createNodeMock });
  });
  // A recycled timeline row: the new newest day registers first, then the
  // old one turns its target off.
  await act(async () => {
    second = create(<Target enabled y={300} />, { createNodeMock });
  });
  await act(async () => first.update(<Target enabled={false} y={100} />));
  expect((await measureCoachMarkTarget('entry'))?.y).toBe(300);

  await act(async () => second.unmount());
  expect(await measureCoachMarkTarget('entry')).toBeNull();
  act(() => first.unmount());
});
