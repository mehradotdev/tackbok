import { useMemo } from 'react';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { buildDefaultWorksheetTemplate } from '~/lib/journalPrompts';

export function useWorksheetTemplate() {
  const customWorksheetTemplate = useSettingsStore(
    (state) => state.customWorksheetTemplate,
  );
  const setCustomWorksheetTemplate = useSettingsStore(
    (state) => state.setCustomWorksheetTemplate,
  );
  const resetCustomWorksheetTemplate = useSettingsStore(
    (state) => state.resetCustomWorksheetTemplate,
  );
  const { t } = useTranslation();

  const defaultWorksheetTemplate = useMemo(() => buildDefaultWorksheetTemplate(t), [t]);

  const resolvedWorksheetTemplate = customWorksheetTemplate || defaultWorksheetTemplate;

  return {
    customWorksheetTemplate,
    defaultWorksheetTemplate,
    resolvedWorksheetTemplate,
    hasCustomWorksheetTemplate: !!customWorksheetTemplate?.trim(),
    setCustomWorksheetTemplate,
    resetCustomWorksheetTemplate,
  };
}
