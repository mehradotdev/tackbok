import { useState, useEffect } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Plus, X, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react-native';
import { type Tag } from '~/types';
import { cn } from '~/lib/utils';
import { useTranslation } from '~/lib/i18n';
import { useUpdateTag, useDeleteTag, useTags, useCreateTag } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { toast } from '~/components/ui/toast';
import { BottomSheet } from '~/components/ui/BottomSheet';
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

// ============================================================================
// Types
// ============================================================================

interface ITagsModalProps {
  visible: boolean;
  onClose: () => void;
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  onTagDeleted?: (tagId: string) => void;
}

type ViewState = 'select' | 'create' | 'edit';

// ============================================================================
// Component
// ============================================================================

export function TagsModal({
  visible,
  onClose,
  selectedTagIds,
  onTagsChange,
  onTagDeleted,
}: ITagsModalProps) {
  const { t, isRTL } = useTranslation();
  const { data: allTags = [] } = useTags();
  const [viewState, setViewState] = useState<ViewState>('select');
  const [tagInputValue, setTagInputValue] = useState('');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

  const updateTagMutation = useUpdateTag();
  const deleteTagMutation = useDeleteTag();
  const createTagMutation = useCreateTag();

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setViewState('select');
      setTagInputValue('');
      setEditingTag(null);
      setTagToDelete(null);
      setDeleteDialogOpen(false);
    }
  }, [visible]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleCreateTag = async () => {
    // Sanitize: replace commas with spaces to avoid CSV issues
    const trimmed = tagInputValue.replace(/,/g, ' ').trim();
    if (!trimmed) return;

    // Check if tag already exists
    const exists = allTags.some(
      (tag) => tag.title.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      toast.error(t('Tag already exists'));
      setTagInputValue('');
      setViewState('select');
      return;
    }

    try {
      await createTagMutation.mutateAsync(trimmed);
      toast.success(t('Tag created'));
      setTagInputValue('');
      setViewState('select');
    } catch (error) {
      console.error('Failed to create tag', error);
      toast.error(t('Failed to create tag'));
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTag) return;
    // Sanitize: replace commas with spaces to avoid CSV issues
    const trimmed = tagInputValue.replace(/,/g, ' ').trim();
    if (!trimmed) return;

    // Check if another tag already has this name
    const exists = allTags.some(
      (tag) =>
        tag.tag_id !== editingTag.tag_id &&
        tag.title.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      toast.error(t('Tag already exists'));
      return;
    }

    try {
      await updateTagMutation.mutateAsync({ tagId: editingTag.tag_id, title: trimmed });
      toast.success(t('Tag updated'));
      setTagInputValue('');
      setEditingTag(null);
      setViewState('select');
    } catch (error) {
      console.error('Failed to update tag', error);
      toast.error(t('Failed to update tag'));
    }
  };

  const handleDeleteTag = async () => {
    if (!tagToDelete) return;

    try {
      await deleteTagMutation.mutateAsync(tagToDelete.tag_id);
      toast.success(t('Tag deleted'));

      // Remove from local selection only after successful delete
      if (selectedTagIds.includes(tagToDelete.tag_id)) {
        onTagsChange(selectedTagIds.filter((id) => id !== tagToDelete.tag_id));
      }

      // Clean up parent state if needed (e.g. originalValues)
      onTagDeleted?.(tagToDelete.tag_id);
    } catch (error) {
      console.error('Failed to delete tag', error);
      toast.error(t('Failed to delete tag'));
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

  const handleEditPress = (tag: Tag) => {
    setEditingTag(tag);
    setTagInputValue(tag.title);
    setViewState('edit');
  };

  const handleDeletePress = (tag: Tag) => {
    setTagToDelete(tag);
    setDeleteDialogOpen(true);
  };

  const handleBackPress = () => {
    setViewState('select');
    setTagInputValue('');
    setEditingTag(null);
  };

  const handleCreateNewPress = () => {
    setTagInputValue('');
    setViewState('create');
  };

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const renderHeader = () => {
    const isFormView = viewState === 'create' || viewState === 'edit';
    const title =
      viewState === 'create'
        ? t('Create New Tag')
        : viewState === 'edit'
          ? t('Edit Tag')
          : t('Add a Tag');

    return (
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        {/* Left side: Back button (only in form views) or empty space */}
        <View className="w-10">
          {isFormView && (
            <Pressable onPress={handleBackPress} hitSlop={10}>
              <Icon
                as={!isRTL ? ChevronLeft : ChevronRight}
                className="text-foreground"
                size={24}
              />
            </Pressable>
          )}
        </View>

        {/* Title */}
        <Text className="text-foreground text-lg font-semibold leading-none flex-1 text-center">
          {title}
        </Text>

        {/* Right side: Close button */}
        <View className="w-10 items-end">
          <Pressable onPress={onClose} hitSlop={10}>
            <Icon as={X} className="text-muted-foreground" size={20} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderTagItem = (tag: Tag) => {
    const isSelected = selectedTagIds.includes(tag.tag_id);

    return (
      <View key={tag.tag_id} className="flex-row items-center pt-2">
        {/* Checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => handleTagToggle(tag)}
          className="mr-3"
        />

        {/* Tag name - takes remaining space */}
        <Pressable onPress={() => handleTagToggle(tag)} className="flex-1">
          <Text className="text-base text-foreground">#{tag.title}</Text>
        </Pressable>

        {/* Edit button */}
        <Pressable onPress={() => handleEditPress(tag)} hitSlop={8} className="p-2 mr-4">
          <Icon as={Pencil} className="text-muted-foreground" size={18} />
        </Pressable>

        {/* Delete button */}
        <Pressable
          onPress={() => handleDeletePress(tag)}
          hitSlop={8}
          className="p-2 pr-0">
          <Icon as={Trash2} className="text-destructive" size={18} />
        </Pressable>
      </View>
    );
  };

  const renderSelectView = () => (
    <View className="px-4 pt-2 pb-4">
      {allTags.length > 0 && (
        <ScrollView className="max-h-50" contentContainerClassName="pb-4">
          {allTags.map((tag) => renderTagItem(tag))}
        </ScrollView>
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
    const isCreateView = viewState === 'create';
    const buttonText = isCreateView ? t('Create') : t('Save');
    const placeholderText = t('Tag name');
    const isDisabled = !tagInputValue.trim();

    return (
      <View className="px-4 py-4">
        {/* Input field */}
        <Input
          className="mb-4"
          placeholder={placeholderText}
          value={tagInputValue}
          onChangeText={setTagInputValue}
          autoFocus
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
      <BottomSheet isOpen={visible} onClose={onClose}>
        <View>
          {renderHeader()}

          {viewState === 'select' ? renderSelectView() : renderFormView()}
        </View>
      </BottomSheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Tag')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Are you sure you want to delete the tag?')} "{tagToDelete?.title}"
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setDeleteDialogOpen(false)}>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={handleDeleteTag}
              className="bg-destructive active:bg-destructive/90">
              <Text className="text-destructive-foreground">{t('Delete')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
