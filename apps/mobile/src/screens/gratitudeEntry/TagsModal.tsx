import { useState, useRef, useCallback } from 'react';
import { View, ScrollView, type TextInput } from 'react-native';
import { Plus, X, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { cn } from 'tailwind-variants';
import { type Tag } from '~/types';
import { SHEET_NAMES } from '~/constants';
import { useTranslation } from '~/lib/i18n';
import { sanitizeTagName } from '~/lib/utils';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { useUpdateTag, useDeleteTag, useTags, useCreateTag } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { toast } from '~/components/ui/toast';
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

// ============================================================================
// Types
// ============================================================================

interface ITagsModalProps {
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  onTagDeleted?: (tagId: string) => void;
}

type EditorMode = 'create' | 'edit';
type QueuedTagSubmission =
  | {
      mode: 'create';
      title: string;
    }
  | {
      mode: 'edit';
      title: string;
      tag: Tag;
    };

const SELECT_TAG_LIST_MAX_HEIGHT = 200;
const TAGS_EDITOR_SHEET_NAME = `${SHEET_NAMES.TAGS}-editor`;

const normalizeTagTitle = (title: string) => title.toLowerCase();

// Keep the scrollable select list and the short create/edit form in separate
// TrueSheet instances. Android sizing became unreliable when one presented
// sheet had to morph between these very different layouts in place.
//
// The editor sheet is intentionally a dumb draft collector. The select sheet
// owns validation, mutations, and toast handling after the editor dismisses.

// ============================================================================
// Component
// ============================================================================

export function TagsModal({
  selectedTagIds,
  onTagsChange,
  onTagDeleted,
}: ITagsModalProps) {
  const { t, isRTL } = useTranslation();
  const { data: allTags = [] } = useTags();
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [tagInputValue, setTagInputValue] = useState('');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
  const [queuedSubmission, setQueuedSubmission] = useState<QueuedTagSubmission | null>(null);
  const isProcessingSubmissionRef = useRef(false);
  const tagInputRef = useRef<TextInput>(null);
  const presentSheet = useCallback((sheetName: string) => {
    TrueSheet.present(sheetName).catch(() => {});
  }, []);

  const dismissSheet = useCallback((sheetName: string) => {
    return TrueSheet.dismiss(sheetName).catch(() => {});
  }, []);

  const dismissSheetStack = useCallback((sheetName: string) => {
    return TrueSheet.dismissStack(sheetName).catch(() => {});
  }, []);

  const resetEditorState = useCallback(() => {
    setEditorMode('create');
    setTagInputValue('');
    setEditingTag(null);
  }, []);

  const dismissEditor = useCallback(() => {
    dismissSheetStack(SHEET_NAMES.TAGS);
  }, [dismissSheetStack]);

  const closeTagsFlow = useCallback(() => {
    dismissSheet(SHEET_NAMES.TAGS);
  }, [dismissSheet]);

  const openEditor = useCallback(
    (
      nextEditorMode: EditorMode,
      options?: { tag?: Tag },
    ) => {
      if (nextEditorMode === 'edit' && options?.tag) {
        setEditingTag(options.tag);
        setTagInputValue(options.tag.title);
      } else {
        setEditingTag(null);
        setTagInputValue('');
      }

      setEditorMode(nextEditorMode);

      presentSheet(TAGS_EDITOR_SHEET_NAME);
    },
    [presentSheet],
  );

  const updateTagMutation = useUpdateTag();
  const deleteTagMutation = useDeleteTag();
  const createTagMutation = useCreateTag();

  const hasConflictingTag = useCallback(
    (title: string, excludedTagId?: string) => {
      const normalizedTitle = normalizeTagTitle(title);

      return allTags.some(
        (tag) =>
          tag.tag_id !== excludedTagId && normalizeTagTitle(tag.title) === normalizedTitle,
      );
    },
    [allTags],
  );

  const processQueuedSubmission = useCallback(async () => {
    if (!queuedSubmission || isProcessingSubmissionRef.current) {
      return;
    }

    isProcessingSubmissionRef.current = true;
    setQueuedSubmission(null);

    try {
      if (queuedSubmission.mode === 'create') {
        if (hasConflictingTag(queuedSubmission.title)) {
          toast.error(t('Tag already exists'), { useModal: true });
          return;
        }

        await createTagMutation.mutateAsync(queuedSubmission.title);
        toast.success(t('Tag created'), { useModal: true });
        return;
      }

      if (hasConflictingTag(queuedSubmission.title, queuedSubmission.tag.tag_id)) {
        toast.error(t('Tag already exists'), { useModal: true });
        return;
      }

      await updateTagMutation.mutateAsync({
        tagId: queuedSubmission.tag.tag_id,
        title: queuedSubmission.title,
      });
      toast.success(t('Tag updated'), { useModal: true });
    } catch (error) {
      console.error(
        queuedSubmission.mode === 'create' ? 'Failed to create tag' : 'Failed to update tag',
        error,
      );
      toast.error(
        t(queuedSubmission.mode === 'create' ? 'Failed to create tag' : 'Failed to update tag'),
        { useModal: true },
      );
    } finally {
      isProcessingSubmissionRef.current = false;
    }
  }, [createTagMutation, hasConflictingTag, queuedSubmission, t, updateTagMutation]);

  const handleEditorSheetDismiss = () => {
    resetEditorState();
    setTagToDelete(null);
    setDeleteDialogOpen(false);
  };

  // ============================================================================
  // Handlers
  // ============================================================================

  const submitEditorDraft = useCallback(() => {
    const trimmed = sanitizeTagName(tagInputValue);
    if (!trimmed) return;

    if (editorMode === 'edit' && editingTag) {
      setQueuedSubmission({ mode: 'edit', tag: editingTag, title: trimmed });
    } else {
      setQueuedSubmission({ mode: 'create', title: trimmed });
    }

    dismissEditor();
  }, [dismissEditor, editingTag, editorMode, tagInputValue]);

  const handleCreateTag = submitEditorDraft;

  const handleUpdateTag = submitEditorDraft;

  const handleDeleteTag = async () => {
    if (!tagToDelete) return;

    try {
      await deleteTagMutation.mutateAsync(tagToDelete.tag_id);
      toast.success(t('Tag deleted'), { useModal: true });

      // Remove from local selection only after successful delete
      if (selectedTagIds.includes(tagToDelete.tag_id)) {
        onTagsChange(selectedTagIds.filter((id) => id !== tagToDelete.tag_id));
      }

      // Clean up parent state if needed (e.g. originalValues)
      onTagDeleted?.(tagToDelete.tag_id);
    } catch (error) {
      console.error('Failed to delete tag', error);
      toast.error(t('Failed to delete tag'), { useModal: true });
    }
    setTagToDelete(null);
    setDeleteDialogOpen(false);
  };

  const handleTagToggle = (tag: Tag) => {
    const isSelected = selectedTagIds.includes(tag.tag_id);

    if (isSelected) {
      // Remove tag
      onTagsChange(selectedTagIds.filter((id) => id !== tag.tag_id));
    } else {
      // Add tag
      onTagsChange([...selectedTagIds, tag.tag_id]);
    }
  };

  const handleEditPress = useCallback(
    (tag: Tag) => {
      openEditor('edit', { tag });
    },
    [openEditor],
  );

  const handleDeletePress = (tag: Tag) => {
    setTagToDelete(tag);
    setDeleteDialogOpen(true);
  };

  const handleBackPress = () => {
    dismissEditor();
  };

  const handleCreateNewPress = useCallback(() => {
    openEditor('create');
  }, [openEditor]);

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const renderHeader = ({
    title,
    onClose,
    showBack = false,
  }: {
    title: string;
    onClose: () => void;
    showBack?: boolean;
  }) => {
    return (
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        {/* Left side: Back button (only in form views) or empty space */}
        <View className="w-10">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onPress={handleBackPress}
              accessibilityLabel={t('Back')}
              hitSlop={10}
              className="w-8 h-8 px-0">
              <Icon
                as={!isRTL ? ChevronLeft : ChevronRight}
                className="text-foreground"
                size={24}
              />
            </Button>
          )}
        </View>

        {/* Title */}
        <Text className="text-foreground text-lg font-body-semibold leading-tight flex-1 text-center">
          {title}
        </Text>

        {/* Right side: Close button */}
        <View className="w-10 items-end">
          <Button
            variant="ghost"
            size="icon"
            onPress={onClose}
            accessibilityLabel={t('Close')}
            hitSlop={10}
            className="w-8 h-8">
            <Icon as={X} className="text-muted-foreground" size={20} />
          </Button>
        </View>
      </View>
    );
  };

  const renderTagItem = (tag: Tag, isLast: boolean) => {
    const isSelected = selectedTagIds.includes(tag.tag_id);

    return (
      <View
        key={tag.tag_id}
        className={cn(
          'flex-row items-center px-3 py-3',
          !isLast && 'border-b border-border',
        )}>
        {/* Checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => handleTagToggle(tag)}
          className="mr-3"
        />

        {/* Tag name - takes remaining space */}
        <Button
          variant="ghost"
          size="flex"
          onPress={() => handleTagToggle(tag)}
          className="flex-1 justify-start h-auto py-1">
          <Text className="text-base text-foreground font-body-medium">#{tag.title}</Text>
        </Button>

        {/* Actions */}
        <View className="flex-row items-center ml-2">
          {/* Edit button */}
          <Button
            variant="ghost"
            size="icon"
            onPress={() => handleEditPress(tag)}
            accessibilityLabel={t('Edit Tag')}
            hitSlop={8}
            className="w-8 h-8 mr-1">
            <Icon as={Pencil} className="text-muted-foreground" size={18} />
          </Button>

          {/* Delete button */}
          <Button
            variant="ghost"
            size="icon"
            onPress={() => handleDeletePress(tag)}
            accessibilityLabel={t('Delete Tag')}
            hitSlop={8}
            className="w-8 h-8">
            <Icon as={Trash2} className="text-destructive" size={18} />
          </Button>
        </View>
      </View>
    );
  };

  const renderSelectView = () => (
    <View className="px-4 pt-2 pb-4">
      {allTags.length > 0 && (
        <View className="bg-card rounded-lg border border-border overflow-hidden mb-4">
          <View style={{ maxHeight: SELECT_TAG_LIST_MAX_HEIGHT }}>
            <ScrollView style={{ flexGrow: 0 }} contentContainerClassName="p-0" nestedScrollEnabled>
              {allTags.map((tag, index) =>
                renderTagItem(tag, index === allTags.length - 1),
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Create new tag button */}
      <Button
        variant="outline"
        onPress={handleCreateNewPress}
        className="flex-row items-center justify-center gap-2 mt-0">
        <Icon as={Plus} className="text-foreground" size={18} />
        <Text>{t('Create New Tag')}</Text>
      </Button>
    </View>
  );

  const renderFormView = () => {
    const isCreateView = editorMode === 'create';
    const buttonText = isCreateView ? t('Create') : t('Save');
    const placeholderText = t('Tag name');
    const isDisabled = !tagInputValue.trim();

    return (
      // <View className="flex-1 justify-between px-4 py-4">
      <View className="px-4 py-4">
        {/* Input field */}
        <Input
          ref={tagInputRef}
          className="mb-4"
          placeholder={placeholderText}
          value={tagInputValue}
          onChangeText={setTagInputValue}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={isCreateView ? handleCreateTag : handleUpdateTag}
        />

        {/* Submit button */}
        <Button
          onPress={isCreateView ? handleCreateTag : handleUpdateTag}
          disabled={isDisabled}
          className={cn(isDisabled && 'opacity-50')}>
          <Text>{buttonText}</Text>
        </Button>
      </View>
    );
  };

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <>
      <TrueSheet
        name={SHEET_NAMES.TAGS}
        detents={['auto']}
        cornerRadius={sheetRadius}
        grabber={true}
        grabberOptions={{
          topMargin: 8,
          color: mutedFgColor as string,
          adaptive: false,
        }}
        backgroundColor={backgroundColor as string}
        onDidFocus={processQueuedSubmission}>
        <View className="pt-2">
          {renderHeader({
            title: t('Add a Tag'),
            onClose: closeTagsFlow,
          })}

          {renderSelectView()}
        </View>
      </TrueSheet>

      <TrueSheet
        name={TAGS_EDITOR_SHEET_NAME}
        detents={['auto']}
        cornerRadius={sheetRadius}
        grabber={true}
        grabberOptions={{
          topMargin: 8,
          color: mutedFgColor as string,
          adaptive: false,
        }}
        backgroundColor={backgroundColor as string}
        onDidPresent={() => {
          setTimeout(() => {
            tagInputRef.current?.focus();
          }, 200);
        }}
        onDidDismiss={handleEditorSheetDismiss}>
        <View className="pt-2">
          {renderHeader({
            title: editorMode === 'edit' ? t('Edit Tag') : t('Create New Tag'),
            onClose: dismissEditor,
            showBack: true,
          })}

          {renderFormView()}
        </View>
      </TrueSheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent
          androidOverlayStrategy="modal"
          className={sheetRadius === 0 ? 'rounded-none' : ''}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Tag')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Are you sure you want to delete the tag "{title}"?', {
                title: tagToDelete?.title ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setDeleteDialogOpen(false)}>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogDestructiveAction onPress={handleDeleteTag}>
              <Text>{t('Delete')}</Text>
            </AlertDialogDestructiveAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
