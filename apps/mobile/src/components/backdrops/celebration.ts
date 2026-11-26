import { AppState } from 'react-native';
import { seasonalDay } from '~/lib/seasonal/events';

// Each opening of the app (a cold start, or a return from the background) may
// play one special-day celebration on the home screen. Coming back to home from
// an entry, or pulling down Control Centre, is not a new opening.
let opening = 1;
let claimed = 0;
let lastState: string | null | undefined = AppState.currentState;
AppState.addEventListener('change', (next) => {
  if (next === 'active' && lastState === 'background') opening += 1;
  lastState = next;
});

/**
 * True when a celebration should play now: on a special day (24, 25 and 31 Dec,
 * 1 Jan, local time), once per opening. Claims the opening when it says yes.
 * The caller checks the "Festive touches" setting and Reduce Motion.
 */
export function claimCelebration(now = new Date()) {
  if (claimed === opening || !seasonalDay(now)) return false;
  claimed = opening;
  return true;
}
