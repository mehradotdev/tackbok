import React, { useState, useEffect } from 'react';
import { View, Pressable, Keyboard } from 'react-native';
import { Smile, ImagePlus, Mic, Tag } from 'lucide-react-native';
import { type Mood } from '~/types';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { TagsModal } from './TagsModal';
import { MoodModal } from './MoodModal';

// ============================================================================
// Types
// ============================================================================

interface IFloatingActionDockProps {
  /** Whether the keyboard is currently visible */
  isKeyboardVisible: boolean;
  onPhotoPress?: () => void;
  onVoicePress?: () => void;

  // Mood Props
  mood: Mood | null;
  onMoodChange: (mood: Mood | null) => void;
  autoOpenMoodSelector?: boolean;

  // Tag Props
  selectedTagIds: string[];
  onTagsChange: (ids: string[]) => void;
  onTagDeleted: (deletedTagId: string) => void;
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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'flex-1 items-center justify-center active:bg-muted rounded-lg',
        showLabel ? 'pt-1' : 'py-1.5',
        disabled && 'opacity-40',
      )}>
      <Icon as={icon} className="text-foreground/70" size={22} />
      {showLabel && (
        <Text className="text-sm font-medium text-foreground/70 mt-1">{label}</Text>
      )}
    </Pressable>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FloatingActionDock({
  isKeyboardVisible,
  onPhotoPress,
  onVoicePress,
  mood,
  onMoodChange,
  autoOpenMoodSelector = false,
  selectedTagIds,
  onTagsChange,
  onTagDeleted,
}: IFloatingActionDockProps) {
  const { t } = useTranslation();

  // Modal states
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [showMoodSelector, setShowMoodSelector] = useState(false);

  // Auto-open mood modal if requested (e.g. for new entries)
  useEffect(() => {
    if (autoOpenMoodSelector) {
      setShowMoodSelector(true);
    }
  }, [autoOpenMoodSelector]);

  const handleMoodPress = () => {
    if (!showMoodSelector) Keyboard.dismiss();
    setShowMoodSelector((prev) => !prev);
  };

  const handleTagPress = () => {
    Keyboard.dismiss();
    setShowTagsModal(true);
  };

  return (
    <>
      <View
        className={cn(
          'flex-row items-center bg-card border border-border',
          // Pill shape when keyboard is closed, full-width when open
          isKeyboardVisible
            ? 'mx-0 rounded-none border-x-0 border-b-0 py-2 px-2'
            : 'mx-4 mb-8 rounded-full shadow-md py-1.5 px-4',
        )}>
        <DockButton
          icon={Smile}
          label={t('Mood')}
          showLabel={!isKeyboardVisible}
          onPress={handleMoodPress}
        />
        {/* TODO: Implement Photo feature */}
        <DockButton
          icon={ImagePlus}
          label={t('Photo')}
          showLabel={!isKeyboardVisible}
          onPress={onPhotoPress}
          disabled={!onPhotoPress}
        />
        {/* TODO: Implement Voice memo feature */}
        <DockButton
          icon={Mic}
          label={t('Voice')}
          showLabel={!isKeyboardVisible}
          onPress={onVoicePress}
          disabled={!onVoicePress}
        />
        <DockButton
          icon={Tag}
          label={t('Tag')}
          showLabel={!isKeyboardVisible}
          onPress={handleTagPress}
        />
      </View>

      {/* Modals */}
      <TagsModal
        visible={showTagsModal}
        onClose={() => setShowTagsModal(false)}
        selectedTagIds={selectedTagIds}
        onTagsChange={onTagsChange}
        onTagDeleted={onTagDeleted}
      />

      <MoodModal
        visible={showMoodSelector}
        onClose={() => setShowMoodSelector(false)}
        value={mood}
        onChange={onMoodChange}
      />
    </>
  );
}
