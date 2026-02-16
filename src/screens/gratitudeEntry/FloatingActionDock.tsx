import React, { useState, useEffect, useCallback } from 'react';
import { View, Pressable, Keyboard } from 'react-native';
import { Smile, ImagePlus, Mic, Tag } from 'lucide-react-native';
import { MAX_PHOTOS_PER_ENTRY } from '~/constants';
import { type Mood } from '~/types';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { type PickPhotosResult } from '~/lib/photoUtils';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';
import { toast } from '~/components/ui/toast';
import { TagsModal } from './TagsModal';
import { MoodModal } from './MoodModal';
import { AddPhotoModal } from './AddPhotoModal';

// ============================================================================
// Types
// ============================================================================

interface IFloatingActionDockProps {
  /** Whether the keyboard is currently visible */
  isKeyboardVisible: boolean;
  onPhotosPicked: (result: PickPhotosResult) => void;
  currentPhotoCount: number;
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
  onPhotosPicked,
  currentPhotoCount,
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
  const [showAddPhotoDialog, setShowAddPhotoDialog] = useState(false);

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

  const handlePhotoPress = useCallback(() => {
    Keyboard.dismiss();
    const remaining = MAX_PHOTOS_PER_ENTRY - currentPhotoCount;
    if (remaining <= 0) {
      toast.warning(
        t('Maximum {count} photos per entry', { count: String(MAX_PHOTOS_PER_ENTRY) }),
      );
      return;
    }

    setShowAddPhotoDialog(true);
  }, [currentPhotoCount, t]);

  return (
    <>
      <View
        className={cn(
          'flex-row items-center bg-popover border border-border',
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
        <DockButton
          icon={ImagePlus}
          label={t('Photo')}
          showLabel={!isKeyboardVisible}
          onPress={handlePhotoPress}
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

      <AddPhotoModal
        visible={showAddPhotoDialog}
        onClose={() => setShowAddPhotoDialog(false)}
        currentPhotoCount={currentPhotoCount}
        onPhotosPicked={onPhotosPicked}
      />
    </>
  );
}
