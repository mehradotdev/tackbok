import { useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, type TextInput, View } from 'react-native';
import { ChevronLeft, ChevronRight, FilePenLine, X } from 'lucide-react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useCSSVariable } from 'uniwind';
import { cn } from 'tailwind-variants';
import { SHEET_NAMES } from '~/constants';
import { useWorksheetTemplate } from '~/hooks/useWorksheetTemplate';
import { useTranslation } from '~/lib/i18n';
import { DEFAULT_THEME_SHEET_RADIUS } from '~/lib/theme/themes';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Textarea } from '~/components/ui/textarea';

interface WorksheetTemplateModalProps {
  onApplyTemplate?: () => void;
}

export function WorksheetTemplateModal({ onApplyTemplate }: WorksheetTemplateModalProps) {
  const { t, isRTL } = useTranslation();
  const {
    resolvedWorksheetTemplate,
    defaultWorksheetTemplate,
    setCustomWorksheetTemplate,
    resetCustomWorksheetTemplate,
  } = useWorksheetTemplate();
  const [backgroundColor, themeRadiusStr, mutedFgColor] = useCSSVariable([
    '--color-background',
    '--theme-radius',
    '--color-muted-foreground',
  ]);
  const sheetRadius = String(themeRadiusStr) === '0' ? 0 : DEFAULT_THEME_SHEET_RADIUS;
  const [draftTemplate, setDraftTemplate] = useState(resolvedWorksheetTemplate);
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<TextInput>(null);

  useEffect(() => {
    setDraftTemplate(resolvedWorksheetTemplate);
  }, [resolvedWorksheetTemplate]);

  const handleDismiss = () => {
    setDraftTemplate(resolvedWorksheetTemplate);
    setIsEditing(false);
  };

  const handleSave = () => {
    Keyboard.dismiss();
    setCustomWorksheetTemplate(draftTemplate);
    setIsEditing(false);
  };

  const handleReset = () => {
    Keyboard.dismiss();
    resetCustomWorksheetTemplate();
    setDraftTemplate(defaultWorksheetTemplate);
    setIsEditing(false);
  };

  const handleCancel = () => {
    Keyboard.dismiss();
    setDraftTemplate(resolvedWorksheetTemplate);
    setIsEditing(false);
  };

  const handleStartWriting = () => {
    onApplyTemplate?.();
    TrueSheet.dismiss(SHEET_NAMES.WORKSHEET_TEMPLATE);
  };

  const renderPreviewView = () => (
    <View className="px-4 py-4 gap-4">
      <View className="rounded-xl border border-border bg-card/50">
        <ScrollView
          className="max-h-80"
          contentContainerClassName="p-4"
          nestedScrollEnabled
          scrollEnabled>
          <Text className="text-foreground text-base leading-6 font-body">
            {resolvedWorksheetTemplate}
          </Text>
        </ScrollView>
      </View>

      <View className="gap-3 pb-4">
        <Button
          variant="outline"
          onPress={() => {
            setIsEditing(true);
            setTimeout(() => textareaRef.current?.focus(), 100);
          }}>
          <Icon as={FilePenLine} className="text-primary-foreground size-5" />
          <Text>{t('Edit Worksheet Template')}</Text>
        </Button>

        <Button onPress={handleStartWriting}>
          <Text>{t('Start Writing')}</Text>
        </Button>
      </View>
    </View>
  );

  const renderEditorView = () => (
    <View className="px-4 py-4 gap-4">
      {/* TODO: remove the below text string from translations */}
      {/* <Text className="text-sm text-foreground/75 leading-5">
        {t('Use this template to pre-fill the body of new gratitude entries')}
      </Text> */}

      <Textarea
        ref={textareaRef}
        className="min-h-32 max-h-60 rounded-xl border border-border bg-card p-4 text-base leading-6"
        value={draftTemplate}
        onChangeText={setDraftTemplate}
        placeholder={defaultWorksheetTemplate}
        autoCapitalize="sentences"
        autoCorrect
        scrollEnabled
      />

      <View className="gap-3 pb-4">
        <Button variant="outline" onPress={handleReset}>
          <Text>{t('Reset to Default')}</Text>
        </Button>
        <Button
          onPress={handleSave}
          disabled={!draftTemplate.trim()}
          className={cn(!draftTemplate.trim() && 'opacity-50')}>
          <Text>{t('Save')}</Text>
        </Button>
      </View>
    </View>
  );

  return (
    <TrueSheet
      name={SHEET_NAMES.WORKSHEET_TEMPLATE}
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
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          {/* Left side: Back button (only in edit view) or empty space */}
          <View className="w-10">
            {isEditing && (
              <Button
                variant="ghost"
                size="icon"
                onPress={handleCancel}
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
          <Text className="text-foreground text-lg font-body-semibold leading-tight flex-1 text-center">
            {isEditing ? t('Edit Worksheet Template') : t('Journaling Worksheet')}
          </Text>
          <View className="w-10 items-end">
            <Button
              variant="ghost"
              size="icon"
              onPress={() => TrueSheet.dismiss(SHEET_NAMES.WORKSHEET_TEMPLATE)}
              accessibilityLabel={t('Close')}
              hitSlop={10}
              className="w-8 h-8">
              <Icon as={X} className="text-muted-foreground" size={20} />
            </Button>
          </View>
        </View>

        {isEditing ? renderEditorView() : renderPreviewView()}
      </View>
    </TrueSheet>
  );
}
