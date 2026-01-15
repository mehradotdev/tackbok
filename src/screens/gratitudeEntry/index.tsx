import { useState, useEffect, useRef } from 'react';
import { View, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useCSSVariable } from 'uniwind';
import { IGratitudeDBLog } from '~/types';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import { useSaveGratitudeLog } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { SafeAreaView } from '~/components/ui/safe-area-view';
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

interface IGratitudeEntryProps {
  entry: IGratitudeDBLog;
}

export default function GratitudeEntryScreen({ entry }: IGratitudeEntryProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const [text, setText] = useState<string>(entry.entryContent || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnsavedChangesConfirm, setShowUnsavedChangesConfirm] = useState(false);

  // Use a ref to track if we are saving/deleting to bypass the unsaved check synchronously
  const isSaving = useRef(false);

  const saveMutation = useSaveGratitudeLog();
  const isExistingEntry = !!entry.entryContent;
  const isNowEmpty = text.trim() === '';
  const formattedDate = formatLocalizedDate(entry.entryDate, t);

  // Calculate derive state for unsaved changes
  const originalContent = entry.entryContent || '';
  const hasUnsavedChanges = text !== originalContent && !isNowEmpty;

  // Disable Swipe on iOS when dirty to prevent native stack crash
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: !hasUnsavedChanges,
    });
  }, [navigation, hasUnsavedChanges]);

  // Intercept back navigation (hardware back button & swipe gesture)
  useEffect(() => {
    // If the modal is already open, or we are in the process of saving, don't intercept
    if (showUnsavedChangesConfirm) return;

    const beforeRemoveListener = navigation.addListener('beforeRemove', (e) => {
      // If we are saving/deleting, allow navigation
      if (isSaving.current) return;

      // If no unsaved changes, let them go back
      if (!hasUnsavedChanges) {
        return;
      }

      // Prevent default behavior of leaving the screen
      e.preventDefault();

      // Prompt the user
      Keyboard.dismiss();
      setShowUnsavedChangesConfirm(true);
    });

    return beforeRemoveListener;
  }, [navigation, hasUnsavedChanges, showUnsavedChangesConfirm]);

  const onSave = () => {
    if (isExistingEntry && isNowEmpty) {
      Keyboard.dismiss();
      setShowDeleteConfirm(true);
    } else {
      isSaving.current = true;
      saveMutation.mutate({ date: entry.entryDate, text: text });
      router.back();
    }
  };

  const handleConfirmDelete = () => {
    isSaving.current = true;
    saveMutation.mutate({ date: entry.entryDate, text: text });
    setShowDeleteConfirm(false);
    // Timeout to allow the modal to close otherwise app crashes in Android
    setTimeout(() => {
      router.back();
    }, 200);
  };

  const handleDiscardChanges = () => {
    setShowUnsavedChangesConfirm(false);
    // Bypass check by setting isSaving to true, as we are intentionally discarding
    isSaving.current = true;
    setTimeout(() => {
      router.back();
    }, 200);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1">
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-4 border-b border-border">
          <Button onPress={() => router.back()} variant="link" className="p-0">
            <Text className="text-lg text-foreground/70">{t('Cancel')}</Text>
          </Button>
          <View className="flex-col items-center">
            <Text className="font-bold text-lg text-foreground">{formattedDate}</Text>
            <Text className="font-bold text-lg text-foreground">
              {t('I was grateful for')}
            </Text>
          </View>
          <Button
            onPress={onSave}
            variant={isExistingEntry && isNowEmpty ? 'destructive' : 'default'}>
            <Text className="">
              {isExistingEntry && isNowEmpty ? t('Delete') : t('Save')}
            </Text>
          </Button>
        </View>

        {/* Input Area */}
        <Textarea
          className="flex-1 px-5 py-5 text-lg text-foreground leading-7"
          textAlignVertical="top"
          placeholder={t('What are you grateful for?')}
          placeholderTextColor={mutedForeground as string}
          value={text}
          onChangeText={setText}
          autoFocus={!entry.entryContent}
          multiline={true}
          // numberOfLines={45}
        />

        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('Delete Entry?')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('Clearing the text will delete this entry entirely.')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onPress={() => setShowDeleteConfirm(false)}>
                <Text>{t('Cancel')}</Text>
              </AlertDialogCancel>
              <AlertDialogAction
                onPress={handleConfirmDelete}
                className="bg-destructive active:bg-destructive/90">
                <Text className="text-destructive-foreground font-bold">
                  {t('Delete')}
                </Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={showUnsavedChangesConfirm}
          onOpenChange={setShowUnsavedChangesConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('Are you sure you want to go back?')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('Your entry is unsaved and your changes will be lost!')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onPress={() => setShowUnsavedChangesConfirm(false)}>
                <Text>{t('Cancel')}</Text>
              </AlertDialogCancel>
              <AlertDialogAction onPress={handleDiscardChanges}>
                <Text>{t('Continue')}</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
