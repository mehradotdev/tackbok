import React from 'react';
import { View, Keyboard } from 'react-native';
import { Smile, ImagePlus, Mic, Tag } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { Button } from '~/components/ui/button';

// ============================================================================
// Types
// ============================================================================

interface IFloatingActionDockProps {
  /** Whether the keyboard is currently visible */
  isKeyboardVisible: boolean;
  // Callbacks to request opening modals (rendered by the parent)
  onRequestMoodModal: () => void;
  onRequestTagsModal: () => void;
  onRequestVoiceMemoModal: () => void;
  onRequestAddPhotoModal: () => void;
}

interface IDockButtonProps {
  icon: typeof Smile;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  showLabel?: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

function DockButton({
  icon,
  label,
  onPress,
  disabled,
  showLabel = true,
}: IDockButtonProps) {
  return (
    <Button
      variant="ghost"
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className={cn('flex-1 flex-col h-auto', showLabel ? 'pt-1 pb-1' : 'py-1.5')}>
      <Icon as={icon} className="text-foreground/70" size={22} />
      {showLabel && (
        <Text className="text-sm font-body-medium text-foreground/70 mt-1">{label}</Text>
      )}
    </Button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FloatingActionDock({
  isKeyboardVisible,
  onRequestMoodModal,
  onRequestTagsModal,
  onRequestVoiceMemoModal,
  onRequestAddPhotoModal,
}: IFloatingActionDockProps) {
  const { t } = useTranslation();

  const handlePress = (callback: () => void) => {
    Keyboard.dismiss();
    callback();
  };

  return (
    <View
      className={cn(
        'flex-row items-center bg-popover border border-border',
        // Pill shape when keyboard is closed, full-width when open
        isKeyboardVisible
          ? 'mx-0 rounded-none border-x-0 border-b-0 py-2 px-2'
          : 'mx-4 mb-12 rounded-xl shadow-md py-1.5 px-4',
      )}>
      <DockButton
        icon={Smile}
        label={t('Mood')}
        showLabel={!isKeyboardVisible}
        onPress={() => handlePress(onRequestMoodModal)}
      />
      <DockButton
        icon={ImagePlus}
        label={t('Photo')}
        showLabel={!isKeyboardVisible}
        onPress={() => handlePress(onRequestAddPhotoModal)}
      />
      <DockButton
        icon={Mic}
        label={t('Voice')}
        showLabel={!isKeyboardVisible}
        onPress={() => handlePress(onRequestVoiceMemoModal)}
      />
      <DockButton
        icon={Tag}
        label={t('Tag')}
        showLabel={!isKeyboardVisible}
        onPress={() => handlePress(onRequestTagsModal)}
      />
    </View>
  );
}
