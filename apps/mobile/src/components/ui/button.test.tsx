import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Button } from './button';

// Text pulls in the app's settings and database; Button only needs its context.
jest.mock('~/components/ui/text', () => ({
  TextClassContext: jest.requireActual('react').createContext(undefined),
}));
jest.mock('react-native', () => ({ Pressable: 'Pressable' }));

function pressableProps(element: React.ReactElement) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return renderer.root.findByType('Pressable' as unknown as React.ElementType).props;
}

test('a plain button announces itself as a button', () => {
  expect(pressableProps(<Button />).role).toBe('button');
});

// React Native lets `role` outrank `accessibilityRole`, so the default would
// turn a switch or checkbox card into a plain button for screen readers.
test("a caller's accessibilityRole is not masked by the default role", () => {
  const props = pressableProps(<Button accessibilityRole="switch" />);
  expect(props.role).toBeUndefined();
  expect(props.accessibilityRole).toBe('switch');
});

test("a caller's role wins", () => {
  expect(pressableProps(<Button role="radio" accessibilityRole="radio" />).role).toBe(
    'radio',
  );
});
