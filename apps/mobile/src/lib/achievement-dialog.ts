import { create } from 'zustand';
import type { Achievement } from '~/lib/achievements';

interface AchievementDialogState {
  manualAchievement: Achievement | null;
  openManualAchievement: (achievement: Achievement) => void;
  closeManualAchievement: () => void;
}

export const useAchievementDialogStore = create<AchievementDialogState>((set) => ({
  manualAchievement: null,
  openManualAchievement: (manualAchievement) => set({ manualAchievement }),
  closeManualAchievement: () => set({ manualAchievement: null }),
}));
