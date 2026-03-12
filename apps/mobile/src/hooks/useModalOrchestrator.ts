import { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

interface ModalControls {
  visible: boolean;
  open: () => void;
  close: () => void;
}

interface ModalOrchestrator {
  mood: ModalControls;
  tags: ModalControls;
  voiceMemo: ModalControls;
  addPhoto: ModalControls;
  timePicker: ModalControls;
}

// ============================================================================
// Hook
// ============================================================================

function useModalControls(): ModalControls {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  return { visible, open, close };
}

/**
 * Consolidates all modal visibility state for the GratitudeEntryEdit screen.
 * Each modal exposes `{ visible, open, close }` controls.
 */
export function useModalOrchestrator(): ModalOrchestrator {
  const mood = useModalControls();
  const tags = useModalControls();
  const voiceMemo = useModalControls();
  const addPhoto = useModalControls();
  const timePicker = useModalControls();

  return { mood, tags, voiceMemo, addPhoto, timePicker };
}
