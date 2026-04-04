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
import { SettingsRow } from '../SettingsRow';

const JOURNAL_PROMPTS_OPTIONS: { value: JournalPromptsMode; labelKey: string }[] = [
  { value: 'off', labelKey: 'Off' },
  { value: 'all', labelKey: 'All Prompts' },
  { value: 'custom', labelKey: 'My Prompts' },
  { value: 'builtin', labelKey: 'Built In Prompts' },
];

export function JournalingSection() {
  const { t } = useTranslation();
  const journalPromptsMode = useSettingsStore((s) => s.journalPromptsMode);
  const setJournalPromptsMode = useSettingsStore((s) => s.setJournalPromptsMode);

  const currentPromptLabel =
    JOURNAL_PROMPTS_OPTIONS.find((o) => o.value === journalPromptsMode)?.labelKey ??
    'Off';

  const currentValue: Option = {
    value: journalPromptsMode,
    label: t(currentPromptLabel),
  };

  const handlePromptsChange = (option: Option) => {
    if (!option) return;
    setJournalPromptsMode(option.value as JournalPromptsMode);
  };

  return (
    <SettingsSection title={t('Journaling')}>
      <SettingsRow
        label={t('Journal Focus Areas')}
        description={t('Personalize your journal prompts.')}
        icon={Crosshair}
        showChevron
        onPress={() => TrueSheet.present(SHEET_NAMES.JOURNAL_FOCUS_AREAS)}
      />
      <SettingsRow
        label={t('Journal Prompts')}
        description={t('Choose which prompts to show when starting a new journal entry.')}
        icon={ScrollText}
        rightElement={
          <Select value={currentValue} onValueChange={handlePromptsChange}>
            <SelectTrigger className="min-w-30">
              <SelectValue placeholder={t('Off')} />
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
