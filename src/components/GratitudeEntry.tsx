import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View, Text } from 'react-native';
import { IGratitudeDBLog } from '~/types';
import { useSaveGratitudeLog } from '~/hooks/useGratitude';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Textarea } from '~/components/ui/textarea';

interface IGratitudeEntryProps {
  entry: IGratitudeDBLog;
}

export const GratitudeEntry: React.FC<IGratitudeEntryProps> = ({ entry }) => {
  const router = useRouter();
  const [text, setText] = useState<string>(entry.entryContent || '');
  const saveMutation = useSaveGratitudeLog();
  const isExistingEntry = !!entry.entryContent;
  const isNowEmpty = text.trim() === '';

  const handleSave = () => {
    // Safety check for accidental delete of EXISTING entry
    // (If it was a new empty entry, we can just discard it without warning)

    if (isExistingEntry && isNowEmpty) {
      Alert.alert('Delete Entry?', 'Clearing the text will delete this entry entirely.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            saveMutation.mutate({ date: entry.entryDate, text: text });
            router.back();
          },
        },
      ]);
    } else {
      saveMutation.mutate({ date: entry.entryDate, text: text });
      router.back();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#EBE5da]">
      {/* Header */}
      <View className="flex-row justify-between items-center px-4 py-4 border-b border-[#dcd6cc]">
        <Pressable onPress={() => router.back()}>
          <Text className="text-lg text-[#555]">Cancel</Text>
        </Pressable>
        <Text className="font-bold text-lg text-[#333]">{entry.entryDate}</Text>
        <Pressable onPress={handleSave}>
          <Text className="text-lg font-bold text-[#333]">
            {isExistingEntry && isNowEmpty ? 'Delete' : 'Done'}
          </Text>
        </Pressable>
      </View>

      {/* TODO: multiline not working; using h-[50%] */}
      {/* Input Area */}
      <Textarea
        className="h-[50%] px-5 py-5 text-lg text-[#333] leading-7"
        textAlignVertical="top"
        placeholder="What are you grateful for today?"
        placeholderTextColor="#999"
        value={text}
        onChangeText={setText}
        autoFocus={!entry.entryContent}
        multiline={true}
        numberOfLines={45}
      />
    </SafeAreaView>
  );
};
