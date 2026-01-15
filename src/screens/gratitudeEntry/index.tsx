import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import { IGratitudeDBLog } from '~/types';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import { useSaveGratitudeLog } from '~/hooks/useGratitude';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Textarea } from '~/components/ui/textarea';

interface IGratitudeEntryProps {
  entry: IGratitudeDBLog;
}

export default function GratitudeEntryScreen({ entry }: IGratitudeEntryProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const [text, setText] = useState<string>(entry.entryContent || '');
  const saveMutation = useSaveGratitudeLog();
  const isExistingEntry = !!entry.entryContent;
  const isNowEmpty = text.trim() === '';
  const formattedDate = formatLocalizedDate(entry.entryDate, t);

  const handleSave = () => {
    // Safety check for accidental delete of EXISTING entry
    // (If it was a new empty entry, we can just discard it without warning)

    if (isExistingEntry && isNowEmpty) {
      Alert.alert(
        t('Delete Entry?'),
        t('Clearing the text will delete this entry entirely.'),
        [
          { text: t('Cancel'), style: 'cancel' },
          {
            text: t('Delete'),
            style: 'destructive',
            onPress: () => {
              saveMutation.mutate({ date: entry.entryDate, text: text });
              router.back();
            },
          },
        ],
      );
    } else {
      saveMutation.mutate({ date: entry.entryDate, text: text });
      router.back();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1">
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-4 border-b border-border">
          <Pressable onPress={() => router.back()}>
            <Text className="text-lg text-foreground/70">{t('Cancel')}</Text>
          </Pressable>
          <View className="flex-col items-center">
            <Text className="font-bold text-lg text-foreground">{formattedDate}</Text>
            <Text className="font-bold text-lg text-foreground">
              {t('I was grateful for')}
            </Text>
          </View>
          <Pressable onPress={handleSave}>
            <Text className="text-lg font-bold text-foreground">
              {isExistingEntry && isNowEmpty ? t('Delete') : t('Done')}
            </Text>
          </Pressable>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
