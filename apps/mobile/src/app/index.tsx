import { Redirect } from 'expo-router';
import HomeScreen from '~/screens/home';
import { useSettingsStore } from '~/lib/settings';

export default function Home() {
  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);

  if (!hasCompletedOnboarding) {
    return <Redirect href="/onboarding/welcome" />;
  }
  return <HomeScreen />;
}
