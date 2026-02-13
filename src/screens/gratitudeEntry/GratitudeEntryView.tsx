import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { ArrowLeft, ArrowRight, Pencil, Trash2 } from 'lucide-react-native';
import { MOOD_OPTIONS, MODAL_CLOSE_DELAY } from '~/constants';
import { type Entry } from '~/types';
import { useTranslation, formatLocalizedDate, formatTimeLabel } from '~/lib/i18n';
import { useTagMapping, useDeleteEntry } from '~/hooks/useGratitude';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
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

interface GratitudeEntryViewProps {
  entry: Entry;
  onEdit: () => void;
  onBack: () => void;
}

export function GratitudeEntryView({ entry, onEdit, onBack }: GratitudeEntryViewProps) {
  const { t, isRTL } = useTranslation();
  const tagMap = useTagMapping();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deleteEntryMutation = useDeleteEntry();

  // Extract fields
  const {
    text_title: title,
    text_content: content,
    mood,
    created_at: timestamp,
    tags: tagsCsv,
  } = entry;

  // Format for display
  const dateLabel = formatLocalizedDate(timestamp, t, { relative: true });
  const timeLabel = formatTimeLabel(timestamp, t);

  // Mood label
  const moodOption = mood ? MOOD_OPTIONS.find((o) => o.value === mood) : null;

  // Resolve tags
  const tags = (tagsCsv || '')
    .split(',')
    .filter((tag) => tag.trim().length > 0)
    .map((id) => tagMap.get(id.trim()))
    .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined);

  const handleDelete = async () => {
    try {
      if (entry.note_id) {
        await deleteEntryMutation.mutateAsync(entry.note_id);
      }
    } catch (error) {
      console.error('Failed to delete entry', error);
      toast.error(t('Failed to delete entry'));
      return;
    }
    setShowDeleteConfirm(false);
    setTimeout(() => onBack(), MODAL_CLOSE_DELAY);
  };

  return (
    <>
      {/* Header */}
      <View className="flex-row items-center px-4 py-2 border-b border-border">
        {/* Back button - fixed width for symmetry */}
        <View className="w-20">
          <Button onPress={onBack} variant="ghost" size="icon">
            <Icon as={!isRTL ? ArrowLeft : ArrowRight} className="text-foreground" />
          </Button>
        </View>

        {/* Date/Time display - centered absolutely via flex in parent or just flex-1 here */}
        <View className="flex-1 flex-col items-center">
          <Text className="font-bold text-lg text-foreground">{dateLabel}</Text>
          <Text className="text-sm text-muted-foreground">{timeLabel}</Text>
        </View>

        {/* Edit & Delete buttons - fixed width for symmetry */}
        <View className="w-20 flex-row items-center justify-end gap-1">
          <Button onPress={onEdit} variant="ghost" size="icon">
            <Icon as={Pencil} className="text-foreground" size={20} />
          </Button>
          <Button onPress={() => setShowDeleteConfirm(true)} variant="ghost" size="icon">
            <Icon as={Trash2} className="text-destructive" size={20} />
          </Button>
        </View>
      </View>

      {/* Content */}
      <ScrollView className="flex-1" contentContainerClassName="px-4 pt-4 pb-safe-or-20">
        {/* Mood label */}
        {moodOption && (
          <View className="flex-row items-center gap-2 mb-4">
            <View className="relative flex-row items-center px-3 py-0.5 gap-1.5 bg-primary/50 rounded-full border border-border">
              <Text className="text-2xl">{moodOption.emoji}</Text>
              <Text className="text-sm tracking-wide font-medium text-primary-foreground">
                {t(`Feeling ${moodOption.label}`)}
              </Text>
            </View>
          </View>
        )}

        {/* Title */}
        {title ? (
          <Text className="text-lg font-semibold text-foreground mb-2">{title}</Text>
        ) : null}

        {/* Content */}
        {content ? (
          <Text className="text-base text-foreground leading-6 mb-4">{content}</Text>
        ) : null}

        {/* Tags */}
        {tags.length > 0 && (
          <View className="flex-row flex-wrap gap-3">
            {tags.map((tag) => (
              <View
                key={tag.tag_id}
                className="relative flex-row items-center px-3 py-1.5 bg-muted rounded-full border border-border">
                <Text className="text-sm font-semibold text-primary-foreground">
                  #{tag.title}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Entry?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('This entry will be permanently deleted.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setShowDeleteConfirm(false)}>
              <Text>{t('Cancel')}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              onPress={handleDelete}
              className="bg-destructive active:bg-destructive/90">
              <Text className="text-destructive-foreground font-bold">{t('Delete')}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
