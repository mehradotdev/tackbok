import type { TranslationKey } from '~/lib/i18n';
import { Crosshair, ScrollText } from 'lucide-react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { type JournalPromptsMode } from '~/lib/journalPrompts';
import { useSettingsStore } from '~/lib/settings';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from '~/components/ui/select';
import { SettingsSection } from '../SettingsSection';
import { SettingsRow } from '~/components/SettingsRow';

const JOURNAL_PROMPTS_OPTIONS: { value: JournalPromptsMode; labelKey: TranslationKey }[] =
  [
    { value: 'off', labelKey: 'journaling.off' },
    { value: 'builtin', labelKey: 'journaling.builtInPrompts' },
    { value: 'custom', labelKey: 'journaling.myPrompts' },
    { value: 'all', labelKey: 'journaling.allPrompts' },
  ];

export function JournalingSection() {
  const { t } = useTranslation();
  const journalPromptsMode = useSettingsStore((s) => s.journalPromptsMode);
  const setJournalPromptsMode = useSettingsStore((s) => s.setJournalPromptsMode);

  const currentPromptLabel =
    JOURNAL_PROMPTS_OPTIONS.find((o) => o.value === journalPromptsMode)?.labelKey ??
    'journaling.off';

  const currentValue: Option = {
    value: journalPromptsMode,
    label: t(currentPromptLabel),
  };

  const handlePromptsChange = (option: Option) => {
    if (!option) return;
    setJournalPromptsMode(option.value as JournalPromptsMode);
  };

  return (
    <SettingsSection title={t('journaling.journaling')}>
      <SettingsRow
        label={t('journaling.journalFocusAreas')}
        description={t('journaling.personalizeYourJournalPrompts')}
        icon={Crosshair}
        showChevron
        onPress={() => TrueSheet.present(SHEET_NAMES.JOURNAL_FOCUS_AREAS)}
      />
      <SettingsRow
        label={t('journaling.journalPrompts')}
        description={t('journaling.chooseWhichPromptsToShowWhenStartingANewJournal')}
        icon={ScrollText}
        rightElement={
          <Select value={currentValue} onValueChange={handlePromptsChange}>
            <SelectTrigger className="min-w-30">
              <SelectValue placeholder={t('journaling.off')} />
            </SelectTrigger>
            <SelectContent className="min-w-45">
              {JOURNAL_PROMPTS_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  label={t(option.labelKey)}
                />
              ))}
            </SelectContent>
          </Select>
        }
      />
    </SettingsSection>
  );
}
