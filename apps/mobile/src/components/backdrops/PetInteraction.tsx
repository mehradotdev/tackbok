import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface PetInteraction {
  ready: boolean;
  busy: boolean;
  play: () => void;
  register: (play: () => void) => () => void;
  setBusy: (busy: boolean) => void;
}

const Context = createContext<PetInteraction | null>(null);

/** Home-local bridge: decorative canvases never intercept journal touches.
 * Commands are not queued or persisted, and cannot reach picker/share scenes. */
export function PetInteractionProvider({ children }: { children: ReactNode }) {
  const handler = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const play = useCallback(() => handler.current?.(), []);
  const register = useCallback((next: () => void) => {
    handler.current = next;
    setReady(true);
    return () => {
      if (handler.current !== next) return;
      handler.current = null;
      setReady(false);
      setBusy(false);
    };
  }, []);
  const value = useMemo(
    () => ({ ready, busy, play, register, setBusy }),
    [ready, busy, play, register],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePetInteraction() {
  return useContext(Context);
}
