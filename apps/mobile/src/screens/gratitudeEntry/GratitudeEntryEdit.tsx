import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Keyboard, ActivityIndicator, type TextInput } from 'react-native';
import {
  KeyboardAwareScrollView,
  useReanimatedKeyboardAnimation,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useNavigation } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import { format } from 'date-fns';
import { Clock, FilePenLine, Plus, Shuffle, X } from 'lucide-react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import {
  MODAL_CLOSE_DELAY,
  MOOD_OPTIONS,
  MAX_PHOTOS_PER_ENTRY,
  MAX_VOICE_MEMOS_PER_ENTRY,
  SHEET_NAMES,
} from '~/constants';
import type { Entry, Mood, Asset } from '~/types';
import { useTranslation, formatLocalizedDate, formatTimeLabel } from '~/lib/i18n';
import { generateUUID } from '~/lib/utils';
import { filterExistingPhotos } from '~/lib/photoUtils';
import { filterExistingVoiceMemos } from '~/lib/voiceMemoUtils';
import { useCustomPrompts, useUpsertEntry, useTagMapping } from '~/hooks/useGratitude';
import { usePhotoSession } from '~/hooks/usePhotoSession';
import { useVoiceMemoSession } from '~/hooks/useVoiceMemoSession';
import { useWorksheetTemplate } from '~/hooks/useWorksheetTemplate';
import { useSettingsStore } from '~/lib/settings';
import { getJournalPromptTitlePool } from '~/lib/journalPrompts';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Textarea } from '~/components/ui/textarea';
import { Badge } from '~/components/ui/badge';
import { toast } from '~/components/ui/toast';
import { PolaroidPhoto } from '~/components/PolaroidPhoto';
import { AudioPlayer } from '~/components/AudioPlayer';
import {
  AlertDialog,
  AlertDialogDestructiveAction,
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
import { MoodModal } from './MoodModal';
import { PromptLibraryModal } from './PromptLibraryModal';
import { TagsModal } from './TagsModal';
import { VoiceMemoModal } from './VoiceMemoModal';
import { AddPhotoModal } from './AddPhotoModal';
import { WorksheetTemplateModal } from './WorksheetTemplateModal';

interface GratitudeEntryEditProps {
  initialEntry?: Entry | null;
  initialDateMs?: number;
  onSaveSuccess: () => void;
  onCancel: () => void;
  onPhotoPress: (photos: Asset[], index: number) => void;
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
  onPhotoPress,
}: GratitudeEntryEditProps) {
  const tagMap = useTagMapping();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { journalPromptsMode, journalFocusAreas } = useSettingsStore();
  const { data: customPromptList = [], isSuccess: isCustomPromptsLoaded } =
    useCustomPrompts();
  const customPromptTitles = useMemo(
    () => customPromptList.map((prompt) => prompt.title),
    [customPromptList],
  );
  const { resolvedWorksheetTemplate } = useWorksheetTemplate();
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const [mutedForegroundColor, foregroundColor] = useCSSVariable([
    '--color-muted-foreground',
    '--color-foreground',
  ]);

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
  const initialPhotos = filterExistingPhotos(initialEntry?.assets ?? null);
  const initialVoiceMemos = filterExistingVoiceMemos(initialEntry?.assets ?? null);

  const [timestamp, setTimestamp] = useState(initialTimestamp);
  const [title, setTitle] = useState(initialEntry?.text_title || '');
  const [content, setContent] = useState(initialEntry?.text_content || '');
  const [mood, setMood] = useState<Mood | null>(initialEntry?.mood || null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTags);
  const [showUnsavedChangesConfirm, setShowUnsavedChangesConfirm] = useState(false);

  const [isAddPhotoVisible, setIsAddPhotoVisible] = useState(false);
  const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [isContentFocused, setIsContentFocused] = useState(false);
  const titleInputRef = useRef<TextInput>(null);
  const contentInputRef = useRef<TextInput>(null);
  const hasPromptTitle = title.length > 0;
  const hasAttemptedAutoFill = useRef(false);

  // Auto-fill prompt title for new entries based on settings
  useEffect(() => {
    if (!isNewEntry || hasAttemptedAutoFill.current || journalPromptsMode === 'off') {
      return;
    }

    const needsCustom = journalPromptsMode === 'custom' || journalPromptsMode === 'all';
    if (needsCustom && !isCustomPromptsLoaded) {
      return; // wait until custom prompts are loaded
    }

    const pool = getJournalPromptTitlePool({
      mode: journalPromptsMode,
      focusAreas: journalFocusAreas,
      customPromptTitles,
      t,
    });

    if (pool.length > 0) {
      const randomPrompt = pool[Math.floor(Math.random() * pool.length)];
      if (randomPrompt) setTitle(randomPrompt);
    }

    hasAttemptedAutoFill.current = true;
  }, [
    isNewEntry,
    journalPromptsMode,
    journalFocusAreas,
    customPromptTitles,
    isCustomPromptsLoaded,
    t,
  ]);

  // Auto-open mood modal for new entries (run once on mount).
  // We wait for 'transitionEnd' so iOS doesn't throw "No presenting view
  // controller found" while the navigation push animation is still running.
  useEffect(() => {
    if (!isNewEntry) return;
    const unsubscribe = navigation.addListener('transitionEnd' as any, () => {
      TrueSheet.present(SHEET_NAMES.MOOD);
      unsubscribe(); // fire once, then clean up
    });
    return unsubscribe;
  }, [isNewEntry, navigation]);

  // Photo session: tracks additions/removals and handles disk cleanup
  const {
    photos,
    isAddingPhotos,
    photoUris,
    handlePhotosPicked,
    removePhoto,
    commitRemovedPhotos,
    discardAllChanges: discardPhotoChanges,
  } = usePhotoSession(initialPhotos);

  // Voice memo session: same pattern as photos
  const {
    voiceMemos,
    voiceMemoUris,
    handleVoiceMemoSaved,
    removeVoiceMemo,
    commitRemovedVoiceMemos,
    discardAllChanges: discardVoiceMemoChanges,
  } = useVoiceMemoSession(initialVoiceMemos);

  // Limit-check handlers — gate modal opening with max-count toasts
  const handlePhotoRequest = useCallback(() => {
    const remaining = MAX_PHOTOS_PER_ENTRY - photos.length;
    if (remaining <= 0) {
      toast.warning(
        t('Maximum {count} photos per entry', { count: String(MAX_PHOTOS_PER_ENTRY) }),
      );
      return;
    }
    setIsAddPhotoVisible(true);
  }, [photos.length, t]);

  const handleVoiceMemoRequest = useCallback(() => {
    const remaining = MAX_VOICE_MEMOS_PER_ENTRY - voiceMemos.length;
    if (remaining <= 0) {
      toast.warning(
        t('Maximum {count} voice memos per entry', {
          count: String(MAX_VOICE_MEMOS_PER_ENTRY),
        }),
      );
      return;
    }
    TrueSheet.present(SHEET_NAMES.VOICE_MEMO);
  }, [voiceMemos.length, t]);

  // Original values for change detection
  const [originalValues, setOriginalValues] = useState(() => ({
    timestamp: initialTimestamp,
    title: initialEntry?.text_title || '',
    content: initialEntry?.text_content || '',
    mood: initialEntry?.mood || null,
    tagIds: initialTags,
    photoUris: initialPhotos.map((p) => p.uri),
    voiceMemoUris: initialVoiceMemos.map((m) => m.uri),
  }));

  // Derived states
  // Save is allowed when at least one substantive field has data.
  // Tags alone are NOT sufficient — they need at least one other field.
  const canSave =
    !!title.trim() ||
    !!content.trim() ||
    mood !== null ||
    photos.length > 0 ||
    voiceMemos.length > 0;
  const dateLabel = formatLocalizedDate(timestamp, t, { relative: true });
  const timeLabel = formatTimeLabel(timestamp, t);
  const formattedTime = format(new Date(timestamp), 'HH:mm');
  const moodOption = mood ? MOOD_OPTIONS.find((o) => o.value === mood) : null;

  const hasUnsavedChanges =
    title !== originalValues.title ||
    content !== originalValues.content ||
    mood !== originalValues.mood ||
    timestamp !== originalValues.timestamp ||
    !areArraysEqual(selectedTagIds, originalValues.tagIds) ||
    !areArraysEqual(photoUris, originalValues.photoUris) ||
    !areArraysEqual(voiceMemoUris, originalValues.voiceMemoUris);

  const displayTags = useMemo(() => {
    return selectedTagIds
      .map((id) => tagMap.get(id))
      .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [selectedTagIds, tagMap]);

  const availablePromptTitles = useMemo(
    () =>
      getJournalPromptTitlePool({
        mode: journalPromptsMode,
        focusAreas: journalFocusAreas,
        customPromptTitles,
        t,
      }),
    [journalPromptsMode, journalFocusAreas, customPromptTitles, t],
  );

  const handleSave = async () => {
    if (!canSave) return;

    isSaving.current = true;
    const id = initialEntry?.note_id || generateUUID();

    // Build the combined assets array (photos + voice memos)
    const allAssets: Asset[] = [...photos, ...voiceMemos];

    try {
      await upsertEntryMutation.mutateAsync({
        note_id: id,
        text_title: title.trim() || null,
        text_content: content.trim() || null,
        mood: mood,
        assets: allAssets.length > 0 ? allAssets : null,
        tags: selectedTagIds.join(','),
        created_at: timestamp,
        updated_at: Date.now(),
      });

      // Delete files that were removed during this editing session.
      // Best-effort: runs only after a successful save to prevent data loss
      // if the upsert fails (DB would still reference the files).
      commitRemovedPhotos();
      commitRemovedVoiceMemos();

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
    // Clean up all newly-added files; leave originals untouched.
    discardPhotoChanges();
    discardVoiceMemoChanges();

    setShowUnsavedChangesConfirm(false);
    isSaving.current = true;
    // Delay closing to allow modal animation to finish or prevent race conditions
    setTimeout(() => onCancel(), MODAL_CLOSE_DELAY);
  };

  const handleRemoveTag = (tagId: string) => {
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
  };

  const handlePressCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      Keyboard.dismiss();
      setShowUnsavedChangesConfirm(true);
    } else {
      onCancel();
    }
  }, [hasUnsavedChanges, onCancel]);

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

  // Disable swipe on iOS whenever there are any unsaved changes
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !hasUnsavedChanges });
  }, [navigation, hasUnsavedChanges]);

  const handleOpenPromptLibrary = () => {
    Keyboard.dismiss();
    TrueSheet.present(SHEET_NAMES.PROMPT_LIBRARY);
  };

  const handleRandomPrompt = useCallback(() => {
    if (availablePromptTitles.length === 0) return;

    const pool = availablePromptTitles.filter((promptTitle) => promptTitle !== title);
    const candidatePool = pool.length > 0 ? pool : availablePromptTitles;
    const nextPrompt =
      candidatePool[Math.floor(Math.random() * candidatePool.length)] ?? candidatePool[0];

    if (nextPrompt) {
      // Focus the title input only on first prompt ("Add Prompt" state)
      const shouldFocus = !title;
      setTitle(nextPrompt);
      if (shouldFocus) {
        setTimeout(() => titleInputRef.current?.focus(), 100);
      }
    }
  }, [availablePromptTitles, title]);

  const handleOpenWorksheetModal = () => {
    Keyboard.dismiss();
    TrueSheet.present(SHEET_NAMES.WORKSHEET_TEMPLATE);
  };

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

      // 2. New Entry: Intercept only when there are unsaved changes
      if (!hasUnsavedChanges) return;

      e.preventDefault();
      handlePressCancel();
    });

    return beforeRemoveListener;
  }, [
    navigation,
    hasUnsavedChanges,
    showUnsavedChangesConfirm,
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
            <Button onPress={handleSave} disabled={!canSave} variant="default">
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
              <Button
                variant="ghost"
                size="none"
                onPress={() => TrueSheet.present(SHEET_NAMES.MOOD)}
                className="relative flex-row items-center px-3 py-0.5 gap-1.5 mr-2 bg-primary/50 active:bg-primary/60 transition-colors rounded-lg border border-border">
                <Text className="text-2xl">{moodOption.emoji}</Text>
                <Text className="text-sm tracking-wide font-body-medium text-primary-foreground">
                  {t(`Feeling ${moodOption.label}`)}
                </Text>
                {/* Clear mood button */}
                <Button
                  variant="ghost"
                  size="none"
                  onPress={() => setMood(null)}
                  hitSlop={6}
                  className="absolute -top-1 -right-2 z-10 rounded-full">
                  <Badge
                    variant="secondary"
                    className="h-4 w-4 bg-muted-foreground border border-border shadow-lg">
                    <Icon as={X} className="text-background size-3" strokeWidth={5} />
                  </Badge>
                </Button>
              </Button>
            )}

            {/* Time picker button */}
            <Button
              variant="secondary"
              onPress={() => {
                Keyboard.dismiss();
                setIsTimePickerVisible(true);
              }}
              className="flex-row items-center px-3 h-9 gap-2">
              <Icon as={Clock} className="text-muted-foreground size-5" />
              <Text className="text-sm font-body-medium text-foreground">
                {formattedTime}
              </Text>
            </Button>
          </View>

          {/* Title Input — Text when unfocused to prevent Android focus-forwarding */}
          {isTitleFocused ? (
            <Textarea
              ref={titleInputRef}
              className="px-0 min-h-0 text-lg font-body-semibold text-foreground border-0 shadow-none"
              placeholder={t('Title (optional)')}
              placeholderTextColor={mutedForegroundColor as string}
              value={title}
              onChangeText={setTitle}
              onBlur={() => setIsTitleFocused(false)}
            />
          ) : (
            <Text
              onPress={() => {
                setIsTitleFocused(true);
                setTimeout(() => titleInputRef.current?.focus(), 50);
              }}
              className="px-0 py-1.5 text-lg font-body-semibold text-foreground">
              {title || (
                <Text className="text-lg font-body-semibold" style={{ color: mutedForegroundColor as string }}>
                  {t('Title (optional)')}
                </Text>
              )}
            </Text>
          )}

          {/* Prompt Actions — shown when title is focused, or content is focused with no text */}
          {(isTitleFocused || (isContentFocused && content.length === 0)) && (
            <View className="flex-row items-center gap-2 mt-0 mb-4">
              {availablePromptTitles.length > 0 && (
                <Button
                  variant="secondary"
                  onPress={handleRandomPrompt}
                  className="h-10 rounded-full px-4 flex-row items-center gap-1.5">
                  <Icon
                    as={hasPromptTitle ? Shuffle : Plus}
                    className="text-secondary-foreground size-4"
                  />
                  <Text className="text-secondary-foreground text-sm font-body-bold">
                    {hasPromptTitle ? t('New Prompt') : t('Add Prompt')}
                  </Text>
                </Button>
              )}

              <Button
                variant="secondary"
                size="icon"
                onPress={handleOpenWorksheetModal}
                className="h-10 w-10 rounded-full">
                <Icon as={FilePenLine} className="text-secondary-foreground size-4" />
              </Button>

              {hasPromptTitle && availablePromptTitles.length > 0 && (
                <Button
                  variant="link"
                  size="none"
                  onPress={handleOpenPromptLibrary}
                  className="ml-auto">
                  <Text className="text-base font-body text-foreground">
                    {t('Show All')}
                  </Text>
                </Button>
              )}
            </View>
          )}

          {/* Content Input — Text when unfocused to prevent Android focus-forwarding */}
          {isContentFocused ? (
            <Textarea
              ref={contentInputRef}
              className="min-h-0 text-base text-foreground leading-6 border-0 shadow-none px-0"
              textAlignVertical="top"
              placeholder={t('What are you grateful for?')}
              placeholderTextColor={mutedForegroundColor as string}
              value={content}
              onChangeText={setContent}
              onBlur={() => setIsContentFocused(false)}
              scrollEnabled={false}
            />
          ) : (
            <Text
              onPress={() => {
                setIsContentFocused(true);
                setTimeout(() => contentInputRef.current?.focus(), 50);
              }}
              className="px-0 py-1.5 text-base text-foreground leading-6">
              {content || (
                <Text className="text-base leading-6" style={{ color: mutedForegroundColor as string }}>
                  {t('What are you grateful for?')}
                </Text>
              )}
            </Text>
          )}

          {/* Tags */}
          {displayTags.length > 0 && (
            <View className="py-3">
              <View className="flex-row flex-wrap gap-3">
                {displayTags.map((tag) => (
                  <View
                    key={tag.tag_id}
                    className="relative flex-row items-center px-3 py-1.5 bg-muted rounded-lg border border-border">
                    <Text className="text-sm mr-1 font-body-semibold text-primary-foreground">
                      #{tag.title}
                    </Text>
                    <Button
                      variant="ghost"
                      size="none"
                      onPress={() => handleRemoveTag(tag.tag_id)}
                      hitSlop={6}
                      className="absolute -top-1 -right-1 z-10 rounded-full">
                      <Badge
                        variant="secondary"
                        className="h-4 w-4 bg-muted-foreground border border-border shadow-lg">
                        <Icon as={X} className="text-background size-3" strokeWidth={5} />
                      </Badge>
                    </Button>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Voice memo players */}
          {voiceMemos.length > 0 && (
            <View className="py-3 gap-3">
              {voiceMemos.map((memo) => (
                <AudioPlayer
                  key={memo.uri}
                  uri={memo.uri}
                  onRemove={() => removeVoiceMemo(memo.uri)}
                />
              ))}
            </View>
          )}

          {/* Photos */}
          {(photos.length > 0 || isAddingPhotos) && (
            <View className="py-3 gap-4">
              {photos.map((photo, index) => (
                <PolaroidPhoto
                  key={photo.uri}
                  photo={photo}
                  onRemove={() => removePhoto(photo.uri)}
                  onPress={() => onPhotoPress(photos, index)}
                />
              ))}
              {isAddingPhotos && (
                <View className="items-center py-4">
                  <ActivityIndicator size="large" color={foregroundColor as string} />
                </View>
              )}
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
            onRequestMoodModal={() => TrueSheet.present(SHEET_NAMES.MOOD)}
            onRequestTagsModal={() => TrueSheet.present(SHEET_NAMES.TAGS)}
            onRequestVoiceMemoModal={handleVoiceMemoRequest}
            onRequestAddPhotoModal={handlePhotoRequest}
          />
        </Animated.View>
      </View>

      {/* Modals — rendered at root level so BottomSheet backdrop covers full screen */}
      <MoodModal value={mood} onChange={setMood} />

      <PromptLibraryModal onPromptSelect={setTitle} />

      <WorksheetTemplateModal
        onApplyTemplate={() =>
          setContent((prev) => {
            if (!prev.trim()) return resolvedWorksheetTemplate;
            return `${prev}\n${resolvedWorksheetTemplate}`;
          })
        }
      />

      <TagsModal
        selectedTagIds={selectedTagIds}
        onTagsChange={setSelectedTagIds}
        onTagDeleted={handleTagDeleted}
      />

      <VoiceMemoModal onVoiceMemoSaved={handleVoiceMemoSaved} />

      <AddPhotoModal
        visible={isAddPhotoVisible}
        onClose={() => setIsAddPhotoVisible(false)}
        currentPhotoCount={photos.length}
        onPhotosPicked={handlePhotosPicked}
      />

      <TimePickerModal
        visible={isTimePickerVisible}
        onClose={() => setIsTimePickerVisible(false)}
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
            <AlertDialogDestructiveAction onPress={handleDiscardChanges}>
              <Text>{t('Discard')}</Text>
            </AlertDialogDestructiveAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
