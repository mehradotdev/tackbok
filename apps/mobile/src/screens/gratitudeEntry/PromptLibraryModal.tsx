import { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useCSSVariable } from 'uniwind';
import { cn } from 'tailwind-variants';
import { SHEET_NAMES } from '~/constants';
import type { CustomPrompt } from '~/types';
import {
  useCreateCustomPrompt,
  useCustomPrompts,
  useDeleteCustomPrompt,
  useUpdateCustomPrompt,
} from '~/hooks/useGratitude';
import {
  BUILT_IN_JOURNAL_PROMPTS,
  JOURNAL_PROMPT_CATEGORIES,
  type JournalPromptCategoryId,
} from '~/lib/journalPrompts';
import { useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { sanitizePromptTitle } from '~/db/queries';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { toast } from '~/components/ui/toast';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogDestructiveAction,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';

interface PromptLibraryModalProps {
  onPromptSelect: (promptTitle: string) => void;
}

type ViewState = 'browse' | 'create' | 'edit';

export function PromptLibraryModal({ onPromptSelect }: PromptLibraryModalProps) {
  const { t, isRTL } = useTranslation();
  const journalFocusAreas = useSettingsStore((s) => s.journalFocusAreas);
  const { data: customPromptList = [] } = useCustomPrompts();
  const createPromptMutation = useCreateCustomPrompt();
  const updatePromptMutation = useUpdateCustomPrompt();
  const deletePromptMutation = useDeleteCustomPrompt();
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;

  const [viewState, setViewState] = useState<ViewState>('browse');
  const [activeCategoryId, setActiveCategoryId] =
    useState<JournalPromptCategoryId>('custom');
  const [promptInputValue, setPromptInputValue] = useState('');
  const [editingPrompt, setEditingPrompt] = useState<CustomPrompt | null>(null);
  const [promptToDelete, setPromptToDelete] = useState<CustomPrompt | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const builtInPrompts = useMemo(() => {
    if (activeCategoryId === 'custom') return [];
    return BUILT_IN_JOURNAL_PROMPTS.filter(
      (prompt) => prompt.categoryId === activeCategoryId,
    );
  }, [activeCategoryId]);

  const handleDismiss = () => {
    setViewState('browse');
    setPromptInputValue('');
    setEditingPrompt(null);
    setPromptToDelete(null);
    setDeleteDialogOpen(false);
    setActiveCategoryId('custom');
  };

  const isDuplicatePrompt = (value: string, excludedPromptId?: string) => {
    const cleanValue = sanitizePromptTitle(value).toLowerCase();
    return customPromptList.some(
      (prompt) =>
        prompt.prompt_id !== excludedPromptId &&
        sanitizePromptTitle(prompt.title).toLowerCase() === cleanValue,
    );
  };

  const handlePromptApply = (promptTitle: string) => {
    onPromptSelect(promptTitle);
    TrueSheet.dismiss(SHEET_NAMES.PROMPT_LIBRARY);
  };

  const handleCreatePrompt = async () => {
    const trimmed = sanitizePromptTitle(promptInputValue);
    if (!trimmed) return;

    if (isDuplicatePrompt(trimmed)) {
      toast.error(t('Prompt already exists'), { useModal: true });
      return;
    }

    try {
      await createPromptMutation.mutateAsync(trimmed);
      toast.success(t('Prompt created'), { useModal: true });
      setPromptInputValue('');
      setActiveCategoryId('custom');
      TrueSheet.dismiss(SHEET_NAMES.PROMPT_FORM);
    } catch (error) {
      console.error('Failed to create prompt', error);
      toast.error(t('Failed to create prompt'), { useModal: true });
    }
  };

  const handleUpdatePrompt = async () => {
    if (!editingPrompt) return;
    const trimmed = sanitizePromptTitle(promptInputValue);
    if (!trimmed) return;

    if (isDuplicatePrompt(trimmed, editingPrompt.prompt_id)) {
      toast.error(t('Prompt already exists'), { useModal: true });
      return;
    }

    try {
      await updatePromptMutation.mutateAsync({
        promptId: editingPrompt.prompt_id,
        title: trimmed,
      });
      toast.success(t('Prompt updated'), { useModal: true });
      setPromptInputValue('');
      setEditingPrompt(null);
      setActiveCategoryId('custom');
      TrueSheet.dismiss(SHEET_NAMES.PROMPT_FORM);
    } catch (error) {
      console.error('Failed to update prompt', error);
      toast.error(t('Failed to update prompt'), { useModal: true });
    }
  };

  const handleDeletePrompt = async () => {
    if (!promptToDelete) return;

    try {
      await deletePromptMutation.mutateAsync(promptToDelete.prompt_id);
      toast.success(t('Prompt deleted'), { useModal: true });
    } catch (error) {
      console.error('Failed to delete prompt', error);
      toast.error(t('Failed to delete prompt'), { useModal: true });
    }

    setPromptToDelete(null);
    setDeleteDialogOpen(false);
  };

  const handleEditPress = (prompt: CustomPrompt) => {
    setEditingPrompt(prompt);
    setPromptInputValue(prompt.title);
    setViewState('edit');
    TrueSheet.present(SHEET_NAMES.PROMPT_FORM);
  };

  const renderHeader = () => (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
      <View className="w-10" />

      <Text className="text-foreground text-lg font-body-semibold leading-tight flex-1 text-center">
        {t('All Prompts')}
      </Text>

      <View className="w-10 items-end">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => TrueSheet.dismiss(SHEET_NAMES.PROMPT_LIBRARY)}
          accessibilityLabel={t('Close')}
          hitSlop={10}
          className="w-8 h-8">
          <Icon as={X} className="text-muted-foreground" size={20} />
        </Button>
      </View>
    </View>
  );

  const renderCategoryChips = () => (
    <View className="px-4 mb-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2">
        <ToggleGroup
          type="single"
          layout="pills"
          variant="outline"
          size="xs"
          value={activeCategoryId}
          onValueChange={(value) => {
            if (value) {
              setActiveCategoryId(value as JournalPromptCategoryId);
            }
          }}>
          {JOURNAL_PROMPT_CATEGORIES.filter(
            (c) => c.id === 'custom' || journalFocusAreas.includes(c.id),
          ).map((category) => {
            const isSelected = activeCategoryId === category.id;
            return (
              <ToggleGroupItem
                key={category.id}
                value={category.id}
                className={cn(
                  'border',
                  isSelected
                    ? 'bg-primary-foreground border-primary-foreground'
                    : 'bg-primary/20 border-primary-foreground/30',
                )}>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xl">{category.emoji}</Text>
                  <Text
                    className={cn(
                      'text-sm font-body-medium',
                      isSelected ? 'text-primary' : 'text-primary-foreground',
                    )}>
                    {t(category.labelKey)}
                  </Text>
                </View>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </ScrollView>
    </View>
  );

  const renderBuiltInPromptRow = (titleKey: string, isLast: boolean) => (
    <View
      key={titleKey}
      className={cn(
        'flex-row items-center px-3 py-3',
        !isLast && 'border-b border-border',
      )}>
      <Button
        variant="ghost"
        size="flex"
        onPress={() => handlePromptApply(t(titleKey))}
        className="flex-1 justify-start h-auto py-1">
        <Text className="text-base text-foreground font-body-medium">{t(titleKey)}</Text>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onPress={() => handlePromptApply(t(titleKey))}
        accessibilityLabel={t('Use Prompt')}
        hitSlop={8}
        className="w-8 h-8">
        <Icon as={Plus} className="text-muted-foreground" size={20} />
      </Button>
    </View>
  );

  const renderCustomPromptRow = (prompt: CustomPrompt, isLast: boolean) => (
    <View
      key={prompt.prompt_id}
      className={cn(
        'flex-row items-center px-3 py-3',
        !isLast && 'border-b border-border',
      )}>
      <Button
        variant="ghost"
        size="flex"
        onPress={() => handlePromptApply(prompt.title)}
        className="flex-1 justify-start h-auto py-1">
        <Text className="text-base text-foreground font-body-medium">{prompt.title}</Text>
      </Button>

      <View className="flex-row items-center ml-2">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => handleEditPress(prompt)}
          accessibilityLabel={t('Edit Prompt')}
          hitSlop={8}
          className="w-8 h-8 mr-1">
          <Icon as={Pencil} className="text-muted-foreground" size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onPress={() => {
            setPromptToDelete(prompt);
            setDeleteDialogOpen(true);
          }}
          accessibilityLabel={t('Delete Prompt')}
          hitSlop={8}
          className="w-8 h-8">
          <Icon as={Trash2} className="text-destructive" size={18} />
        </Button>
      </View>
    </View>
  );

  const renderBrowseView = () => {
    const isCustomCategory = activeCategoryId === 'custom';
    const hasPrompts = isCustomCategory
      ? customPromptList.length > 0
      : builtInPrompts.length > 0;

    return (
      <View className="pt-3">
        {renderCategoryChips()}

        <View className="px-4">
          {hasPrompts ? (
            <View className="bg-card rounded-lg border border-border overflow-hidden mb-4">
              <ScrollView
                className="max-h-80"
                contentContainerClassName="p-0"
                nestedScrollEnabled>
                {isCustomCategory
                  ? customPromptList.map((prompt, index) =>
                      renderCustomPromptRow(
                        prompt,
                        index === customPromptList.length - 1,
                      ),
                    )
                  : builtInPrompts.map((prompt, index) =>
                      renderBuiltInPromptRow(
                        prompt.titleKey,
                        index === builtInPrompts.length - 1,
                      ),
                    )}
              </ScrollView>
            </View>
          ) : (
            <View className="h-40 px-6 py-10 items-center justify-center gap-2">
              <Text className="text-lg font-body-bold text-foreground/80">
                {t('No prompts yet')}
              </Text>
              <Text className="text-center text-sm leading-6 text-foreground/70">
                {t('Create your first prompt')}
              </Text>
            </View>
          )}
        </View>

        {isCustomCategory && (
          <View className="px-4 pb-4">
            <Button
              variant="primary"
              size="lg"
              onPress={() => {
                setPromptInputValue('');
                setEditingPrompt(null);
                setViewState('create');
                TrueSheet.present(SHEET_NAMES.PROMPT_FORM);
              }}>
              <Icon as={Plus} className="text-primary-foreground size-6" />
              <Text className="text-lg">{t('Create a Prompt')}</Text>
            </Button>
          </View>
        )}
      </View>
    );
  };

  const renderFormSheet = () => {
    const isCreateView = viewState !== 'edit';
    const title = isCreateView ? t('Create Prompt') : t('Edit Prompt');
    const isDisabled = !sanitizePromptTitle(promptInputValue);

    return (
      <TrueSheet
        name={SHEET_NAMES.PROMPT_FORM}
        detents={['auto']}
        cornerRadius={sheetRadius}
        grabber={true}
        grabberOptions={{
          topMargin: 8,
          color: mutedFgColor as string,
          adaptive: false,
        }}
        backgroundColor={backgroundColor as string}
        onDidDismiss={() => {
          setViewState('browse');
          setPromptInputValue('');
          setEditingPrompt(null);
        }}>
        <View className="pt-2">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
            <View className="w-10">
              <Button
                variant="ghost"
                size="icon"
                onPress={() => TrueSheet.dismiss(SHEET_NAMES.PROMPT_FORM)}
                accessibilityLabel={t('Back')}
                hitSlop={10}
                className="w-8 h-8 px-0">
                <Icon
                  as={!isRTL ? ChevronLeft : ChevronRight}
                  className="text-foreground"
                  size={24}
                />
              </Button>
            </View>
            <Text className="text-foreground text-lg font-body-semibold leading-tight flex-1 text-center">
              {title}
            </Text>
            <View className="w-10 items-end">
              <Button
                variant="ghost"
                size="icon"
                onPress={() => TrueSheet.dismiss(SHEET_NAMES.PROMPT_FORM)}
                accessibilityLabel={t('Close')}
                hitSlop={10}
                className="w-8 h-8">
                <Icon as={X} className="text-muted-foreground" size={20} />
              </Button>
            </View>
          </View>

          <View className="px-4 py-4">
            <Input
              className="mb-4"
              placeholder={t('Prompt text')}
              value={promptInputValue}
              onChangeText={setPromptInputValue}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={isCreateView ? handleCreatePrompt : handleUpdatePrompt}
            />
            <Button
              onPress={isCreateView ? handleCreatePrompt : handleUpdatePrompt}
              disabled={isDisabled}
              className={cn(isDisabled && 'opacity-50')}>
              <Text>{isCreateView ? t('Create') : t('Save')}</Text>
            </Button>
          </View>
        </View>
      </TrueSheet>
    );
  };

  return (
    <>
      <TrueSheet
        name={SHEET_NAMES.PROMPT_LIBRARY}
        detents={['auto']}
        cornerRadius={sheetRadius}
        grabber={true}
        grabberOptions={{
          topMargin: 8,
          color: mutedFgColor as string,
          adaptive: false,
        }}
        backgroundColor={backgroundColor as string}
        onDidDismiss={handleDismiss}>
        <View className="bg-background pt-2">
          {renderHeader()}
          {renderBrowseView()}
        </View>
      </TrueSheet>

      {renderFormSheet()}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className={sheetRadius === 0 ? 'rounded-none' : ''}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Prompt?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Are you sure you want to delete this prompt?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setDeleteDialogOpen(false)}>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogDestructiveAction onPress={handleDeletePrompt}>
              <Text>{t('Delete')}</Text>
            </AlertDialogDestructiveAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
