import type { SupportedLocale, TranslationKey, PluralCategory } from '../types';

/** Complete count messages. Suffixes follow i18next / Intl.PluralRules categories. */
export const pluralMessages = {
  en: {
    'appearance.countThemesAndColorSchemes_one': '{count} theme and color scheme',
    'appearance.countThemesAndColorSchemes_other': '{count} themes and color schemes',
    'entry.maximumCountPhotosPerEntry_one': 'Up to {count} photo per entry',
    'entry.maximumCountPhotosPerEntry_other': 'Up to {count} photos per entry',
    'entry.maximumCountVoiceMemosPerEntry_one': 'Up to {count} voice note per entry',
    'entry.maximumCountVoiceMemosPerEntry_other': 'Up to {count} voice notes per entry',
    'insights.countYearsAgoToday_one': '{count} year ago today',
    'insights.countYearsAgoToday_other': '{count} years ago today',
    'milestone.daysOfGratitude_one': '{count} day of gratitude',
    'milestone.daysOfGratitude_other': '{count} days of gratitude',
    'sharing.countDaysOfGratitude_one': '{count} day of gratitude!',
    'sharing.countDaysOfGratitude_other': '{count} days of gratitude!',
    'sharing.openCountDayAchievement_one': 'View achievement: {count} day',
    'sharing.openCountDayAchievement_other': 'View achievement: {count} days',
    'cloud.countChangesSafelyQueued_one': '{count} change saved, waiting to sync',
    'cloud.countChangesSafelyQueued_other': '{count} changes saved, waiting to sync',
    'cloud.countChangesRemaining_one': '{count} change remaining',
    'cloud.countChangesRemaining_other': '{count} changes remaining',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_one':
      '{type}: {count} alternative version saved',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_other':
      '{type}: {count} alternative versions saved',
  },
  es: {
    'appearance.countThemesAndColorSchemes_one': '{count} tema y combinación de colores',
    'appearance.countThemesAndColorSchemes_many':
      '{count} temas y combinaciones de colores',
    'appearance.countThemesAndColorSchemes_other':
      '{count} temas y combinaciones de colores',
    'entry.maximumCountPhotosPerEntry_one': 'Hasta {count} foto por entrada',
    'entry.maximumCountPhotosPerEntry_many': 'Hasta {count} fotos por entrada',
    'entry.maximumCountPhotosPerEntry_other': 'Hasta {count} fotos por entrada',
    'entry.maximumCountVoiceMemosPerEntry_one': 'Hasta {count} nota de voz por entrada',
    'entry.maximumCountVoiceMemosPerEntry_many':
      'Hasta {count} notas de voz por entrada',
    'entry.maximumCountVoiceMemosPerEntry_other':
      'Hasta {count} notas de voz por entrada',
    'insights.countYearsAgoToday_one': 'Hoy hace {count} año',
    'insights.countYearsAgoToday_many': 'Hoy hace {count} años',
    'insights.countYearsAgoToday_other': 'Hoy hace {count} años',
    'milestone.daysOfGratitude_one': '{count} día de gratitud',
    'milestone.daysOfGratitude_many': '{count} días de gratitud',
    'milestone.daysOfGratitude_other': '{count} días de gratitud',
    'sharing.countDaysOfGratitude_one': '¡{count} día de gratitud!',
    'sharing.countDaysOfGratitude_many': '¡{count} días de gratitud!',
    'sharing.countDaysOfGratitude_other': '¡{count} días de gratitud!',
    'sharing.openCountDayAchievement_one': 'Ver logro: {count} día',
    'sharing.openCountDayAchievement_many': 'Ver logro: {count} días',
    'sharing.openCountDayAchievement_other': 'Ver logro: {count} días',
    'cloud.countChangesSafelyQueued_one':
      '{count} cambio guardado, esperando para sincronizarse',
    'cloud.countChangesSafelyQueued_many':
      '{count} cambios guardados, esperando para sincronizarse',
    'cloud.countChangesSafelyQueued_other':
      '{count} cambios guardados, esperando para sincronizarse',
    'cloud.countChangesRemaining_one': 'Queda {count} cambio',
    'cloud.countChangesRemaining_many': 'Quedan {count} cambios',
    'cloud.countChangesRemaining_other': 'Quedan {count} cambios',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_one':
      '{type}: se guardó {count} versión alternativa',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_many':
      '{type}: se guardaron {count} versiones alternativas',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_other':
      '{type}: se guardaron {count} versiones alternativas',
  },
  hi: {
    'appearance.countThemesAndColorSchemes_one': '{count} थीम और रंग योजना',
    'appearance.countThemesAndColorSchemes_other': '{count} थीम और रंग योजनाएँ',
    'entry.maximumCountPhotosPerEntry_one': 'हर प्रविष्टि में अधिकतम {count} फ़ोटो',
    'entry.maximumCountPhotosPerEntry_other': 'हर प्रविष्टि में अधिकतम {count} फ़ोटो',
    'entry.maximumCountVoiceMemosPerEntry_one':
      'हर प्रविष्टि में अधिकतम {count} वॉइस नोट',
    'entry.maximumCountVoiceMemosPerEntry_other':
      'हर प्रविष्टि में अधिकतम {count} वॉइस नोट',
    'insights.countYearsAgoToday_one': 'आज से {count} वर्ष पहले',
    'insights.countYearsAgoToday_other': 'आज से {count} वर्ष पहले',
    'milestone.daysOfGratitude_one': 'कृतज्ञता का {count} दिन',
    'milestone.daysOfGratitude_other': 'कृतज्ञता के {count} दिन',
    'sharing.countDaysOfGratitude_one': 'कृतज्ञता का {count} दिन!',
    'sharing.countDaysOfGratitude_other': 'कृतज्ञता के {count} दिन!',
    'sharing.openCountDayAchievement_one': 'उपलब्धि देखें: {count} दिन',
    'sharing.openCountDayAchievement_other': 'उपलब्धि देखें: {count} दिन',
    'cloud.countChangesSafelyQueued_one':
      '{count} बदलाव सहेजा गया, सिंक होने की प्रतीक्षा में',
    'cloud.countChangesSafelyQueued_other':
      '{count} बदलाव सहेजे गए, सिंक होने की प्रतीक्षा में',
    'cloud.countChangesRemaining_one': '{count} बदलाव बाकी है',
    'cloud.countChangesRemaining_other': '{count} बदलाव बाकी हैं',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_one':
      '{type}: {count} वैकल्पिक संस्करण सहेजा गया',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_other':
      '{type}: {count} वैकल्पिक संस्करण सहेजे गए',
  },
  sv: {
    'appearance.countThemesAndColorSchemes_one': '{count} tema och färgschema',
    'appearance.countThemesAndColorSchemes_other': '{count} teman och färgscheman',
    'entry.maximumCountPhotosPerEntry_one': 'Upp till {count} foto per anteckning',
    'entry.maximumCountPhotosPerEntry_other': 'Upp till {count} foton per anteckning',
    'entry.maximumCountVoiceMemosPerEntry_one':
      'Upp till {count} röstanteckning per anteckning',
    'entry.maximumCountVoiceMemosPerEntry_other':
      'Upp till {count} röstanteckningar per anteckning',
    'insights.countYearsAgoToday_one': 'I dag för {count} år sedan',
    'insights.countYearsAgoToday_other': 'I dag för {count} år sedan',
    'milestone.daysOfGratitude_one': '{count} dag av tacksamhet',
    'milestone.daysOfGratitude_other': '{count} dagar av tacksamhet',
    'sharing.countDaysOfGratitude_one': '{count} dag av tacksamhet!',
    'sharing.countDaysOfGratitude_other': '{count} dagar av tacksamhet!',
    'sharing.openCountDayAchievement_one': 'Visa prestation: {count} dag',
    'sharing.openCountDayAchievement_other': 'Visa prestation: {count} dagar',
    'cloud.countChangesSafelyQueued_one':
      '{count} ändring sparad och väntar på synkronisering',
    'cloud.countChangesSafelyQueued_other':
      '{count} ändringar sparade och väntar på synkronisering',
    'cloud.countChangesRemaining_one': '{count} ändring återstår',
    'cloud.countChangesRemaining_other': '{count} ändringar återstår',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_one':
      '{type}: {count} alternativ version sparad',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_other':
      '{type}: {count} alternativa versioner sparade',
  },
  de: {
    'appearance.countThemesAndColorSchemes_one': '{count} Design und Farbschema',
    'appearance.countThemesAndColorSchemes_other': '{count} Designs und Farbschemata',
    'entry.maximumCountPhotosPerEntry_one': 'Bis zu {count} Foto pro Eintrag',
    'entry.maximumCountPhotosPerEntry_other': 'Bis zu {count} Fotos pro Eintrag',
    'entry.maximumCountVoiceMemosPerEntry_one': 'Bis zu {count} Sprachnotiz pro Eintrag',
    'entry.maximumCountVoiceMemosPerEntry_other':
      'Bis zu {count} Sprachnotizen pro Eintrag',
    'insights.countYearsAgoToday_one': 'Heute vor {count} Jahr',
    'insights.countYearsAgoToday_other': 'Heute vor {count} Jahren',
    'milestone.daysOfGratitude_one': '{count} Tag voller Dankbarkeit',
    'milestone.daysOfGratitude_other': '{count} Tage voller Dankbarkeit',
    'sharing.countDaysOfGratitude_one': '{count} Tag voller Dankbarkeit!',
    'sharing.countDaysOfGratitude_other': '{count} Tage voller Dankbarkeit!',
    'sharing.openCountDayAchievement_one': 'Erfolg ansehen: {count} Tag',
    'sharing.openCountDayAchievement_other': 'Erfolg ansehen: {count} Tage',
    'cloud.countChangesSafelyQueued_one':
      '{count} Änderung gespeichert, wartet auf Synchronisierung',
    'cloud.countChangesSafelyQueued_other':
      '{count} Änderungen gespeichert, warten auf Synchronisierung',
    'cloud.countChangesRemaining_one': 'Noch {count} Änderung',
    'cloud.countChangesRemaining_other': 'Noch {count} Änderungen',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_one':
      '{type}: {count} alternative Version gespeichert',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_other':
      '{type}: {count} alternative Versionen gespeichert',
  },
  he: {
    'appearance.countThemesAndColorSchemes_one': 'ערכת נושא וצבעים אחת',
    'appearance.countThemesAndColorSchemes_two': '{count} ערכות נושא וצבעים',
    'appearance.countThemesAndColorSchemes_other': '{count} ערכות נושא וצבעים',
    'entry.maximumCountPhotosPerEntry_one': 'עד תמונה אחת בכל רשומה',
    'entry.maximumCountPhotosPerEntry_two': 'עד {count} תמונות בכל רשומה',
    'entry.maximumCountPhotosPerEntry_other': 'עד {count} תמונות בכל רשומה',
    'entry.maximumCountVoiceMemosPerEntry_one': 'עד הקלטה קולית אחת בכל רשומה',
    'entry.maximumCountVoiceMemosPerEntry_two': 'עד {count} הקלטות קוליות בכל רשומה',
    'entry.maximumCountVoiceMemosPerEntry_other': 'עד {count} הקלטות קוליות בכל רשומה',
    'insights.countYearsAgoToday_one': 'היום לפני שנה',
    'insights.countYearsAgoToday_two': 'היום לפני שנתיים',
    'insights.countYearsAgoToday_other': 'היום לפני {count} שנים',
    'milestone.daysOfGratitude_one': 'יום אחד של הכרת תודה',
    'milestone.daysOfGratitude_two': '{count} ימים של הכרת תודה',
    'milestone.daysOfGratitude_other': '{count} ימים של הכרת תודה',
    'sharing.countDaysOfGratitude_one': 'יום אחד של הכרת תודה!',
    'sharing.countDaysOfGratitude_two': '{count} ימים של הכרת תודה!',
    'sharing.countDaysOfGratitude_other': '{count} ימים של הכרת תודה!',
    'sharing.openCountDayAchievement_one': 'הצגת הישג: יום אחד',
    'sharing.openCountDayAchievement_two': 'הצגת הישג: {count} ימים',
    'sharing.openCountDayAchievement_other': 'הצגת הישג: {count} ימים',
    'cloud.countChangesSafelyQueued_one': 'שינוי אחד נשמר וממתין לסנכרון',
    'cloud.countChangesSafelyQueued_two': '{count} שינויים נשמרו וממתינים לסנכרון',
    'cloud.countChangesSafelyQueued_other': '{count} שינויים נשמרו וממתינים לסנכרון',
    'cloud.countChangesRemaining_one': 'נותר שינוי אחד',
    'cloud.countChangesRemaining_two': 'נותרו {count} שינויים',
    'cloud.countChangesRemaining_other': 'נותרו {count} שינויים',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_one':
      '{type}: נשמרה גרסה חלופית אחת',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_two':
      '{type}: נשמרו {count} גרסאות חלופיות',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_other':
      '{type}: נשמרו {count} גרסאות חלופיות',
  },
  ar: {
    'appearance.countThemesAndColorSchemes_zero': '{count} سمة ونظام ألوان',
    'appearance.countThemesAndColorSchemes_one': '{count} سمة ونظام ألوان',
    'appearance.countThemesAndColorSchemes_two': 'سمتان ونظاما ألوان',
    'appearance.countThemesAndColorSchemes_few': '{count} سمات وأنظمة ألوان',
    'appearance.countThemesAndColorSchemes_many': '{count} سمة ونظام ألوان',
    'appearance.countThemesAndColorSchemes_other': '{count} سمة ونظام ألوان',
    'entry.maximumCountPhotosPerEntry_zero': 'الحد الأقصى لكل سجل: {count} صورة',
    'entry.maximumCountPhotosPerEntry_one': 'الحد الأقصى لكل سجل: {count} صورة',
    'entry.maximumCountPhotosPerEntry_two': 'الحد الأقصى لكل سجل: صورتان',
    'entry.maximumCountPhotosPerEntry_few': 'الحد الأقصى لكل سجل: {count} صور',
    'entry.maximumCountPhotosPerEntry_many': 'الحد الأقصى لكل سجل: {count} صورة',
    'entry.maximumCountPhotosPerEntry_other': 'الحد الأقصى لكل سجل: {count} صورة',
    'entry.maximumCountVoiceMemosPerEntry_zero':
      'الحد الأقصى لكل سجل: {count} ملاحظة صوتية',
    'entry.maximumCountVoiceMemosPerEntry_one':
      'الحد الأقصى لكل سجل: {count} ملاحظة صوتية',
    'entry.maximumCountVoiceMemosPerEntry_two': 'الحد الأقصى لكل سجل: ملاحظتان صوتيتان',
    'entry.maximumCountVoiceMemosPerEntry_few':
      'الحد الأقصى لكل سجل: {count} ملاحظات صوتية',
    'entry.maximumCountVoiceMemosPerEntry_many':
      'الحد الأقصى لكل سجل: {count} ملاحظة صوتية',
    'entry.maximumCountVoiceMemosPerEntry_other':
      'الحد الأقصى لكل سجل: {count} ملاحظة صوتية',
    'insights.countYearsAgoToday_zero': 'في مثل هذا اليوم قبل {count} سنة',
    'insights.countYearsAgoToday_one': 'في مثل هذا اليوم قبل {count} سنة',
    'insights.countYearsAgoToday_two': 'في مثل هذا اليوم قبل سنتين',
    'insights.countYearsAgoToday_few': 'في مثل هذا اليوم قبل {count} سنوات',
    'insights.countYearsAgoToday_many': 'في مثل هذا اليوم قبل {count} سنة',
    'insights.countYearsAgoToday_other': 'في مثل هذا اليوم قبل {count} سنة',
    'milestone.daysOfGratitude_zero': '{count} يوم من الامتنان',
    'milestone.daysOfGratitude_one': '{count} يوم من الامتنان',
    'milestone.daysOfGratitude_two': 'يومان من الامتنان',
    'milestone.daysOfGratitude_few': '{count} أيام من الامتنان',
    'milestone.daysOfGratitude_many': '{count} يومًا من الامتنان',
    'milestone.daysOfGratitude_other': '{count} يوم من الامتنان',
    'sharing.countDaysOfGratitude_zero': '{count} يوم من الامتنان!',
    'sharing.countDaysOfGratitude_one': '{count} يوم من الامتنان!',
    'sharing.countDaysOfGratitude_two': 'يومان من الامتنان!',
    'sharing.countDaysOfGratitude_few': '{count} أيام من الامتنان!',
    'sharing.countDaysOfGratitude_many': '{count} يومًا من الامتنان!',
    'sharing.countDaysOfGratitude_other': '{count} يوم من الامتنان!',
    'sharing.openCountDayAchievement_zero': 'عرض الإنجاز: {count} يوم',
    'sharing.openCountDayAchievement_one': 'عرض الإنجاز: {count} يوم',
    'sharing.openCountDayAchievement_two': 'عرض الإنجاز: يومان',
    'sharing.openCountDayAchievement_few': 'عرض الإنجاز: {count} أيام',
    'sharing.openCountDayAchievement_many': 'عرض الإنجاز: {count} يومًا',
    'sharing.openCountDayAchievement_other': 'عرض الإنجاز: {count} يوم',
    'cloud.countChangesSafelyQueued_zero':
      'التغييرات المحفوظة في انتظار المزامنة: {count}',
    'cloud.countChangesSafelyQueued_one': 'تم حفظ {count} تغيير في انتظار المزامنة',
    'cloud.countChangesSafelyQueued_two': 'تم حفظ تغييرين في انتظار المزامنة',
    'cloud.countChangesSafelyQueued_few': 'تم حفظ {count} تغييرات في انتظار المزامنة',
    'cloud.countChangesSafelyQueued_many': 'تم حفظ {count} تغييرًا في انتظار المزامنة',
    'cloud.countChangesSafelyQueued_other':
      'التغييرات المحفوظة في انتظار المزامنة: {count}',
    'cloud.countChangesRemaining_zero': 'التغييرات المتبقية: {count}',
    'cloud.countChangesRemaining_one': 'تبقى {count} تغيير',
    'cloud.countChangesRemaining_two': 'تبقى تغييران',
    'cloud.countChangesRemaining_few': 'تبقى {count} تغييرات',
    'cloud.countChangesRemaining_many': 'تبقى {count} تغييرًا',
    'cloud.countChangesRemaining_other': 'التغييرات المتبقية: {count}',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_zero':
      '{type}: النسخ البديلة المحفوظة: {count}',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_one':
      '{type}: تم حفظ {count} نسخة بديلة',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_two':
      '{type}: تم حفظ نسختين بديلتين',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_few':
      '{type}: تم حفظ {count} نسخ بديلة',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_many':
      '{type}: تم حفظ {count} نسخة بديلة',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_other':
      '{type}: النسخ البديلة المحفوظة: {count}',
  },
  'zh-CN': {
    'appearance.countThemesAndColorSchemes_other': '{count} 种主题和配色',
    'entry.maximumCountPhotosPerEntry_other': '每个条目最多 {count} 张照片',
    'entry.maximumCountVoiceMemosPerEntry_other': '每个条目最多 {count} 条语音笔记',
    'insights.countYearsAgoToday_other': '{count} 年前的今天',
    'milestone.daysOfGratitude_other': '感恩的 {count} 天',
    'sharing.countDaysOfGratitude_other': '感恩的 {count} 天！',
    'sharing.openCountDayAchievement_other': '查看 {count} 天成就',
    'cloud.countChangesSafelyQueued_other': '已保存 {count} 项更改，等待同步',
    'cloud.countChangesRemaining_other': '还剩 {count} 项更改',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_other':
      '{type}：已保存 {count} 个其他版本',
  },
  'zh-TW': {
    'appearance.countThemesAndColorSchemes_other': '{count} 種主題和配色',
    'entry.maximumCountPhotosPerEntry_other': '每則紀錄最多 {count} 張照片',
    'entry.maximumCountVoiceMemosPerEntry_other': '每則紀錄最多 {count} 則語音筆記',
    'insights.countYearsAgoToday_other': '{count} 年前的今天',
    'milestone.daysOfGratitude_other': '感恩的 {count} 天',
    'sharing.countDaysOfGratitude_other': '感恩的 {count} 天！',
    'sharing.openCountDayAchievement_other': '查看 {count} 天成就',
    'cloud.countChangesSafelyQueued_other': '已儲存 {count} 項變更，等待同步',
    'cloud.countChangesRemaining_other': '還剩 {count} 項變更',
    'cloud.recoveredTypeConflictCountPreservedAlternatives_other':
      '{type}：已儲存 {count} 個其他版本',
  },
} satisfies Record<
  SupportedLocale,
  Partial<Record<`${TranslationKey}_${PluralCategory}`, string>>
>;
