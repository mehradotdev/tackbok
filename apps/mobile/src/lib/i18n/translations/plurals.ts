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
    'cloud.conflicts.entriesEdited_one':
      'An entry was edited on two devices at once. Both versions are in your journal.',
    'cloud.conflicts.entriesEdited_other':
      '{count} entries were edited on two devices at once. Both versions are in your journal.',
    'cloud.conflicts.keepThisOneMessage_one':
      'The other version will be permanently deleted.',
    'cloud.conflicts.keepThisOneMessage_other':
      'The {count} other versions will be permanently deleted.',
    'cloud.conflicts.entriesReturned_one':
      'An entry you deleted on one device was kept because another device still had it.',
    'cloud.conflicts.entriesReturned_other':
      '{count} entries you deleted on one device were kept because another device still had them.',
    'cloud.progress.devicesChecked_one': '{done} of {count} device checked',
    'cloud.progress.devicesChecked_other': '{done} of {count} devices checked',
    'cloud.progress.filesDownloaded_one': '{done} of {count} file downloaded',
    'cloud.progress.filesDownloaded_other': '{done} of {count} files downloaded',
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
    'entry.maximumCountVoiceMemosPerEntry_many': 'Hasta {count} notas de voz por entrada',
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
    'cloud.conflicts.entriesEdited_one':
      'Una entrada se editó en dos dispositivos a la vez. Ambas versiones están en tu diario.',
    'cloud.conflicts.entriesEdited_many':
      '{count} entradas se editaron en dos dispositivos a la vez. Ambas versiones están en tu diario.',
    'cloud.conflicts.entriesEdited_other':
      '{count} entradas se editaron en dos dispositivos a la vez. Ambas versiones están en tu diario.',
    'cloud.conflicts.keepThisOneMessage_one':
      'La otra versión se eliminará permanentemente.',
    'cloud.conflicts.keepThisOneMessage_many':
      'Las otras {count} versiones se eliminarán permanentemente.',
    'cloud.conflicts.keepThisOneMessage_other':
      'Las otras {count} versiones se eliminarán permanentemente.',
    'cloud.conflicts.entriesReturned_one':
      'Se conservó una entrada que eliminaste en un dispositivo porque otro dispositivo aún la tenía.',
    'cloud.conflicts.entriesReturned_many':
      'Se conservaron {count} entradas que eliminaste en un dispositivo porque otro dispositivo aún las tenía.',
    'cloud.conflicts.entriesReturned_other':
      'Se conservaron {count} entradas que eliminaste en un dispositivo porque otro dispositivo aún las tenía.',
    'cloud.progress.devicesChecked_one': '{done} de {count} dispositivo revisado',
    'cloud.progress.devicesChecked_many': '{done} de {count} dispositivos revisados',
    'cloud.progress.devicesChecked_other': '{done} de {count} dispositivos revisados',
    'cloud.progress.filesDownloaded_one': '{done} de {count} archivo descargado',
    'cloud.progress.filesDownloaded_many': '{done} de {count} archivos descargados',
    'cloud.progress.filesDownloaded_other': '{done} de {count} archivos descargados',
  },
  hi: {
    'appearance.countThemesAndColorSchemes_one': '{count} थीम और रंग योजना',
    'appearance.countThemesAndColorSchemes_other': '{count} थीम और रंग योजनाएँ',
    'entry.maximumCountPhotosPerEntry_one': 'हर प्रविष्टि में अधिकतम {count} फ़ोटो',
    'entry.maximumCountPhotosPerEntry_other': 'हर प्रविष्टि में अधिकतम {count} फ़ोटो',
    'entry.maximumCountVoiceMemosPerEntry_one': 'हर प्रविष्टि में अधिकतम {count} वॉइस नोट',
    'entry.maximumCountVoiceMemosPerEntry_other': 'हर प्रविष्टि में अधिकतम {count} वॉइस नोट',
    'insights.countYearsAgoToday_one': 'आज से {count} वर्ष पहले',
    'insights.countYearsAgoToday_other': 'आज से {count} वर्ष पहले',
    'milestone.daysOfGratitude_one': 'कृतज्ञता का {count} दिन',
    'milestone.daysOfGratitude_other': 'कृतज्ञता के {count} दिन',
    'sharing.countDaysOfGratitude_one': 'कृतज्ञता का {count} दिन!',
    'sharing.countDaysOfGratitude_other': 'कृतज्ञता के {count} दिन!',
    'sharing.openCountDayAchievement_one': 'उपलब्धि देखें: {count} दिन',
    'sharing.openCountDayAchievement_other': 'उपलब्धि देखें: {count} दिन',
    'cloud.countChangesSafelyQueued_one': '{count} बदलाव सहेजा गया, सिंक होने की प्रतीक्षा में',
    'cloud.countChangesSafelyQueued_other': '{count} बदलाव सहेजे गए, सिंक होने की प्रतीक्षा में',
    'cloud.countChangesRemaining_one': '{count} बदलाव बाकी है',
    'cloud.countChangesRemaining_other': '{count} बदलाव बाकी हैं',
    'cloud.conflicts.entriesEdited_one':
      'एक प्रविष्टि एक ही समय पर दो डिवाइस पर संपादित की गई। दोनों संस्करण आपकी डायरी में हैं।',
    'cloud.conflicts.entriesEdited_other':
      '{count} प्रविष्टियाँ एक ही समय पर दो डिवाइस पर संपादित की गईं। दोनों संस्करण आपकी डायरी में हैं।',
    'cloud.conflicts.keepThisOneMessage_one': 'दूसरा संस्करण स्थायी रूप से हटा दिया जाएगा।',
    'cloud.conflicts.keepThisOneMessage_other':
      '{count} अन्य संस्करण स्थायी रूप से हटा दिए जाएँगे।',
    'cloud.conflicts.entriesReturned_one':
      'आपकी एक हटाई गई प्रविष्टि रखी गई, क्योंकि वह दूसरे डिवाइस पर अब भी थी।',
    'cloud.conflicts.entriesReturned_other':
      'आपकी {count} हटाई गई प्रविष्टियाँ रखी गईं, क्योंकि वे दूसरे डिवाइस पर अब भी थीं।',
    'cloud.progress.devicesChecked_one': '{count} में से {done} डिवाइस जाँचा गया',
    'cloud.progress.devicesChecked_other': '{count} में से {done} डिवाइस जाँचे गए',
    'cloud.progress.filesDownloaded_one': '{count} में से {done} फ़ाइल डाउनलोड हुई',
    'cloud.progress.filesDownloaded_other': '{count} में से {done} फ़ाइलें डाउनलोड हुईं',
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
    'cloud.conflicts.entriesEdited_one':
      'En anteckning redigerades på två enheter samtidigt. Båda versionerna finns i din dagbok.',
    'cloud.conflicts.entriesEdited_other':
      '{count} anteckningar redigerades på två enheter samtidigt. Båda versionerna finns i din dagbok.',
    'cloud.conflicts.keepThisOneMessage_one': 'Den andra versionen tas bort permanent.',
    'cloud.conflicts.keepThisOneMessage_other':
      'De {count} andra versionerna tas bort permanent.',
    'cloud.conflicts.entriesReturned_one':
      'En anteckning som du tog bort på en enhet behölls eftersom en annan enhet fortfarande hade den.',
    'cloud.conflicts.entriesReturned_other':
      '{count} anteckningar som du tog bort på en enhet behölls eftersom en annan enhet fortfarande hade dem.',
    'cloud.progress.devicesChecked_one': '{done} av {count} enhet kontrollerad',
    'cloud.progress.devicesChecked_other': '{done} av {count} enheter kontrollerade',
    'cloud.progress.filesDownloaded_one': '{done} av {count} fil nedladdad',
    'cloud.progress.filesDownloaded_other': '{done} av {count} filer nedladdade',
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
    'cloud.conflicts.entriesEdited_one':
      'Ein Eintrag wurde gleichzeitig auf zwei Geräten bearbeitet. Beide Versionen sind in deinem Tagebuch.',
    'cloud.conflicts.entriesEdited_other':
      '{count} Einträge wurden gleichzeitig auf zwei Geräten bearbeitet. Beide Versionen sind in deinem Tagebuch.',
    'cloud.conflicts.keepThisOneMessage_one':
      'Die andere Version wird dauerhaft gelöscht.',
    'cloud.conflicts.keepThisOneMessage_other':
      'Die {count} anderen Versionen werden dauerhaft gelöscht.',
    'cloud.conflicts.entriesReturned_one':
      'Ein Eintrag, den du auf einem Gerät gelöscht hast, wurde behalten, weil ein anderes Gerät ihn noch hatte.',
    'cloud.conflicts.entriesReturned_other':
      '{count} Einträge, die du auf einem Gerät gelöscht hast, wurden behalten, weil ein anderes Gerät sie noch hatte.',
    'cloud.progress.devicesChecked_one': '{done} von {count} Gerät geprüft',
    'cloud.progress.devicesChecked_other': '{done} von {count} Geräten geprüft',
    'cloud.progress.filesDownloaded_one': '{done} von {count} Datei heruntergeladen',
    'cloud.progress.filesDownloaded_other': '{done} von {count} Dateien heruntergeladen',
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
    'cloud.conflicts.entriesEdited_one':
      'רשומה אחת נערכה בשני מכשירים בו־זמנית. שתי הגרסאות נמצאות ביומן שלך.',
    'cloud.conflicts.entriesEdited_two':
      '{count} רשומות נערכו בשני מכשירים בו־זמנית. שתי הגרסאות נמצאות ביומן שלך.',
    'cloud.conflicts.entriesEdited_other':
      '{count} רשומות נערכו בשני מכשירים בו־זמנית. שתי הגרסאות נמצאות ביומן שלך.',
    'cloud.conflicts.keepThisOneMessage_one': 'הגרסה האחרת תימחק לצמיתות.',
    'cloud.conflicts.keepThisOneMessage_two': 'שתי הגרסאות האחרות יימחקו לצמיתות.',
    'cloud.conflicts.keepThisOneMessage_other': '{count} הגרסאות האחרות יימחקו לצמיתות.',
    'cloud.conflicts.entriesReturned_one':
      'רשומה שמחקת במכשיר אחד נשמרה כי היא עדיין הייתה במכשיר אחר.',
    'cloud.conflicts.entriesReturned_two':
      'שתי רשומות שמחקת במכשיר אחד נשמרו כי הן עדיין היו במכשיר אחר.',
    'cloud.conflicts.entriesReturned_other':
      '{count} רשומות שמחקת במכשיר אחד נשמרו כי הן עדיין היו במכשיר אחר.',
    'cloud.progress.devicesChecked_one': 'נבדקו {done} מתוך מכשיר אחד',
    'cloud.progress.devicesChecked_two': 'נבדקו {done} מתוך שני מכשירים',
    'cloud.progress.devicesChecked_other': 'נבדקו {done} מתוך {count} מכשירים',
    'cloud.progress.filesDownloaded_one': 'הורדו {done} מתוך קובץ אחד',
    'cloud.progress.filesDownloaded_two': 'הורדו {done} מתוך שני קבצים',
    'cloud.progress.filesDownloaded_other': 'הורדו {done} מתוך {count} קבצים',
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
    'entry.maximumCountVoiceMemosPerEntry_one': 'الحد الأقصى لكل سجل: {count} ملاحظة صوتية',
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
    'cloud.conflicts.entriesEdited_zero':
      'عدد السجلات التي عُدِّلت على جهازين في الوقت نفسه: {count}. النسختان موجودتان في دفتر يومياتك.',
    'cloud.conflicts.entriesEdited_one':
      'عُدِّل سجل واحد على جهازين في الوقت نفسه. النسختان موجودتان في دفتر يومياتك.',
    'cloud.conflicts.entriesEdited_two':
      'عُدِّل سجلان على جهازين في الوقت نفسه. النسختان موجودتان في دفتر يومياتك.',
    'cloud.conflicts.entriesEdited_few':
      'عُدِّلت {count} سجلات على جهازين في الوقت نفسه. النسختان موجودتان في دفتر يومياتك.',
    'cloud.conflicts.entriesEdited_many':
      'عُدِّل {count} سجلًا على جهازين في الوقت نفسه. النسختان موجودتان في دفتر يومياتك.',
    'cloud.conflicts.entriesEdited_other':
      'عدد السجلات التي عُدِّلت على جهازين في الوقت نفسه: {count}. النسختان موجودتان في دفتر يومياتك.',
    'cloud.conflicts.keepThisOneMessage_zero':
      'عدد النسخ الأخرى التي ستُحذف نهائيًا: {count}.',
    'cloud.conflicts.keepThisOneMessage_one': 'ستُحذف النسخة الأخرى نهائيًا.',
    'cloud.conflicts.keepThisOneMessage_two': 'ستُحذف النسختان الأخريان نهائيًا.',
    'cloud.conflicts.keepThisOneMessage_few': 'ستُحذف {count} نسخ أخرى نهائيًا.',
    'cloud.conflicts.keepThisOneMessage_many': 'ستُحذف {count} نسخة أخرى نهائيًا.',
    'cloud.conflicts.keepThisOneMessage_other':
      'عدد النسخ الأخرى التي ستُحذف نهائيًا: {count}.',
    'cloud.conflicts.entriesReturned_zero':
      'عدد السجلات المحذوفة على جهاز التي احتُفظ بها لأن جهازًا آخر كان لا يزال يحتفظ بها: {count}.',
    'cloud.conflicts.entriesReturned_one':
      'احتُفظ بسجل محذوف على جهاز لأن جهازًا آخر كان لا يزال يحتفظ به.',
    'cloud.conflicts.entriesReturned_two':
      'احتُفظ بسجلين محذوفين على جهاز لأن جهازًا آخر كان لا يزال يحتفظ بهما.',
    'cloud.conflicts.entriesReturned_few':
      'احتُفظ بـ{count} سجلات محذوفة على جهاز لأن جهازًا آخر كان لا يزال يحتفظ بها.',
    'cloud.conflicts.entriesReturned_many':
      'احتُفظ بـ{count} سجلًا محذوفًا على جهاز لأن جهازًا آخر كان لا يزال يحتفظ بها.',
    'cloud.conflicts.entriesReturned_other':
      'عدد السجلات المحذوفة على جهاز التي احتُفظ بها لأن جهازًا آخر كان لا يزال يحتفظ بها: {count}.',
    'cloud.progress.devicesChecked_zero': 'الأجهزة التي تم فحصها: {done} من {count}',
    'cloud.progress.devicesChecked_one': 'تم فحص {done} من جهاز واحد',
    'cloud.progress.devicesChecked_two': 'تم فحص {done} من جهازين',
    'cloud.progress.devicesChecked_few': 'تم فحص {done} من {count} أجهزة',
    'cloud.progress.devicesChecked_many': 'تم فحص {done} من {count} جهازًا',
    'cloud.progress.devicesChecked_other': 'الأجهزة التي تم فحصها: {done} من {count}',
    'cloud.progress.filesDownloaded_zero': 'الملفات التي تم تنزيلها: {done} من {count}',
    'cloud.progress.filesDownloaded_one': 'تم تنزيل {done} من ملف واحد',
    'cloud.progress.filesDownloaded_two': 'تم تنزيل {done} من ملفين',
    'cloud.progress.filesDownloaded_few': 'تم تنزيل {done} من {count} ملفات',
    'cloud.progress.filesDownloaded_many': 'تم تنزيل {done} من {count} ملفًا',
    'cloud.progress.filesDownloaded_other': 'الملفات التي تم تنزيلها: {done} من {count}',
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
    'cloud.conflicts.entriesEdited_other':
      '有 {count} 个条目同时在两台设备上被编辑。两个版本都在你的日记中。',
    'cloud.conflicts.keepThisOneMessage_other': '其他 {count} 个版本将被永久删除。',
    'cloud.conflicts.entriesReturned_other':
      '你在一台设备上删除的 {count} 个条目被保留了，因为另一台设备上仍有它们。',
    'cloud.progress.devicesChecked_other': '已检查 {count} 台设备中的 {done} 台',
    'cloud.progress.filesDownloaded_other': '已下载 {count} 个文件中的 {done} 个',
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
    'cloud.conflicts.entriesEdited_other':
      '有 {count} 則紀錄同時在兩部裝置上被編輯。兩個版本都在你的日記中。',
    'cloud.conflicts.keepThisOneMessage_other': '其他 {count} 個版本將被永久刪除。',
    'cloud.conflicts.entriesReturned_other':
      '你在一部裝置上刪除的 {count} 則紀錄被保留了，因為另一部裝置上仍有它們。',
    'cloud.progress.devicesChecked_other': '已檢查 {count} 台裝置中的 {done} 台',
    'cloud.progress.filesDownloaded_other': '已下載 {count} 個檔案中的 {done} 個',
  },
} satisfies Record<
  SupportedLocale,
  Partial<Record<`${TranslationKey}_${PluralCategory}`, string>>
>;
