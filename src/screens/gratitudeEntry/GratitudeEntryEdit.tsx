import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Keyboard, Pressable } from 'react-native';
import {
  KeyboardAwareScrollView,
  useReanimatedKeyboardAnimation,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useNavigation } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import { format } from 'date-fns';
import { Clock, X } from 'lucide-react-native';
import { MODAL_CLOSE_DELAY, MOOD_OPTIONS } from '~/constants';
import { type Entry, type Mood } from '~/types';
import { useTranslation, formatLocalizedDate, formatTimeLabel } from '~/lib/i18n';
import { generateUUID } from '~/lib/utils';
import { useUpsertEntry, useTagMapping } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Textarea } from '~/components/ui/textarea';
import { Badge } from '~/components/ui/badge';
import { toast } from '~/components/ui/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import { DateSelectDropdown } from '~/components/DateSelectDropdown';
import { TimePickerModal } from '~/components/TimePickerModal';
import { FloatingActionDock } from './FloatingActionDock';

interface GratitudeEntryEditProps {
  initialEntry?: Entry | null;
  initialDateMs?: number;
  onSaveSuccess: () => void;
  onCancel: () => void;
}

const areArraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
};

export function GratitudeEntryEdit({
  initialEntry,
  initialDateMs,
  onSaveSuccess,
  onCancel,
}: GratitudeEntryEditProps) {
  const tagMap = useTagMapping();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);

  // Mutations
  const upsertEntryMutation = useUpsertEntry();
  const isSaving = useRef(false);

  // Keyboard animation for floating dock positioning (avoids iOS touch issues with KeyboardStickyView)
  const floatingDockStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }],
  }));

  // Initialize state
  const isNewEntry = !initialEntry;
  const initialTimestamp = initialEntry?.created_at ?? initialDateMs ?? Date.now();
  const initialTags = initialEntry?.tags
    ? initialEntry.tags.split(',').filter((tag) => tag.length > 0)
    : [];

  const [timestamp, setTimestamp] = useState(initialTimestamp);
  const [title, setTitle] = useState(initialEntry?.text_title || '');
  const [content, setContent] = useState(initialEntry?.text_content || '');
  const [mood, setMood] = useState<Mood | null>(initialEntry?.mood || null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTags);
  const [showUnsavedChangesConfirm, setShowUnsavedChangesConfirm] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Original values for change detection
  const [originalValues, setOriginalValues] = useState(() => ({
    timestamp: initialTimestamp,
    title: initialEntry?.text_title || '',
    content: initialEntry?.text_content || '',
    mood: initialEntry?.mood || null,
    tagIds: initialTags,
  }));

  // Derived states
  const isEmpty = !content.trim();
  const dateLabel = formatLocalizedDate(timestamp, t, { relative: true });
  const timeLabel = formatTimeLabel(timestamp, t);
  const formattedTime = format(new Date(timestamp), 'HH:mm');
  const moodOption = mood ? MOOD_OPTIONS.find((o) => o.value === mood) : null;

  const hasUnsavedChanges =
    title !== originalValues.title ||
    content !== originalValues.content ||
    mood !== originalValues.mood ||
    timestamp !== originalValues.timestamp ||
    !areArraysEqual(selectedTagIds, originalValues.tagIds);

  const displayTags = useMemo(() => {
    return selectedTagIds
      .map((id) => tagMap.get(id))
      .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [selectedTagIds, tagMap]);

  const handleSave = async () => {
    // Validate entry content
    if (isEmpty) {
      return;
    }

    isSaving.current = true;
    const id = initialEntry?.note_id || generateUUID();

    try {
      await upsertEntryMutation.mutateAsync({
        note_id: id,
        text_title: title.trim() || null,
        text_content: content.trim(),
        mood: mood,
        assets: null,
        tags: selectedTagIds.join(','),
        created_at: timestamp,
        updated_at: Date.now(),
      });

      if (isNewEntry) {
        toast.success(t('Entry saved successfully'));
      }
      onSaveSuccess();
    } catch (error) {
      console.error('Failed to save entry:', error);
      isSaving.current = false;
      toast.error(t('Failed to save entry'));
    }
  };

  const handleDiscardChanges = () => {
    setShowUnsavedChangesConfirm(false);
    isSaving.current = true;
    // Delay closing to allow modal animation to finish or prevent race conditions
    setTimeout(() => onCancel(), MODAL_CLOSE_DELAY);
  };

  const handleRemoveTag = (tagId: string) => {
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
  };

  const handlePressCancel = () => {
    if (hasUnsavedChanges && !isEmpty) {
      Keyboard.dismiss();
      setShowUnsavedChangesConfirm(true);
    } else {
      onCancel();
    }
  };

  /**
   * Handle tag deletion in the database (via TagsModal).
   * Updates local 'originalValues' to reflect the tag is gone permanently,
   * avoiding false "Unsaved Changes" prompts.
   */
  const handleTagDeleted = (deletedTagId: string) => {
    setOriginalValues((prev) => ({
      ...prev,
      tagIds: prev.tagIds.filter((id) => id !== deletedTagId),
    }));
  };

  // Disable swipe on iOS when dirty to prevent accidental data loss
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !hasUnsavedChanges || isEmpty });
  }, [navigation, hasUnsavedChanges, isEmpty]);

  /**
   * Handle Navigation & Back Actions.
   * Intercepts 'beforeRemove' to handle Unsaved Changes or Edit Mode cancellation.
   * This covers gestures, header back button, and hardware back button.
   */
  useEffect(() => {
    if (showUnsavedChangesConfirm) return;

    const beforeRemoveListener = navigation.addListener('beforeRemove', (e) => {
      if (isSaving.current) return;

      // 1. Existing Entry: "Back" means "Cancel Edit" (switch to View Mode)
      // We prevent the default "Pop" action and instead trigger the cancel flow.
      if (!isNewEntry) {
        e.preventDefault();
        handlePressCancel();
        return;
      }

      // 2. New Entry: Only intercept if we need to warn about unsaved changes
      if (!hasUnsavedChanges || isEmpty) return;

      e.preventDefault();
      Keyboard.dismiss();
      setShowUnsavedChangesConfirm(true);
    });

    return beforeRemoveListener;
  }, [
    navigation,
    hasUnsavedChanges,
    showUnsavedChangesConfirm,
    isEmpty,
    isNewEntry,
    handlePressCancel,
  ]);

  return (
    <>
      <View className="flex-1">
        {/* Header */}
        <View className="relative flex-row items-center justify-between px-4 py-3 border-b border-border">
          {/* Cancel button */}
          <View className="z-10">
            <Button onPress={handlePressCancel} variant="link" className="p-0">
              <Text className="text-lg text-foreground/70">{t('Cancel')}</Text>
            </Button>
          </View>

          {/* Center Date/Time - Absolutely positioned */}
          <DateSelectDropdown
            className="flex-none absolute inset-0 items-center justify-center z-0"
            pointerEvents="box-none"
            timestamp={timestamp}
            onDateChange={setTimestamp}
            dateLabel={dateLabel}
            timeLabel={timeLabel}
          />

          {/* Save button */}
          <View className="z-10">
            <Button onPress={handleSave} disabled={isEmpty} variant="default">
              <Text>{t('Save')}</Text>
            </Button>
          </View>
        </View>

        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-3"
          keyboardShouldPersistTaps="handled"
          // bottomOffset so FloatingActionDock doesn't overlap with content behind
          bottomOffset={70}>
          {/* Time + Mood Row */}
          <View className="flex-row flex-wrap items-center gap-2 mb-2">
            {/* Mood label with clear badge */}
            {moodOption && (
              <View className="relative flex-row items-center px-3 py-0.5 gap-1.5 mr-2 bg-primary/50 rounded-full border border-border">
                <Text className="text-2xl">{moodOption.emoji}</Text>
                <Text className="text-sm tracking-wide font-medium text-primary-foreground">
                  {t(`Feeling ${moodOption.label}`)}
                </Text>
                {/* Clear mood button */}
                <Pressable
                  onPress={() => setMood(null)}
                  hitSlop={6}
                  className="absolute -top-0.5 -right-2 z-10">
                  <Badge
                    variant="secondary"
                    className="h-4 w-4 bg-muted-foreground border border-border shadow-lg">
                    <Icon as={X} className="text-background size-3" strokeWidth={5} />
                  </Badge>
                </Pressable>
              </View>
            )}

            {/* Time picker button */}
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setShowTimePicker(true);
              }}
              className="flex-row items-center px-3 py-2 gap-2 bg-muted border border-border rounded-full active:bg-accent">
              <Icon as={Clock} className="text-muted-foreground size-5" />
              <Text className="text-sm font-medium text-foreground">{formattedTime}</Text>
            </Pressable>
          </View>

          {/* Title Input */}
          <Textarea
            className="px-0 text-lg font-semibold text-foreground border-0 shadow-none"
            placeholder={t('Title (optional)')}
            placeholderTextColor={mutedForeground as string}
            value={title}
            onChangeText={setTitle}
          />

          {/* Content Input */}
          <Textarea
            className="text-base text-foreground leading-6 border-0 shadow-none px-0"
            textAlignVertical="top"
            placeholder={t('What are you grateful for?')}
            placeholderTextColor={mutedForeground as string}
            value={content}
            onChangeText={setContent}
            scrollEnabled={false}
          />

          {/* Tags */}
          {displayTags.length > 0 && (
            <View className="py-3">
              <View className="flex-row flex-wrap gap-3">
                {displayTags.map((tag) => (
                  <View
                    key={tag.tag_id}
                    className="relative flex-row items-center px-3 py-1.5 bg-muted rounded-full border border-border">
                    <Text className="text-sm mr-1 font-semibold text-primary-foreground">
                      #{tag.title}
                    </Text>
                    <Pressable
                      onPress={() => handleRemoveTag(tag.tag_id)}
                      hitSlop={6}
                      className="absolute -top-1 -right-1 z-10">
                      <Badge
                        variant="secondary"
                        className="h-4 w-4 bg-muted-foreground border border-border shadow-lg">
                        <Icon as={X} className="text-background size-3" strokeWidth={5} />
                      </Badge>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Bottom spacer to prevent content from being hidden behind FloatingActionDock */}
          {!isKeyboardVisible && <View className="h-28" />}
          {isKeyboardVisible && <View className="h-16" />}
        </KeyboardAwareScrollView>

        <Animated.View
          style={floatingDockStyle}
          className="absolute bottom-0 left-0 right-0">
          <FloatingActionDock
            isKeyboardVisible={isKeyboardVisible}
            mood={mood}
            onMoodChange={setMood}
            autoOpenMoodSelector={isNewEntry}
            selectedTagIds={selectedTagIds}
            onTagsChange={setSelectedTagIds}
            onTagDeleted={handleTagDeleted}
          />
        </Animated.View>
      </View>

      {/* Modals - TimePicker and AlertDialog are still here */}
      <TimePickerModal
        visible={showTimePicker}
        onClose={() => setShowTimePicker(false)}
        value={formattedTime}
        onValueChange={(time) => {
          const [hours, minutes] = time.split(':').map(Number);
          const newDate = new Date(timestamp);
          newDate.setHours(hours, minutes, 0, 0);
          setTimestamp(newDate.getTime());
        }}
      />

      <AlertDialog
        open={showUnsavedChangesConfirm}
        onOpenChange={setShowUnsavedChangesConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Leave without saving?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Your entry is unsaved. Would you like to keep editing or discard them?',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setShowUnsavedChangesConfirm(false)}>
              <Text>{t('Keep Editing')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive active:bg-destructive/90"
              onPress={handleDiscardChanges}>
              <Text className="text-destructive-foreground tracking-wider">
                {t('Discard')}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
