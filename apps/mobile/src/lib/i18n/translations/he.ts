import type { Translations } from '../types';

/**
 * Hebrew (he) translations
 * Contains translations for all UI strings used in the application
 */
export const he: Translations = {
  // Cold-start header greeting
  'greeting.welcomeBack': 'טוב שחזרת',
  'greeting.goodMorning': 'בוקר טוב',
  'greeting.goodAfternoon': 'צהריים טובים',
  'greeting.goodEvening': 'ערב טוב',
  'greeting.happySunday': 'יום ראשון נעים',
  'greeting.happyMonday': 'יום שני נעים',
  'greeting.happyTuesday': 'יום שלישי נעים',
  'greeting.happyWednesday': 'יום רביעי נעים',
  'greeting.happyThursday': 'יום חמישי נעים',
  'greeting.happyFriday': 'יום שישי נעים',
  'greeting.happySaturday': 'שבת נעימה',
  'greeting.withName': '{greeting}, {name}',

  // Common
  'common.tackbok': 'טאקבוק',
  'common.cancel': 'ביטול',
  'common.done': 'בוצע',
  'common.save': 'שמור',
  'common.back': 'חזור',
  'common.create': 'צור',
  'common.discard': 'בטל שינויים',
  'common.delete': 'מחק',
  'common.remove': 'הסר',
  'common.close': 'סגור',
  'common.play': 'נגן',
  'common.pause': 'השהה',
  'common.settings': 'הגדרות',
  'common.shareFeedback': 'שתף משוב',
  'common.contactUs': 'צור קשר',
  'common.unknownError': 'שגיאה לא ידועה',
  'common.retry': 'נסה שוב',

  // Header & Search
  'search.searchGratitudeLogs': 'חיפוש ברשומות…',
  'search.startTypingToSearchYourGratitudeLogs': 'אפשר להקליד כדי לחפש ברשומות',
  'search.searchFailed': 'החיפוש נכשל',
  'search.noResults': 'אין תוצאות',

  // Gratitude
  'gratitude.whatAreYouGratefulForToday': 'על מה יש לך להודות היום?',
  'gratitude.whatWereYouGratefulForYesterday': 'על מה הרגשת הכרת תודה אתמול?',
  'gratitude.whatAreYouGratefulFor': 'על מה יש לך להודות?',
  'gratitude.whatWereYouGratefulFor': 'על מה הרגשת הכרת תודה?',
  'gratitude.failedToLoadEntries': 'טעינת הרשומות נכשלה',
  'gratitude.writeNow': 'כתוב עכשיו',
  'gratitude.pickADate': 'בחר תאריך',
  'gratitude.playWithPet': 'לשחק עם חיית המחמד',
  'gratitude.collapseGratitudeActions': 'כווץ פעולות הודיה',
  'gratitude.expandGratitudeActions': 'הרחב פעולות הודיה',

  // Date Entries
  'dateEntries.loading': 'טוען...',
  'dateEntries.noEntriesForThisDate': 'אין רשומות לתאריך זה',
  'dateEntries.createEntry': 'צור רשומה',
  'dateEntries.somethingWentWrongCreatingNewEntry': 'משהו השתבש. נוצרת רשומה חדשה.',

  // Gratitude Entry
  'entry.deleteEntry': 'מחק רשומה?',
  'entry.thisEntryWillBePermanentlyDeleted': 'רשומה זו תימחק לצמיתות.',
  'entry.entryNotFound': 'הרשומה לא נמצאה',
  'entry.leaveWithoutSaving': 'לצאת ללא שמירה?',
  'entry.discardChanges.message': 'השינויים לא נשמרו. להמשיך לערוך או לבטל את השינויים?',
  'entry.keepEditing': 'המשך עריכה',

  'entry.pickAnyDate': 'בחר תאריך כלשהו',
  'entry.mood': 'מצב רוח',
  'entry.photo': 'תמונה',
  'entry.addPhoto': 'הוסף תמונה',
  'entry.takePhoto': 'צלם תמונה',
  'entry.chooseFromLibrary': 'בחר מהספרייה',
  'entry.maximumCountPhotosPerEntry': 'מקסימום {count} תמונות לרשומה',
  'entry.maximumCountVoiceMemosPerEntry': 'מקסימום {count} הקלטות קוליות לרשומה',
  'entry.cameraAccessRequired': 'נדרשת גישה למצלמה',
  'entry.photoLibraryAccessRequired': 'נדרשת גישה לספריית התמונות',
  'entry.pleaseEnableCameraAccessInYourDeviceSettingsToTake':
    'אנא אפשר גישה למצלמה בהגדרות המכשיר שלך כדי לצלם תמונות.',
  'entry.pleaseEnablePhotoLibraryAccessInYourDeviceSettingsTo':
    'אנא אפשר גישה לספריית התמונות בהגדרות המכשיר שלך כדי לבחור תמונות.',
  'entry.openSettings': 'פתח הגדרות',
  'entry.voice': 'קול',
  'entry.microphoneAccessRequired': 'נדרשת גישה למיקרופון',
  'entry.pleaseEnableMicrophoneAccessInYourDeviceSettingsToRecord':
    'אנא אפשר גישה למיקרופון בהגדרות המכשיר שלך כדי להקליט הקלטות קוליות.',
  'entry.recordVoiceNote': 'הקלטה קולית',
  'entry.tapTheButtonBelowWhenReady': 'הקש על הכפתור למטה כשאתה מוכן.',
  'entry.startRecording': 'התחל הקלטה',
  'entry.recordingVoiceNote': 'הקלטה קולית מתבצעת…',
  'entry.stopRecording': 'הפסק הקלטה',
  'entry.voiceNoteRecorded': 'ההקלטה הקולית הושלמה',
  'entry.tapOnThePlayButtonToListen': 'להאזנה, יש ללחוץ על כפתור ההשמעה.',
  'entry.saveRecording': 'שמור הקלטה',
  'entry.discardRecording': 'בטל הקלטה',
  'entry.voiceNotesSaveAutomaticallyAt3000':
    'הקלטות קוליות נשמרות אוטומטית לאחר 30 דקות.',
  'entry.titleOptional': 'כותרת (אופציונלי)',
  'entry.usePrompt': 'השתמש בהנחיה',
  'entry.newPrompt': 'הנחיה חדשה',
  'entry.addPrompt': 'הוסף הנחיה',
  'entry.showAll': 'הצג הכל',
  'entry.promptText': 'טקסט ההנחיה',
  'entry.promptAlreadyExists': 'ההנחיה כבר קיימת',
  'entry.promptCreated': 'ההנחיה נוצרה',
  'entry.failedToCreatePrompt': 'יצירת ההנחיה נכשלה',
  'entry.promptUpdated': 'ההנחיה עודכנה',
  'entry.failedToUpdatePrompt': 'עדכון ההנחיה נכשל',
  'entry.promptDeleted': 'ההנחיה נמחקה',
  'entry.failedToDeletePrompt': 'מחיקת ההנחיה נכשלה',
  'entry.faith': 'אמונה',
  'entry.self': 'עצמי',
  'entry.health': 'בריאות',
  'entry.friends': 'חברים',
  'entry.family': 'משפחה',
  'entry.littleThings': 'דברים קטנים',
  'entry.createPrompt': 'צור הנחיה',
  'entry.createAPrompt': 'יצירת הנחיה',
  'entry.editPrompt': 'ערוך הנחיה',
  'entry.deletePrompt': 'מחק הנחיה',
  'entry.deletePrompt2': 'למחוק את ההנחיה?',
  'entry.areYouSureYouWantToDeleteThisPrompt':
    'האם אתה בטוח שברצונך למחוק את ההנחיה הזו?',
  'entry.noPromptsYet': 'אין הנחיות עדיין',
  'entry.createYourFirstPrompt': 'צור את ההנחיה הראשונה שלך',

  // Prompts - Faith
  prompt_faith_1: 'מה הזיכרון המוקדם ביותר שלך של תחושת נוכחותו של אלוהים?',
  prompt_faith_2: 'איפה ראית חסד בחייך לאחרונה?',
  prompt_faith_3: 'איזו תפילה עזרה לך בתקופה קשה?',
  prompt_faith_4: 'איך האמונה שלך שינתה את האופן שבו אתה מסתכל על אתגרים?',
  prompt_faith_5: 'איזו פרקטיקה או הרגל רוחני מביא לך את מירב השלווה?',
  prompt_faith_6: 'כתוב על זמן בו הרגשת שאתה מונחה בבירור על ידי כוח עליון.',
  prompt_faith_7: 'איזה לימוד או ציטוט ספציפי נותן לך השראה בחיי היומיום?',
  prompt_faith_8: 'איך אתה מוצא חיבור רוחני בעיצומו של שבוע עמוס?',
  prompt_faith_9: 'הרהר ברגע בו האמונה שלך הציעה לך נחמה בזמן של חוסר ודאות.',

  // Prompts - Self
  prompt_self_1: 'ממה אתה צריך יותר בחיים שלך?',
  prompt_self_2: 'מהו דבר שהיה קשה לעשות ובכל זאת עשית אותו?',
  prompt_self_3: 'מה היית אומר לעצמך הצעיר היום?',
  prompt_self_4: 'מהו הישג אחרון שלא חגגת מספיק?',
  prompt_self_5: 'כתוב שלושה דברים שאתה אוהב באישיות שלך.',
  prompt_self_6: 'איך צמחת מטעות שעשית לאחרונה?',
  prompt_self_7: 'איזה גבול עליך להציב כדי להגן על האנרגיה שלך?',
  prompt_self_8: 'באיזה תחום בחייך אתה מרגיש הכי אותנטי?',
  prompt_self_9: 'תאר את היום האידיאלי שלך מהבוקר ועד הלילה.',

  // Prompts - Health
  prompt_health_1: 'לאיזה חלק בגופך אתה הכי מודה היום?',
  prompt_health_2: 'איך המנוחה עזרה לך לאחרונה?',
  prompt_health_3: 'על איזה הרגל בריא אתה גאה שהצלחת לשמור?',
  prompt_health_4: 'מהי ארוחה מזינה שתמיד גורמת לך להרגיש טוב?',
  prompt_health_5: 'תאר פעילות גופנית שמביאה לך שמחה במקום להרגיש כמו מטלה.',
  prompt_health_6: 'איך הגוף שלך מספר לך כשהוא צריך להאט או לנוח?',
  prompt_health_7: 'מה אתה עושה היום כדי לדאוג לרווחה הנפשית שלך?',
  prompt_health_8: 'כתוב על זמן בו התגברת על אתגר פיזי או פציעה.',
  prompt_health_9: 'איזה שינוי קטן אתה יכול לעשות כדי לשפר את איכות השינה שלך?',

  // Prompts - Friends
  prompt_friends_1: 'איזה חבר הפך את חייך לקלים יותר לאחרונה?',
  prompt_friends_2: 'איזה זיכרון עם חבר עדיין גורם לך לחייך?',
  prompt_friends_3: 'את מי היית רוצה לעודד השבוע?',
  prompt_friends_4: 'איזו תכונה אתה הכי מעריך בחברויות הקרובות שלך?',
  prompt_friends_5: 'כתוב על חבר שעזר לך לראות דברים מנקודת מבט שונה.',
  prompt_friends_6: 'איך אתה מעדיף להראות את ההערכה והאהבה שלך לחבריך?',
  prompt_friends_7: 'מי הוא חבר שלא דיברת איתו זמן מה, ומה היית אומר לו?',
  prompt_friends_8: 'תאר הרפתקה מהנה או בלתי צפויה שהייתה לך עם חבר.',
  prompt_friends_9: 'מהו שיעור שלמדת מאחת החברויות שלך?',

  // Prompts - Family
  prompt_family_1: 'לאיזו מסורת משפחתית אתה אסיר תודה?',
  prompt_family_2: 'מי במשפחתך לימד אותך משהו שנשאר איתך?',
  prompt_family_3: 'מהו רגע קטן עם המשפחה שתרצה לזכור?',
  prompt_family_4: 'מהו סיפור מההיסטוריה של המשפחה שלך שאתה מוצא בו השראה?',
  prompt_family_5: 'איך מערכת היחסים שלך עם בן משפחה התפתחה לאורך זמן?',
  prompt_family_6: 'כתוב על מיומנות או מתכון שעברו מדור לדור במשפחתך.',
  prompt_family_7: 'איזו תכונת אופי ספציפית אתה חולק עם הורה או אח?',
  prompt_family_8: 'תאר זיכרון ילדות שעדיין מביא לך שמחה עצומה.',
  prompt_family_9: 'איך המשפחה שלך תומכת זה בזה בזמנים קשים?',

  // Prompts - Little Things
  prompt_littleThings_1: 'מה גרם לך לחייך היום?',
  prompt_littleThings_2: 'איזה רגע קטן גרם לך לעצור היום?',
  prompt_littleThings_3: 'איזו נחמה יומיומית היית הכי מתגעגע אליה?',
  prompt_littleThings_4: 'תאר פרט קטן ויומיומי בסביבתך שנראה לך יפה.',
  prompt_littleThings_5: 'מהו הצליל האהוב עליך לשמוע כשאתה מתעורר בבוקר?',
  prompt_littleThings_6: 'כתוב על הנאה פשוטה שאתה מצפה לה כל יום.',
  prompt_littleThings_7: 'מה היה החלק הטוב ביותר בשגרת הבוקר שלך היום?',
  prompt_littleThings_8: 'תאר מפגש קצר עם אדם זר ששימח אותך.',
  prompt_littleThings_9: 'מהו פריט זול שמביא ערך רב לחייך?',

  // Default Worksheet Template Keys
  'worksheet.whatIAmGratefulForToday': 'על מה אני אסיר תודה היום...',
  'worksheet.myAffirmationForToday': 'האמירה המחזקת שלי להיום...',
  'worksheet.oneLittleThingThatMadeMeSmileRecently':
    'דבר קטן אחד שגרם לי לחייך לאחרונה...',

  // Moods
  'mood.amazing': 'מדהים',
  'mood.happy': 'שמח',
  'mood.okay': 'בסדר',
  'mood.sad': 'עצוב',
  'mood.awful': 'נורא',
  'mood.howAreYouFeeling': 'איך אתה מרגיש?',
  'mood.feelingAmazing': 'תחושה נהדרת',
  'mood.feelingHappy': 'תחושת שמחה',
  'mood.feelingOkay': 'תחושה סבירה',
  'mood.feelingSad': 'תחושת עצב',
  'mood.feelingAwful': 'תחושה נוראה',
  'mood.entrySavedSuccessfully': 'הרשומה נשמרה בהצלחה',
  'mood.failedToSaveEntry': 'שמירת הרשומה נכשלה',
  'mood.failedToSaveVoiceMemo': 'שמירת התזכורת הקולית נכשלה',
  'mood.failedToAddPhotos': 'הוספת התמונות נכשלה',
  'mood.failedToDeleteEntry': 'מחיקת הרשומה נכשלה',
  'mood.tagAlreadyExists': 'התגית כבר קיימת',
  'mood.tagCreated': 'התגית נוצרה',
  'mood.failedToCreateTag': 'יצירת התגית נכשלה',
  'mood.tagUpdated': 'התגית עודכנה',
  'mood.failedToUpdateTag': 'עדכון התגית נכשל',
  'mood.tagDeleted': 'התגית נמחקה',
  'mood.failedToDeleteTag': 'מחיקת התגית נכשלה',

  // Tags
  'tags.tag': 'תגית',
  'tags.tagName': 'שם תגית',
  'tags.addATag': 'הוספת תגית',
  'tags.createNewTag': 'יצירת תגית',
  'tags.editTag': 'ערוך תגית',
  'tags.deleteTag': 'מחק תגית',
  'tags.areYouSureYouWantToDeleteTheTagTitle':
    'האם אתה בטוח שברצונך למחוק את התגית "{title}"?',

  // Milestones
  'milestone.daysOfGratitude': 'ימים של הכרת טובה',

  // Settings - Profile
  'profile.yourName': 'השם שלך',
  'profile.changePhoto': 'שנה תמונה',
  'profile.profilePhoto': 'תמונת פרופיל',
  'profile.wouldYouLikeToUpdateOrRemoveYourProfilePhoto':
    'האם ברצונך לעדכן או להסיר את תמונת הפרופיל שלך?',
  'profile.updatePhoto': 'עדכן תמונה',
  'profile.removePhoto': 'הסר תמונה',

  // Settings
  'settings.language': 'שפה',
  'settings.selectLanguage': 'בחר שפה',
  'settings.deviceDefault': 'ברירת מחדל של המכשיר',
  'settings.restartRequired': 'נדרש אתחול מחדש',
  'settings.languageChangeRequiresAppRestartProceed':
    'שינוי השפה דורש הפעלה מחדש של טאקבוק. להמשיך?',
  'settings.proceed': 'המשך',
  'settings.reloadApp': 'טען מחדש את האפליקציה',

  // Settings - Notifications
  'notifications.notifications': 'התראות',
  'notifications.dailyReminder': 'תזכורת יומית',
  'notifications.dailyReminderNotificationsAreOn': 'התראות תזכורת יומיות מופעלות',
  'notifications.dailyReminderNotificationsAreOff': 'התראות תזכורת יומיות כבויות',
  'notifications.adjustReminderTime': 'התאמת זמן התזכורת',
  'notifications.changeYourDailyReminderTime': 'שנה את זמן התזכורת היומית שלך',
  'notifications.failedToUpdateReminder': 'עדכון התזכורת נכשל',
  'notifications.notificationPermissionNeeded': 'נדרשת הרשאת התראות',
  'notifications.toGetDailyRemindersAllowNotificationsForTackbokInYour':
    'כדי לקבל תזכורות יומיות, אפשר התראות עבור Tackbok בהגדרות המכשיר.',

  // Settings - Appearance
  'appearance.appearance': 'מראה',
  'appearance.theme': 'ערכת נושא',
  'appearance.selectATheme': 'בחר ערכת נושא',
  'appearance.countThemesAndColorSchemes': '{count} ערכות נושא וסכמות צבע',
  'appearance.timelineEntryLength': 'אורך רשומה בציר הזמן',
  'appearance.numberOfLinesShownInTheTimeline':
    'מספר השורות המוצגות בציר הזמן. לחיצה על רשומה מציגה את הטקסט המלא.',
  'appearance.showTimelineBorders': 'הצג גבולות ציר זמן',
  'appearance.showTheBordersInTheTimeline': 'הצג את הגבולות בציר הזמן',
  'appearance.hideTheBordersInTheTimeline': 'הסתר את הגבולות בציר הזמן',
  'appearance.dateStyle': 'סגנון תאריך',
  'appearance.dateIncludesDayOfTheWeek': 'התאריך כולל את יום השבוע',
  'appearance.firstDayOfWeek': 'היום הראשון בשבוע',
  'appearance.setTheFirstDayOfTheWeekInTheCalendar':
    'הגדר את היום הראשון בשבוע בתצוגת היומן',

  // Settings - Typography
  'typography.typography': 'טיפוגרפיה',
  'typography.titleFont': 'גופן כותרת',
  'typography.chooseAFontForTitlesAndHeadings': 'בחר גופן עבור כותרות וכותרות משנה',
  'typography.default': 'ברירת מחדל',
  'typography.themeDefault': 'ברירת מחדל של ערכת הנושא',
  'typography.fontSize': 'גודל גופן',
  'typography.adjustTheSizeOfBodyText': 'התאם את גודל טקסט הגוף',
  'typography.small': 'קטן',
  'typography.large': 'גדול',
  'typography.previewOfTheSelectedFont': 'תצוגה מקדימה של הגופן הנבחר',
  'typography.gratitudeMakesTodayBrighter': 'הכרת תודה הופכת את היום לבהיר יותר',

  // Settings - Journaling
  'journaling.journaling': 'כתיבה יומית',
  'journaling.editWorksheetTemplate': 'ערוך את תבנית דף הכתיבה',
  'journaling.resetToDefault': 'אפס לברירת המחדל',
  'journaling.journalingWorksheet': 'דף כתיבה יומי',
  'journaling.startWriting': 'התחל לכתוב',
  'journaling.journalFocusAreas': 'תחומי התמקדות ביומן',
  'journaling.personalizeYourJournalPrompts': 'התאם אישית את ההנחיות ביומן שלך.',
  'journaling.pickTheTopicsYouWantToWriteAbout': 'בחר את הנושאים שברצונך לכתוב עליהם.',
  'journaling.selectAtLeast2FocusAreas': 'בחר לפחות 2 תחומי התמקדות',
  'journaling.journalPrompts': 'הנחיות יומן',
  'journaling.chooseWhichPromptsToShowWhenStartingANewJournal':
    'בחר אילו הנחיות להציג בעת התחלת רשומה חדשה.',
  'journaling.off': 'כבוי',
  'journaling.allPrompts': 'כל ההנחיות',
  'journaling.myPrompts': 'ההנחיות שלי',
  'journaling.builtInPrompts': 'הנחיות מובנות',
  'journaling.focusareaSelfDesc': 'הרהר בתחביבים, תחומי עניין, חוויות וחיים בכלל.',
  'journaling.focusareaLittlethingsDesc':
    'הוקר את הדברים הקטנים והברכות היומיומיות שלעתים נעלמות מעינינו.',
  'journaling.focusareaHealthDesc': 'הוקר את הברכות הרבות של גופך ויכולותיו.',
  'journaling.focusareaFamilyDesc': 'הוקר את בני משפחתך ואת הרגעים שחלקת עמם.',
  'journaling.focusareaFriendsDesc': 'הוקר את חבריך האוהבים, התומכים והמבינים.',
  'journaling.focusareaFaithDesc': 'התמקד בהערכת האמונה, הרוחניות והשלווה הפנימית שלך.',

  // Settings - Security
  'security.security': 'אבטחה',
  'security.lockAfter': 'נעילה לאחר',
  'security.timeAwayFromTheAppBeforeRequiringAnUnlock':
    'משך הזמן מחוץ לאפליקציה לפני שנדרשת פתיחת נעילה.',
  'security.0Seconds': '0 שניות',
  'security.30Seconds': '30 שניות',
  'security.1Minute': 'דקה אחת',
  'security.2Minutes': '2 דקות',
  'security.unlockTackbok': 'פתיחת טאקבוק',
  'security.lockWithYourDeviceScreenLock':
    'טאקבוק יכול להינעל באמצעות נעילת המסך של המכשיר — ביומטריה, קוד PIN, קו ביטול נעילה או סיסמה',
  'security.unlock': 'ביטול נעילה',
  'security.appLockUnavailable': 'נעילת האפליקציה אינה זמינה',
  'security.setUpAScreenLockPinPatternOrBiometricsIn':
    'תחילה יש להגדיר נעילת מסך (קוד PIN, קו ביטול נעילה או ביומטריה) בהגדרות המכשיר.',

  // Settings - Backup & Restore
  'backup.backupRestore': 'גיבוי ושחזור',
  'backup.googleDriveBackup': 'גיבוי ל-Google Drive',
  'backup.exportAsZip': 'ייצוא לקובץ ZIP',
  'backup.allOfYourDataInAFormatThatYouCan':
    'כל הנתונים שלך בפורמט שניתן לשחזר באפליקציה מאוחר יותר',
  'backup.importAsZip': 'ייבוא מקובץ ZIP',
  'backup.restoreYourDataFromAZipFile': 'שחזר את הנתונים שלך מקובץ .zip',
  'backup.importFromGratitudeApp': 'ייבוא מאפליקציית Gratitude',
  'backup.importingFromGratitudeApp': 'מייבא מאפליקציית Gratitude',
  'backup.importDataFromAGratitudeAppZipBackup':
    'ייבוא נתונים מקובץ .zip של אפליקציית Gratitude',
  'backup.chooseImportMode': 'בחר מצב ייבוא',
  'backup.howShouldThisImportHandleEntriesThatAlreadyExistIn':
    'כיצד ייבוא זה צריך לטפל ברשומות שכבר קיימות בטאקבוק?',
  'backup.skipExistingEntries': 'דלג על רשומות קיימות',
  'backup.skipExistingEntriesRecommended': 'דלג על רשומות קיימות (מומלץ)',
  'backup.onlyImportEntriesWithNewNoteIds': 'ייבא רק רשומות עם מזהי הערות חדשים',
  'backup.overwriteMatchingEntries': 'החלף רשומות תואמות',
  'backup.replaceExistingEntriesWhenNoteIdsMatch':
    'החלף רשומות קיימות כאשר מזהי ההערות תואמים',
  'backup.importFromPresentlyApp': 'ייבוא מאפליקציית Presently',
  'backup.restoreYourDataFromAPresentlyCsvFile':
    'שחזר את הנתונים שלך מקובץ .csv של Presently',
  'backup.importFromPresently': 'ייבוא מ-Presently?',
  'backup.thisWillImportEntriesFromAPresentlyAppCsvFile':
    'פעולה זו תייבא רשומות מקובץ CSV של אפליקציית Presently. רשומות כפולות לא יובאו.',
  'backup.backupExportedSuccessfully': 'הגיבוי יוצא בהצלחה',
  'backup.exportFailed': 'הייצוא נכשל',
  'backup.importFailed': 'הייבוא נכשל',
  'backup.restoringTackbokBackup': 'משחזר גיבוי של טאקבוק',
  'backup.loadPresentlyExport': 'טוען ייצוא של Presently',
  'backup.importJournalEntries': 'מייבא רשומות יומן',
  'backup.openBackupFile': 'פותח קובץ גיבוי',
  'backup.validateBackupContents': 'מאמת תוכן גיבוי',
  'backup.restoreProfile': 'משחזר פרופיל',
  'backup.importTagsAndPrompts': 'מייבא תגיות והנחיות',
  'backup.restoreEntriesAndMedia': 'משחזר רשומות ומדיה',
  'backup.refreshJournalData': 'מרענן נתוני יומן',
  'backup.loadingTheSelectedImportFile': 'טוען את קובץ הייבוא שנבחר.',
  'backup.checkingBackupContentsAndFileStructure': 'בודק את תוכן הגיבוי ומבנה הקובץ.',
  'backup.restoringProfileDetailsAndProfilePhotoIfAvailable':
    'משחזר פרטי פרופיל ותמונת פרופיל במידה וזמינה.',
  'backup.addingTagsAndPromptsBeforeEntriesAreRestored':
    'מוסיף תגיות והנחיות לפני שחזור הרשומות.',
  'backup.processingProcessedOfTotalJournalEntriesAndAttachedMedia':
    'מעבד {processed} מתוך {total} רשומות יומן ומדיה מצורפת.',
  'backup.noJournalEntriesFoundInThisBackup': 'לא נמצאו רשומות יומן בגיבוי זה.',
  'backup.refreshingYourJournalSoImportedDataAppearsEverywhere':
    'מרענן את היומן שלך כך שהנתונים המיובאים יופיעו בכל מקום.',
  'backup.entriesProcessed': 'רשומות שעובדו',
  'backup.entriesSkippedDueToErrors': 'רשומות שנדלגו עקב שגיאות',
  'backup.pleaseDoNotCloseOrMinimizeTheAppWhileThe':
    'אנא אל תסגור או תמזער את האפליקציה בזמן שהייבוא בעיצומו.',
  'backup.tagsAdded': 'תגיות שנוספו',
  'backup.promptsAdded': 'הנחיות שנוספו',
  'backup.photosRestored': 'תמונות ששוחזרו',
  'backup.voiceMemosRestored': 'הקלטות קוליות ששוחזרו',
  'backup.mediaSkipped': 'מדיה שנדלגה',
  'backup.tackbokBackupRestored': 'גיבוי טאקבוק שוחזר',
  'backup.gratitudeImportComplete': 'ייבוא מ-Gratitude הושלם',
  'backup.presentlyImportComplete': 'ייבוא מ-Presently הושלם',
  'backup.yourJournalDataIsReadyToReviewButSomeItems':
    'נתוני היומן שלך מוכנים לבדיקה, אך לא ניתן היה לשחזר פריטים מסוימים.',
  'backup.yourJournalDataIsReadyToReview': 'נתוני היומן שלך מוכנים לבדיקה.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe':
    'הייבוא הסתיים עם אזהרות. לא ניתן היה לשחזר פריטים מסוימים, וכל השאר כבר היה קיים בטאקבוק.',
  'backup.thisImportFinishedButEverythingAlreadyExistedInTackbok':
    'הייבוא הסתיים, אך הכל כבר היה קיים בטאקבוק.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe2':
    'הייבוא הסתיים עם אזהרות. לא ניתן היה לשחזר פריטים מסוימים.',
  'backup.thisImportFinishedSuccessfully': 'הייבוא הסתיים בהצלחה.',
  'backup.importedFromTackbokBackup': 'יובא מגיבוי של טאקבוק',
  'backup.importedFromGratitudeBackup': 'יובא מגיבוי של Gratitude',
  'backup.importedFromPresentlyExport': 'יובא מייצוא של Presently',
  'backup.newEntries': 'רשומות חדשות',
  'backup.updatedEntries': 'רשומות מעודכנות',
  'backup.skippedDuplicates': 'דילג על כפילויות',
  'backup.import': 'ייבוא',

  // Settings - App Information
  'appInfo.appInformation': 'מידע על האפליקציה',
  'appInfo.faq': 'שאלות נפוצות',
  'appInfo.readFrequentlyAskedQuestions': 'קרא את השאלות הנפוצות של טאקבוק',
  'appInfo.shareTackbok': 'שתף את טאקבוק',
  'appInfo.shareTheAppWithFriendsAndFamily':
    'נהנה מטאקבוק? שתף את האפליקציה עם חברים ומשפחה',
  'appInfo.practiceGratitudeWithTackbokASimpleFreeAndPrivateGratitude':
    'תרגל הכרת תודה עם טאקבוק, אפליקציה פשוטה, חינמית ופרטית ליומן תודה',
  'appInfo.supportTackbok': 'תמיכה בטאקבוק',
  'appInfo.tackbokIsFreeToUseAndThatsNotChangingIf':
    'טאקבוק חינמית לשימוש, וזה לא עומד להשתנות. אם היא הכניסה קצת יותר הכרת תודה ליום שלך, אפשר לתמוך בה, אך אין שום דבר לפתוח. כולם מקבלים את אותה אפליקציה.',
  'appInfo.keepingTackbokRunningCurrentlyCostsAboutUs3325Per':
    'הפעלת טאקבוק עולה כיום כ־33.25 דולר ארה״ב בחודש, לפני מסים, עמלות וחריגות שימוש. אם טאקבוק מועילה לך, גם תרומה קטנה עוזרת לשמור עליה חינמית לכולם.',
  'appInfo.waysToSupport': 'דרכים לתמוך',
  'appInfo.free': 'חינם',
  'appInfo.smallThanks': 'תודה קטנה',
  'appInfo.helpsMeFinishWork10MinutesEarlier': 'עוד 10 דקות פנויות בסוף יום העבודה',
  'appInfo.heartfeltThanks': 'תודה מכל הלב',
  'appInfo.helpsPayForHostingAndOnlineServices': 'עוזר לשלם על אחסון ושירותים מקוונים',
  'appInfo.bigThanks': 'תודה גדולה',
  'appInfo.helpsTestAndReleaseTackbokUpdates': 'עוזר לבדוק ולפרסם עדכונים לטאקבוק',
  'appInfo.deepestThanks': 'תודה ענקית',
  'appInfo.helpsCoverOneMonthOfTackboksRunningCostsAndOngoing':
    'עוזר לכסות חודש אחד של עלויות התפעול והמשך הפיתוח של טאקבוק',
  'appInfo.unavailable': 'לא זמין',
  'appInfo.supportOptionsCouldNotBeLoadedPleaseTryAgain':
    'לא ניתן לטעון את אפשרויות התמיכה. נסה שוב.',
  'appInfo.youAppearToBeOfflineCheckYourConnectionAndTry':
    'נראה שאין חיבור לאינטרנט. בדוק את החיבור ונסה שוב.',
  'appInfo.thePurchaseCouldNotBeCompletedPleaseTryAgain':
    'לא ניתן להשלים את הרכישה. נסה שוב.',
  'appInfo.paymentSuccessful': 'התשלום בוצע בהצלחה',
  'appInfo.thankYou': 'תודה!',
  'appInfo.yourSupportHelpsKeepTackbokFreeAndIndependentItGenuinely':
    'התמיכה שלך עוזרת לשמור על טאקבוק חינמית ועצמאית. זה באמת חשוב לנו מאוד.',
  'appInfo.thankYouForSupportingTackbokItGenuinelyMeansALot':
    'תודה על התמיכה בטאקבוק. זה באמת חשוב לנו מאוד.',
  'appInfo.yourPaymentIsPendingTheStoreWillFinishItWhen':
    'התשלום שלך בהמתנה. החנות תשלים אותו לאחר השלמת האישור או התשלום.',
  'appInfo.whereYourSupportHelps': 'כיצד התמיכה שלך עוזרת',
  'appInfo.cloudflareWorkers': 'Cloudflare Workers',
  'appInfo.expoEas': 'Expo EAS',
  'appInfo.appleDeveloperMembership': 'חברות Apple Developer',
  'appInfo.tackbokOrgDomain': 'הדומיין tackbok.org',
  'appInfo.googlePlayRegistration': 'רישום ב-Google Play',
  'appInfo.monthlyBaseline': 'עלות חודשית בסיסית',
  'appInfo.us5Month': 'US$5 לחודש',
  'appInfo.us19Month': 'US$19 לחודש',
  'appInfo.us99Year': 'US$99 לשנה',
  'appInfo.us12Year': 'US$12 לשנה',
  'appInfo.us25OneTime': 'US$25 חד-פעמי',
  'appInfo.aboutUs3325': 'כ־US$33.25',
  'appInfo.rateTackbok': 'דירוג טאקבוק',
  'appInfo.leaveAnHonestRatingInTheAppStore': 'השאר דירוג כן בחנות האפליקציות',
  'appInfo.unableToOpenTheStore': 'לא ניתן לפתוח את החנות',
  'appInfo.confirmTier': 'אישור {tier}',
  'appInfo.theStoreWillChargePriceForThisVoluntaryOneTime':
    'החנות תחייב {price} עבור תמיכה מרצון וחד-פעמית זו. היא לא פותחת תכונות וניתן לרכוש אותה שוב.',
  'appInfo.privacyPolicy': 'מדיניות פרטיות',
  'appInfo.readOurPrivacyPolicy': 'קרא את מדיניות הפרטיות של טאקבוק',
  'appInfo.termsConditions': 'תנאים והגבלות',
  'appInfo.readOurTermsAndConditions': 'קרא את התנאים וההגבלות שלנו',
  'appInfo.analytics': 'איסוף נתוני ניתוח',
  'appInfo.collectingAnonymizedAnalyticsToHelpDiagnoseProblems':
    'טאקבוק אוסף מידע אנליטי אנונימי כדי לעזור באבחון בעיות ומעקב אחר מגמות',
  'appInfo.checkForUpdates': 'בדיקת עדכונים',
  'appInfo.checkingForUpdates': 'בודק עדכונים…',
  'appInfo.lastCheckedTime': 'בדיקה אחרונה: {time}',
  'appInfo.never': 'מעולם לא',
  'appInfo.restart': 'הפעלה מחדש',
  'appInfo.restartToApply': 'הפעלה מחדש להחלה',
  'appInfo.updateDownloadedRestartToApplyIt': 'העדכון ירד. הפעל מחדש כדי להחיל אותו.',
  'appInfo.youAlreadyHaveTheLatestVersion': 'הגרסה האחרונה כבר מותקנת',
  'appInfo.unableToUpdate': 'לא ניתן לעדכן',
  'appInfo.version': 'מספר גרסה',

  // Settings - Danger Zone
  'dangerZone.dangerZone': 'אזור מסוכן',
  'dangerZone.deleteAllData': 'מחק את כל הנתונים',
  'dangerZone.deleteAllData2': 'למחוק את כל הנתונים?',
  'dangerZone.permanentlyDeleteAllYourAppData': 'מחיקת כל נתוני האפליקציה לצמיתות',
  'dangerZone.thisActionCannotBeUndoneAllYourAppDataWill':
    'לא ניתן לבטל פעולה זו. כל נתוני האפליקציה שלך יימחקו לצמיתות.',
  'dangerZone.allDataDeleted': 'כל הנתונים נמחקו',
  'dangerZone.allDataDeletedButSomeMediaFilesCouldNotBe':
    'כל הנתונים נמחקו, אך לא ניתן היה להסיר חלק מקובצי המדיה.',
  'dangerZone.deleteFailed': 'המחיקה נכשלה',

  // Time Picker
  'time.selectTime': 'בחר שעה',

  // Date Picker
  'calendar.today': 'היום',
  'calendar.yesterday': 'אתמול',
  'calendar.previousMonth': 'החודש הקודם',
  'calendar.nextMonth': 'החודש הבא',
  'calendar.selectMonth': 'בחר חודש',
  'calendar.selectYear': 'בחר שנה',
  'calendar.random': 'אקראי',
  'calendar.openARandomEntry': 'פתח רשומה אקראית',
  'calendar.sun': 'א',
  'calendar.mon': 'ב',
  'calendar.tue': 'ג',
  'calendar.wed': 'ד',
  'calendar.thu': 'ה',
  'calendar.fri': 'ו',
  'calendar.sat': 'ש',
  'calendar.sunday': 'ראשון',
  'calendar.monday': 'שני',
  'calendar.tuesday': 'שלישי',
  'calendar.wednesday': 'רביעי',
  'calendar.thursday': 'חמישי',
  'calendar.friday': 'שישי',
  'calendar.saturday': 'שבת',
  'calendar.january': 'ינואר',
  'calendar.february': 'פברואר',
  'calendar.march': 'מרץ',
  'calendar.april': 'אפריל',
  'calendar.may': 'מאי',
  'calendar.june': 'יוני',
  'calendar.july': 'יולי',
  'calendar.august': 'אוגוסט',
  'calendar.september': 'ספטמבר',
  'calendar.october': 'אוקטובר',
  'calendar.november': 'נובמבר',
  'calendar.december': 'דצמבר',
  'calendar.jan': 'ינו׳',
  'calendar.feb': 'פבר׳',
  'calendar.mar': 'מרץ',
  'calendar.apr': 'אפר׳',
  'calendar.may2': 'מאי',
  'calendar.jun': 'יוני',
  'calendar.jul': 'יולי',
  'calendar.aug': 'אוג׳',
  'calendar.sep': 'ספט׳',
  'calendar.oct': 'אוק׳',
  'calendar.nov': 'נוב׳',
  'calendar.dec': 'דצמ׳',

  // Onboarding
  'onboarding.skip': 'דילוג',
  'onboarding.continue': 'המשך',
  'onboarding.next': 'הבא',
  'onboarding.stepCurrentOfTotal': 'שלב {current} מתוך {total}',
  'onboarding.getStarted': 'בואו נתחיל',
  'onboarding.alreadyHaveAJournalImportIt': 'כבר יש לך יומן? אפשר לייבא אותו',
  'onboarding.aPrivatePlaceForYourGratitudeFreeOfflineYours':
    'מקום פרטי להכרת התודה שלך — חינמי, לא מקוון, ושלך בלבד.',
  'onboarding.importYourJournal': 'ייבוא היומן שלך',
  'onboarding.whereIsYourJournalComingFrom': 'מאיפה מגיע היומן שלך?',
  'onboarding.tackbokBackup': 'גיבוי Tackbok',
  'onboarding.gratitudeApp': 'אפליקציית Gratitude',
  'onboarding.presentlyApp': 'אפליקציית Presently',
  'onboarding.whatShouldWeCallYou': 'איך לקרוא לך?',
  'onboarding.yourNameIsOnlyUsedToGreetYouInsideThe':
    'השם משמש רק כדי לברך אותך בתוך האפליקציה.',
  'onboarding.yourNameOptional': 'השם שלך (אופציונלי)',
  'onboarding.staysOnYourDevice': 'נשאר במכשיר שלך.',
  'onboarding.makeItYours': 'התאימו אותו לעצמכם',
  'onboarding.pickALookYouCanChangeEverythingLaterInSettings':
    'בחרו מראה — אפשר לשנות הכול מאוחר יותר בהגדרות.',
  'onboarding.aWalkInTheMorningSun': 'טיול בשמש הבוקר',
  'onboarding.gratefulForQuietStreetsWarmCoffeeAndASkyFull':
    'תודה על רחובות שקטים, קפה חם ושמיים מלאי צבע.',
  'onboarding.moreThemes': 'עוד ערכות נושא…',
  'onboarding.whatDoYouWantToBeMoreGratefulFor': 'על מה תרצו להכיר תודה יותר?',
  'onboarding.wellSuggestWritingPromptsFromTheAreasYouPick':
    'נציע לכם רעיונות לכתיבה מהתחומים שתבחרו.',
  'onboarding.pickAtLeastCount': 'בחרו לפחות {count}',
  'onboarding.helpImproveTackbok': 'לעזור לשפר את Tackbok?',
  'onboarding.tackbokIsFreeAndOpenSourceAnonymousStatsHelpUs':
    'Tackbok חינמי ובקוד פתוח. סטטיסטיקות אנונימיות עוזרות לנו למצוא באגים ולהבין אילו תכונות חשובות.',
  'onboarding.anonymousUsageStatsOnlyIncludingWhichScreensAndFeaturesGet':
    'סטטיסטיקות שימוש אנונימיות בלבד — אילו מסכים ותכונות נמצאים בשימוש.',
  'onboarding.neverYourJournalContentPhotosVoiceMemosOrAnythingYou':
    'לעולם לא תוכן היומן, תמונות, הקלטות קוליות או כל דבר שמוקלד.',
  'onboarding.openSourceTheExactEventListIsPublicInThe':
    'קוד פתוח — רשימת האירועים המדויקת פומבית במאגר.',
  'onboarding.seeExactlyWhatWeCollect': 'ראו בדיוק מה אנחנו אוספים',
  'onboarding.shareAnonymousStats': 'שיתוף סטטיסטיקות אנונימיות',
  'onboarding.noThanks': 'לא, תודה',
  'onboarding.whatWeCollect': 'מה אנחנו אוספים',
  'onboarding.withYourPermissionTackbokRecordsLimitedAnonymousUsageInformationThis':
    'באישורך, Tackbok מתעדת מידע מוגבל ואנונימי על השימוש. המידע עשוי לכלול מסכים שנצפו, תכונות שנעשה בהן שימוש והאם פעולות אופציונליות הצליחו. הוא לעולם אינו כולל את תוכן היומן שלך או כל דבר שהקלדת.',
  'onboarding.auditTheAnalyticsCodeOnGithub': 'בדיקת קוד הניתוח ב-GitHub',
  'onboarding.neverCollected': 'לעולם לא נאסף',
  'onboarding.yourJournalTextTitlesPhotosVoiceMemosTagsNameEmail':
    'טקסט היומן, כותרות, תמונות, הקלטות קוליות, תגיות, שם, אימייל או כל דבר שמוקלד. בלי פרסומות, בלי מכירת נתונים, בלי מעקב של צד שלישי.',
  'onboarding.youreAllSetName': 'הכול מוכן, {name}!',
  'onboarding.youreAllSet': 'הכול מוכן!',
  'onboarding.twoLastThingsYouCanTurnOnBothAreOptional':
    'שני דברים אחרונים שאפשר להפעיל — שניהם אופציונליים.',
  'onboarding.addExampleEntries': 'הוספת רשומות לדוגמה',
  'onboarding.aFewSampleEntriesShowHowPhotosVoiceMemosMoods':
    'כמה רשומות לדוגמה מציגות את השימוש בתמונות, הקלטות קוליות, מצבי רוח ותגיות. אפשר להסיר אותן בכל רגע בלחיצה אחת.',
  'onboarding.remindMeDaily': 'תזכורת יומית',
  'onboarding.aGentleNudgeToWriteNeverYourJournalContent':
    'דחיפה עדינה לכתוב — לעולם לא תוכן היומן שלכם.',
  'onboarding.remindMeAtTime': 'להזכיר לי ב-{time}',
  'onboarding.settingThingsUp': 'רק רגע, מסדרים הכול…',
  'onboarding.startJournaling': 'להתחיל לכתוב',
  'onboarding.showingExampleEntries': 'מוצגות רשומות לדוגמה',
  'onboarding.removeAll': 'הסרת הכול',
  'onboarding.hideThisBanner': 'הסתרת ההודעה הזו',
  'onboarding.exampleEntriesRemoved': 'רשומות הדוגמה הוסרו',
  'onboarding.failedToRemoveExampleEntries': 'הסרת רשומות הדוגמה נכשלה',
  'onboarding.addTodaysEntryHere': 'הוסיפו כאן את הרשומה של היום.',
  'onboarding.pressAndHoldThenDragToMoveTheseButtonsAlong':
    'לחצו לחיצה ארוכה וגררו כדי להזיז את הכפתורים לאורך הקצה.',
  'onboarding.tapAnEntryToViewOrEditIt': 'לחיצה על רשומה מאפשרת לצפות בה או לערוך אותה.',
  'onboarding.findMemoriesByTextOrTag': 'מצאו זיכרונות לפי טקסט או תגית.',
  'onboarding.replayOnboarding': 'הפעלת ההיכרות מחדש',
  'onboarding.runTheWelcomeSetupAgain': 'הפעלת הגדרת הפתיחה מחדש',
  'onboarding.replayOnboarding2': 'להפעיל את ההיכרות מחדש?',
  'onboarding.theWelcomeSetupWillStartAgainYourJournalEntriesAnd':
    'הגדרת הפתיחה תתחיל מחדש. רשומות היומן וההגדרות שלכם נשמרות.',
  'onboarding.replay': 'הפעלה מחדש',

  // Onboarding sample entries (seeded content)
  sample_tag_family: 'משפחה',
  sample_tag_littleThings: 'דברים קטנים',
  sample_entry_welcome_title: 'ברוכים הבאים ל-Tackbok 👋',
  sample_entry_welcome_body:
    'זהו יומן הכרת התודה שלך — מקום לרגעים הטובים. אפשר ללחוץ על כפתור + כדי לכתוב שורה אחת או עמוד שלם, פעם ביום או בכל זמן שמתאים לך. לחיצה על הכרטיס הזה מציגה את הרשומה המלאה.',
  sample_entry_photos_title: 'רגעים קטנים',
  sample_entry_photos_body: 'אפשר לצרף תמונות לזיכרון. לחיצה על תמונה מגדילה אותה.',
  sample_entry_voice_title: 'במילים שלי',
  sample_entry_voice_body:
    'לפעמים קל יותר לומר את זה בקול. לחיצה על כפתור ההשמעה מפעילה הקלטה קולית קצרה.',
  sample_entry_tags_body:
    'הרשומה הזו עונה על אחת מהצעות הכתיבה ונושאת שתי תגיות. נסו את החיפוש למעלה וסננו לפי תגית כדי למצוא אותה שוב.',

  // Insights
  'insights.insights': 'תובנות',
  'insights.overview': 'סקירה כללית',
  'insights.gratitudeScore': 'מדד הכרת התודה',
  'insights.currentStreak': 'רצף נוכחי',
  'insights.longestStreak': 'הרצף הארוך ביותר',
  'insights.daysJournaled': 'ימי כתיבה',
  'insights.consistency': 'התמדה',
  'insights.entries': 'רשומות',
  'insights.less': 'פחות',
  'insights.more': 'יותר',
  'insights.yourHappiestDayIsWeekday': 'היום השמח ביותר שלך הוא {weekday}',
  'insights.moodOverTime': 'מצב הרוח לאורך זמן',
  'insights.writingHabits': 'הרגלי כתיבה',
  'insights.morning': 'בוקר',
  'insights.afternoon': 'צהריים',
  'insights.evening': 'ערב',
  'insights.night': 'לילה',
  'insights.youreAMorningWriter': 'הכתיבה שלך בעיקר בבוקר',
  'insights.youreAnAfternoonWriter': 'הכתיבה שלך בעיקר בצהריים',
  'insights.youreAnEveningWriter': 'הכתיבה שלך בעיקר בערב',
  'insights.youreANightWriter': 'הכתיבה שלך בעיקר בלילה',
  'insights.entriesPerMonth': 'רשומות לפי חודש',
  'insights.topTags': 'תגיות מובילות',
  'insights.totals': 'סיכומים',
  'insights.words': 'מילים',
  'insights.characters': 'תווים',
  'insights.photos': 'תמונות',
  'insights.voiceMemos': 'הקלטות קוליות',
  'insights.yourMemories': 'הזיכרונות שלך',
  'insights.onThisDay': 'ביום הזה',
  'insights.oneYearAgoToday': 'היום לפני שנה',
  'insights.oneMonthAgoToday': 'היום לפני חודש',
  'insights.countYearsAgoToday': 'היום לפני {count} שנים',
  'insights.aMomentFromThisDay': 'רגע מהיום הזה',
  'insights.noInsightsYet': 'אין תובנות עדיין',
  'insights.writeAFewEntriesAndYourStatsWillShowUp':
    'כתוב כמה רשומות והנתונים שלך יופיעו כאן.',

  // שיתוף והישגים
  'sharing.shareYourGratitude': 'שיתוף הכרת התודה שלך',
  'sharing.iWasGratefulFor': 'הכרתי תודה על',
  'sharing.shareImage': 'שיתוף תמונה',
  'sharing.shareEntry': 'שיתוף רשומה',
  'sharing.includeMood': 'הוספת מצב רוח',
  'sharing.moodIsHiddenUnlessYouIncludeIt': 'מצב הרוח מוסתר אלא אם בוחרים להוסיף אותו',
  'sharing.includePhotos': 'הוספת תמונות',
  'sharing.upToTheFirstFivePhotosWillBeShared': 'ישותפו עד חמש התמונות הראשונות',
  'sharing.chooseAStyle': 'בחירת סגנון',
  'sharing.sharingIsNotAvailableOnThisDevice': 'השיתוף אינו זמין במכשיר הזה',
  'sharing.couldNotShareImagePleaseTryAgain': 'לא ניתן לשתף את התמונה. נסו שוב.',
  'sharing.themeTheme': 'ערכת נושא {theme}',
  'sharing.themeThemeSelected': 'ערכת נושא {theme}, נבחרה',
  'sharing.dayOneComplete': 'היום הראשון הושלם!',
  'sharing.aBeautifulBeginningKeepNoticingTheGood':
    'התחלה יפה. המשיכו להבחין בדברים הטובים.',
  'sharing.countDaysOfGratitude': '{count} ימים של הכרת תודה!',
  'sharing.congratulationsOnMakingGratitudePartOfYourJourney':
    'כל הכבוד על הפיכת הכרת התודה לחלק מהדרך שלכם.',
  'sharing.shareAchievement': 'שיתוף הישג',
  'sharing.openCountDayAchievement': 'פתיחת הישג של {count} ימים',

  // Date Format Patterns (placeholders: {weekday}, {month}, {day}, {year})
  'dateFormat.timeLabel': '{weekday} בשעה {time}',

  // Cloud Backup & Sync
  'cloud.attentionNeeded': 'נדרשת תשומת לב',
  'cloud.backUpAndSyncYourJournalWithYourOwnGoogle':
    'גיבוי וסנכרון היומן עם Google Drive שלך. לא נוצר חשבון Tackbok.',
  'cloud.backupFromDate': 'גיבוי מתאריך {date}',
  'cloud.beforeYouConnect': 'לפני ההתחברות',
  'cloud.checkingGoogleDriveForChanges': 'בודק שינויים ב-Google Drive',
  'cloud.chooseABackupToMergeWithThisJournalBothSides':
    'יש לבחור גיבוי למיזוג עם היומן הזה. שני הצדדים יישמרו.',
  'cloud.chooseABackupToRestoreOnThisDevice': 'יש לבחור גיבוי לשחזור במכשיר הזה.',
  'cloud.chooseWhichCopiesOfYourJournalToRemove': 'יש לבחור אילו עותקים של היומן להסיר.',
  'cloud.cloudBackupSync': 'גיבוי וסנכרון בענן',
  'cloud.cloudBackupConnected': 'הגיבוי בענן חובר',
  'cloud.cloudBackupCouldNotBeUpdated': 'לא ניתן לעדכן את הגיבוי בענן',
  'cloud.cloudBackupDeleted': 'הגיבוי בענן נמחק',
  'cloud.cloudBackupDeletionReceived': 'התקבלה מחיקת גיבוי בענן',
  'cloud.cloudBackupNumber': 'גיבוי בענן {number}',
  'cloud.backupsAreEncryptedInTransitAndAtRestByGoogle':
    'Google Drive מצפין גיבויים בעת ההעברה ובמנוחה, אך הם אינם מוצפנים מקצה לקצה.',
  'cloud.cloudRestoreStarted': 'השחזור מהענן התחיל',
  'cloud.cloudSyncAttentionNeeded': 'סנכרון בענן: נדרשת תשומת לב',
  'cloud.cloudSyncChangesSafelyQueued': 'סנכרון בענן: השינויים ממתינים בבטחה',
  'cloud.cloudSyncPaused': 'סנכרון בענן: מושהה',
  'cloud.cloudSyncSyncing': 'סנכרון בענן: מסנכרן',
  'cloud.cloudSyncUpToDate': 'סנכרון בענן: מעודכן',
  'cloud.connectGoogleDrive': 'חיבור Google Drive',
  'cloud.connecting': 'מתחבר…',
  'cloud.createCloudBackup': 'יצירת גיבוי בענן',
  'cloud.deleteCloudAndLocalJournalData': 'מחיקת נתוני היומן בענן ובמכשיר',
  'cloud.deleteCloudBackup': 'מחיקת הגיבוי בענן',
  'cloud.deleteCloudBackup2': 'למחוק את הגיבוי בענן?',
  'cloud.deleteJournalEverywhere': 'מחיקת היומן בכל מקום',
  'cloud.deleteJournalEverywhere2': 'למחוק את היומן בכל מקום?',
  'cloud.deleteOrResetData': 'מחיקה או איפוס של נתונים',
  'cloud.deletingJournalEverywhere': 'מחיקת היומן מכל מקום…',
  'cloud.removingTheCloudBackupAndJournalDataKeepTackbokOpen':
    'הגיבוי בענן ונתוני היומן נמחקים. יש להשאיר את Tackbok פתוח.',
  'cloud.disconnect': 'ניתוק',
  'cloud.disconnectProvider': 'ניתוק {provider}',
  'cloud.disconnectProviderFromThisDevice': 'לנתק את {provider} מהמכשיר הזה?',
  'cloud.disconnectThenDeleteLocalJournalDataOnly':
    'ניתוק ולאחריו מחיקת נתוני היומן המקומיים בלבד',
  'cloud.editsRemainSafelyQueuedOnThisDevice': 'העריכות יישארו בתור בטוח במכשיר הזה.',
  'cloud.entry': 'רשומה',
  'cloud.googleDrive': 'Google Drive',
  'cloud.googleDriveAccessIsRequiredTryAgainAndSelectThe':
    'נדרשת גישה ל-Google Drive. יש לנסות שוב ולבחור בתיבת הסימון לגישה ל-Drive.',
  'cloud.googleDriveConnected': 'Google Drive מחובר',
  'cloud.googleDriveConnectionWasNotCompleted': 'החיבור ל-Google Drive לא הושלם',
  'cloud.googleDriveCouldNotBeReachedYourChangesRemainSafely':
    'לא ניתן להגיע אל Google Drive. השינויים שלך יישארו בתור בבטחה.',
  'cloud.photosAndVoiceMemosAreWaitingForWiFiYour':
    'תמונות והקלטות קוליות ממתינים ל-Wi-Fi. השינויים שלך יישארו בתור בבטחה.',
  'cloud.googleDriveDisconnectedOnThisDevice': 'Google Drive נותק במכשיר הזה',
  'cloud.googleDriveIsBusyTryAgainShortly':
    'Google Drive עמוס. יש לנסות שוב בעוד זמן קצר.',
  'cloud.googleDriveNeedsToBeReconnected': 'יש לחבר מחדש את Google Drive.',
  'cloud.googleDriveReconnected': 'Google Drive חובר מחדש',
  'cloud.googleDriveStorageIsFull': 'שטח האחסון ב-Google Drive מלא.',
  'cloud.googleDriveStatus': 'Google Drive — {status}',
  'cloud.ifGoogleShowsADriveAccessCheckboxSelectItBackup':
    'אם Google מציגה תיבת סימון לגישה ל-Drive, יש לבחור בה. לא ניתן לחבר את הגיבוי ללא הרשאה זו.',
  'cloud.journalDeletionReceived': 'התקבלה מחיקת יומן',
  'cloud.journalTextStillSyncsOnMobileData':
    'טקסט היומן עדיין מסתנכרן דרך נתונים סלולריים.',
  'cloud.keepLocalDataAndTheCloudCopy': 'שמירת הנתונים המקומיים והעותק בענן',
  'cloud.keepLocalJournalData': 'שמירת נתוני היומן המקומיים',
  'cloud.keepTheCloudCopyAndOtherDevices': 'שמירת העותק בענן והמכשירים האחרים',
  'cloud.lastSuccessfulSyncDate': 'סנכרון מוצלח אחרון: {date}',
  'cloud.localDataAndTheCloudBackupWillBothRemainOther':
    'הנתונים המקומיים והגיבוי בענן יישארו. מכשירים אחרים יישארו מחוברים.',
  'cloud.markAsReviewed': 'סימון כנבדק',
  'cloud.mergingChangesAndUpdatingGoogleDrive': 'ממזג שינויים ומעדכן את Google Drive',
  'cloud.noTackbokBackupFoundInThisGoogleAccount':
    'לא נמצא גיבוי Tackbok בחשבון Google הזה',
  'cloud.noInternetConnectionYourChangesRemainSafelyQueued':
    'אין חיבור לאינטרנט. השינויים שלך יישארו בתור בבטחה.',
  'cloud.noExistingTackbokBackupWasFoundCreateOneForThis':
    'לא נמצא גיבוי Tackbok קיים. יש ליצור גיבוי ליומן הזה.',
  'cloud.optionalCloudBackup': 'גיבוי ענן אופציונלי',
  'cloud.pauseSync': 'השהיית הסנכרון',
  'cloud.preparingJournalChanges': 'מכין את השינויים ביומן',
  'cloud.preparingRestoredJournalData': 'מכין את נתוני היומן ששוחזרו',
  'cloud.profile': 'פרופיל',
  'cloud.prompt': 'הנחיה',
  'cloud.reconnectGoogleDrive': 'חיבור מחדש של Google Drive',
  'cloud.recoveredConflicts': 'התנגשויות ששוחזרו',
  'cloud.recoveredConflictsMarkedAsReviewed': 'ההתנגשויות ששוחזרו סומנו כנבדקות',
  'cloud.recoveredTypeConflictCountPreservedAlternatives':
    'שוחזרה התנגשות מסוג {type} — נשמרו {count} חלופות',
  'cloud.resetThisDeviceOnly': 'איפוס המכשיר הזה בלבד',
  'cloud.resetThisDeviceOnly2': 'לאפס את המכשיר הזה בלבד?',
  'cloud.merge': 'מיזוג',
  'cloud.restoreCloudBackup': 'שחזור גיבוי בענן',
  'cloud.restoreFromYourCloudBackup': 'שחזור מהגיבוי שלך בענן',
  'cloud.restoring': 'משחזר…',
  'cloud.safelyQueued': 'ממתין בבטחה',
  'cloud.savingSyncedJournalDataOnThisDevice': 'שומר את נתוני היומן המסונכרנים במכשיר זה',
  'cloud.setupElapsedSeconds': 'זמן שחלף: {seconds} שנ׳',
  'cloud.setupProgressHelp':
    'Tackbok מחבר את המכשיר הזה ומתחיל את הסנכרון הראשון. גיבויים גדולים, תמונות והקלטות קוליות עשויים להימשך זמן רב יותר.',
  'cloud.setupTakingLonger':
    'הפעולה נמשכת יותר מהרגיל. יש לבדוק את החיבור לאינטרנט ולהשאיר את Tackbok פתוח כדי לאפשר לה להמשיך.',
  'cloud.settingUpCloudSync': 'מגדיר סנכרון בענן…',
  'cloud.stepCurrentOfTotalInThisBatch': 'שלב {current} מתוך {total} באצווה זו',
  'cloud.syncCompleted': 'הסנכרון הושלם',
  'cloud.syncNow': 'סנכרון עכשיו',
  'cloud.syncPaused': 'הסנכרון הושהה',
  'cloud.syncResumed': 'הסנכרון חודש',
  'cloud.syncRunsInSafeBatchesYouCanKeepUsingTackbok':
    'הסנכרון פועל באצוות בטוחות. אפשר להמשיך להשתמש ב-Tackbok.',
  'cloud.syncMediaOnWiFiOnly': 'סנכרון מדיה ב-Wi-Fi בלבד',
  'cloud.syncing': 'מסנכרן…',
  'cloud.theCloudCopyAndThisDevicesJournalWillBePermanently':
    'העותק בענן והיומן במכשיר הזה יימחקו לצמיתות. מכשירים אחרים ימחקו את היומן המקומי שלהם בסנכרון.',
  'cloud.theCloudCopyWillBePermanentlyDeletedAfterVerificationLocal':
    'העותק בענן יימחק לצמיתות לאחר אימות. נתוני היומן המקומיים יישארו.',
  'cloud.thisCloudBackupWasDeletedLocalJournalDataRemainsOn':
    'הגיבוי הזה בענן נמחק. נתוני היומן המקומיים נשארים במכשיר הזה.',
  'cloud.thisCloudBackupContainsDataTackbokCannotRead':
    'גיבוי הענן הזה מכיל נתונים ש-Tackbok לא יכול לקרוא.',
  'cloud.finishDeletingThisJournal': 'להשלים את מחיקת היומן הזה?',
  'cloud.cloudDeletionIsAlreadyRecordedEraseTheRemainingJournalData':
    'המחיקה מהענן כבר נרשמה. יש למחוק את נתוני היומן שנותרו במכשיר הזה.',
  'cloud.finishDeletion': 'השלמת המחיקה',
  'cloud.yourGoogleEmailIsStoredSecurelyOnThisDeviceTo':
    'כתובת האימייל שלך ב-Google נשמרת באופן מאובטח במכשיר הזה כדי לזהות את החשבון המחובר, ונמחקת בעת הניתוק. היא לעולם אינה נכללת בגיבויים, ביומנים, בנתוני אבחון או בניתוח שימוש.',
  'cloud.thisDeviceDisconnectsFirstThenDeletesItsLocalJournalThe':
    'המכשיר הזה יתנתק תחילה ואז ימחק את היומן המקומי. הגיבוי בענן והמכשירים האחרים יישארו.',
  'cloud.thisDeviceWasReset': 'המכשיר הזה אופס',
  'cloud.thisJournalWasDeletedEverywhereThisDeviceIsDisconnected':
    'היומן הזה נמחק בכל מקום. המכשיר הזה מנותק.',
  'cloud.upToDate': 'מעודכן',
  'cloud.verifyBackupHealth': 'אימות תקינות הגיבוי',
  'cloud.waitingForTheFirstSuccessfulSync': 'ממתין לסנכרון המוצלח הראשון',
  'cloud.youCanLeaveThisScreenSyncingResumesWhenTackbokIs':
    'אפשר לצאת מהמסך; הסנכרון יתחדש כאשר Tackbok פעיל.',
  'cloud.yourJournalStaysOnYourDeviceCloudBackupIsOptional':
    'היומן שלך נשאר במכשיר — עם גיבוי ענן אופציונלי.',
  'cloud.countChangesSafelyQueued': '{count} שינויים ממתינים בבטחה',
  'cloud.countChangesRemaining': 'נותרו {count} שינויים',
  'cloud.googleDriveAuthorizationNeedsAttention': 'ההרשאה ל-Google Drive דורשת טיפול.',
  'cloud.thisBackupBelongsToADifferentConnectedGoogleAccount':
    'הגיבוי הזה שייך לחשבון Google מחובר אחר.',
  'cloud.googleDrivePermissionWasNotFullyGranted':
    'ההרשאה ל-Google Drive לא ניתנה במלואה.',
  'cloud.theConnectedCloudBackupDoesNotMatchThisJournal':
    'גיבוי הענן המחובר אינו תואם ליומן הזה.',
  'cloud.thisBackupWasCreatedByANewerTackbokVersion':
    'הגיבוי הזה נוצר בגרסה חדשה יותר של Tackbok.',
  'cloud.aCloudSnapshotFailedItsSafetyChecks':
    'גיבוי שנשמר בענן לא עבר את בדיקות הבטיחות.',
  'cloud.aDeviceBackupPointsToAMissingSnapshot':
    'גיבוי של מכשיר מפנה לגיבוי שמור שאינו נמצא.',
  'cloud.twoDifferentBackupsClaimTheSameDeviceVersion':
    'שני גיבויים שונים טוענים לאותה גרסת מכשיר.',
  'cloud.tooManyIndependentDeviceBackupsNeedConsolidation':
    'יש יותר מדי גיבויים נפרדים של מכשירים, ונדרש לאחד אותם.',
  'cloud.aRecoveredItemConflictsWithAnExistingStableIdentifier':
    'לפריט ששוחזר יש אותו מזהה פנימי כמו לפריט קיים.',
  'cloud.tackbokCouldNotSafelyStageBackupDataOnThisDevice':
    'טאקבוק לא הצליח להכין בבטחה את נתוני הגיבוי במכשיר הזה.',
  'cloud.googleDriveDoesNotHaveEnoughFreeStorage': 'אין מספיק מקום פנוי ב-Google Drive.',
  'cloud.googleDriveDeniedAccessToTheAppBackupFolder':
    'Google Drive דחה גישה לתיקיית הגיבוי של האפליקציה.',
  'cloud.aReferencedPhotoOrVoiceMemoIsUnavailable':
    'תמונה או הקלטה קולית שנדרשת לגיבוי אינה זמינה.',
  'cloud.aLocalPhotoOrVoiceMemoCouldNotBeVerified':
    'לא ניתן היה לאמת תמונה או הקלטה קולית במכשיר הזה.',
  'cloud.yourJournalIsNotReadyForCloudSyncYet': 'היומן שלך עדיין לא מוכן לסנכרון בענן.',
  'cloud.thisCloudBackupWasDeletedFromAnotherDevice': 'גיבוי הענן הזה נמחק ממכשיר אחר.',
  'cloud.thisJournalWasDeletedEverywhereFromAnotherDevice':
    'היומן הזה נמחק בכל מקום ממכשיר אחר.',
  'cloud.cloudDeletionStoppedBeforeEveryBackupObjectWasRemoved':
    'המחיקה מהענן נעצרה לפני שכל נתוני הגיבוי הוסרו.',
  'cloud.backupCleanupWasStoppedToProtectACurrentSnapshot':
    'ניקוי הגיבויים נעצר כדי להגן על גיבוי שעדיין נמצא בשימוש.',
  'cloud.chooseTheConnectedAccount': 'בחירת החשבון המחובר',
  'cloud.chooseAGoogleAccountToReconnect': 'בחירת חשבון Google לחיבור מחדש',
  'cloud.finishConnection': 'השלמת החיבור',
  'cloud.reconnectToTheCorrectBackup': 'חיבור מחדש לגיבוי הנכון',
  'cloud.updateTackbok': 'עדכון Tackbok',
  'cloud.retryAndVerifyBackup': 'ניסיון חוזר ואימות הגיבוי',
  'cloud.repairFromVerifiedBackup': 'תיקון מגיבוי מאומת',
  'cloud.inspectAndRepairBackup': 'בדיקה ותיקון של הגיבוי',
  'cloud.consolidateBackups': 'איחוד גיבויים',
  'cloud.exportJournalAndRepairBackup': 'ייצוא היומן ותיקון הגיבוי',
  'cloud.freeDeviceStorageAndRetry': 'פינוי מקום במכשיר וניסיון חוזר',
  'cloud.manageGoogleDriveStorage': 'ניהול האחסון ב-Google Drive',
  'cloud.retryMissingMedia': 'ניסיון חוזר למדיה חסרה',
  'cloud.locateOrRetryAttachment': 'איתור הקובץ המצורף או ניסיון חוזר',
  'cloud.retryJournalPreparation': 'ניסיון חוזר בהכנת היומן',
  'cloud.acknowledgeAndDisconnect': 'אישור וניתוק',
  'cloud.reviewDeletionAndEraseThisDevice': 'בדיקת המחיקה ומחיקת המכשיר הזה',
  'cloud.resumeDeletion': 'המשך המחיקה',
  'cloud.cloudDeletionCompleted': 'המחיקה מהענן הושלמה',
  'cloud.exportOrRepairTheAffectedJournalDataThenReturnAnd':
    'יש לייצא או לתקן את נתוני היומן שנפגעו, ואז לחזור ולנסות שוב.',
  'cloud.cloudBackupRetryCompleted': 'הניסיון החוזר של גיבוי הענן הושלם',
  'cloud.cloudSyncCouldNotFinishYourChangesRemainSafelyQueued':
    'סנכרון הענן לא הושלם. השינויים שלך נשארים שמורים בבטחה בתור.',
  'cloud.googleDriveRejectedABackupRequestUpdateTackbokAndRetry':
    'Google Drive דחה בקשת גיבוי. יש לעדכן את Tackbok ולנסות שוב.',
  'time.hours': 'שעות',
  'time.minutes': 'דקות',
  'common.databaseUpdateFailed': 'לא ניתן לעדכן את מסד הנתונים של היומן: {message}',
};
