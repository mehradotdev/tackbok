import { Languages } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { LanguageSelectControl } from '~/components/LanguageSelectControl';
import { SettingsRow } from './SettingsRow';

export default function SettingsLanguageComp({ isLast = false }: { isLast?: boolean }) {
  const { t } = useTranslation();

  return (
    <SettingsRow
      label={t('Language')}
      icon={Languages}
      isLast={isLast}
      rightElement={<LanguageSelectControl />}
    />
  );
}
