import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, TouchableOpacity, View, Text } from 'react-native';
import { GratitudeLog } from '~/types';
import { useSaveGratitudeLog } from '~/hooks/useGratitude';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Textarea } from '~/components/ui/textarea';

interface GratitudeEntryProps {
  entry: GratitudeLog;
}

export const GratitudeEntry: React.FC<GratitudeEntryProps> = ({ entry }) => {
  const router = useRouter();
  const [text, setText] = useState<string>(entry.entryContent || '');
  const saveMutation = useSaveGratitudeLog();

  const handleSave = () => {
    // Safety check for accidental delete of EXISTING entry
    // (If it was a new empty entry, we can just discard it without warning)
    const isExistingEntry = !!entry.entryContent;
    const isNowEmpty = text.trim() === '';

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
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-lg text-[#555]">Cancel</Text>
        </TouchableOpacity>
        <Text className="font-bold text-lg text-[#333]">{entry.entryDate}</Text>
        <TouchableOpacity onPress={handleSave}>
          <Text className="text-lg font-bold text-[#333]">Done</Text>
        </TouchableOpacity>
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
