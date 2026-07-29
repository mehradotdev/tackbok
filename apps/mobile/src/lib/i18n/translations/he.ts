import type { Translations } from '../types';

/**
 * Hebrew (he) translations
 * Contains translations for all UI strings used in the application
 */
export const he: Translations = {
  // Common
  Tackbok: 'טאקבוק',
  Cancel: 'ביטול',
  Done: 'בוצע',
  Save: 'שמור',
  Edit: 'ערוך',
  Add: 'הוסף',
  Back: 'חזור',
  Create: 'צור',
  Discard: 'בטל שינויים',
  Delete: 'מחק',
  Remove: 'הסר',
  Close: 'סגור',
  Play: 'נגן',
  Pause: 'השהה',
  Settings: 'הגדרות',
  'Share Feedback': 'שתף משוב',
  'Contact Us': 'צור קשר',
  'Unknown error': 'שגיאה לא ידועה',

  // Header & Search
  'Search gratitude logs...': 'חפש יומני הכרת טובה...',
  'Start typing to search your gratitude logs':
    'התחל להקליד כדי לחפש ביומני הכרת הטובה שלך',
  'Search failed': 'החיפוש נכשל',
  'No results': 'אין תוצאות',

  // Gratitude
  'What are you grateful for today?': 'על מה אתה אסיר תודה היום?',
  'What were you grateful for yesterday?': 'על מה היית אסיר תודה אתמול?',
  'What are you grateful for?': 'על מה אתה אסיר תודה?',
  'What were you grateful for?': 'על מה היית אסיר תודה?',
  'Failed to load entries': 'טעינת הרשומות נכשלה',
  'Write now': 'כתוב עכשיו',
  'Pick a date': 'בחר תאריך',
  'Collapse gratitude actions': 'כווץ פעולות הודיה',
  'Expand gratitude actions': 'הרחב פעולות הודיה',

  // Date Entries
  'Loading...': 'טוען...',
  'No entries for this date': 'אין רשומות לתאריך זה',
  'Create Entry': 'צור רשומה',
  'Something went wrong. Creating new entry.': 'משהו השתבש. יוצר רשומה חדשה.',

  // Gratitude Entry
  'Delete Entry?': 'מחק רשומה?',
  'This entry will be permanently deleted.': 'רשומה זו תימחק לצמיתות.',
  'Entry not found': 'הרשומה לא נמצאה',
  'Leave without saving?': 'לצאת ללא שמירה?',
  'Your entry is unsaved. Would you like to keep editing or discard them?':
    'הרשומה לא נשמרה. האם ברצונך להמשיך לערוך או למחוק?',
  'Keep Editing': 'המשך לערוך',

  'Pick any date': 'בחר תאריך כלשהו',
  Mood: 'מצב רוח',
  Photo: 'תמונה',
  'Add Photo': 'הוסף תמונה',
  'Take Photo': 'צלם תמונה',
  'Choose from Library': 'בחר מהספרייה',
  'Maximum {count} photos per entry': 'מקסימום {count} תמונות לרשומה',
  'Maximum {count} voice memos per entry': 'מקסימום {count} הקלטות קוליות לרשומה',
  'Camera Access Required': 'נדרשת גישה למצלמה',
  'Photo Library Access Required': 'נדרשת גישה לספריית התמונות',
  'Please enable camera access in your device settings to take photos.':
    'אנא אפשר גישה למצלמה בהגדרות המכשיר שלך כדי לצלם תמונות.',
  'Please enable photo library access in your device settings to select photos.':
    'אנא אפשר גישה לספריית התמונות בהגדרות המכשיר שלך כדי לבחור תמונות.',
  'Open Settings': 'פתח הגדרות',
  Voice: 'קול',
  'Microphone Access Required': 'נדרשת גישה למיקרופון',
  'Please enable microphone access in your device settings to record voice memos.':
    'אנא אפשר גישה למיקרופון בהגדרות המכשיר שלך כדי להקליט הקלטות קוליות.',
  'Record Voice Note': 'הקלט הקלטה קולית',
  'Tap the button below when ready.': 'הקש על הכפתור למטה כשאתה מוכן.',
  'Start Recording': 'התחל הקלטה',
  'Recording Voice Note...': 'מקליט הקלטה קולית...',
  'Stop Recording': 'הפסק הקלטה',
  'Voice Note Recorded': 'הקלטה קולית הוקלטה',
  'Tap on the play button to listen.': 'הקש על כפתור ההשמעה כדי להאזין.',
  'Save Recording': 'שמור הקלטה',
  'Discard Recording': 'בטל הקלטה',
  'Voice notes save automatically at 30:00.': 'הקלטות קוליות נשמרות אוטומטית ב-30:00.',
  'Title (optional)': 'כותרת (אופציונלי)',
  'Use Prompt': 'השתמש בהנחיה',
  'New Prompt': 'הנחיה חדשה',
  'Add Prompt': 'הוסף הנחיה',
  'Show All': 'הצג הכל',
  'Prompt text': 'טקסט ההנחיה',
  'Prompt already exists': 'ההנחיה כבר קיימת',
  'Prompt created': 'ההנחיה נוצרה',
  'Failed to create prompt': 'יצירת ההנחיה נכשלה',
  'Prompt updated': 'ההנחיה עודכנה',
  'Failed to update prompt': 'עדכון ההנחיה נכשל',
  'Prompt deleted': 'ההנחיה נמחקה',
  'Failed to delete prompt': 'מחיקת ההנחיה נכשלה',
  Faith: 'אמונה',
  Self: 'עצמי',
  Health: 'בריאות',
  Friends: 'חברים',
  Family: 'משפחה',
  'Little things': 'דברים קטנים',
  'Create Prompt': 'צור הנחיה',
  'Create a Prompt': 'צור הנחיה',
  'Edit Prompt': 'ערוך הנחיה',
  'Delete Prompt': 'מחק הנחיה',
  'Delete Prompt?': 'למחוק את ההנחיה?',
  'Are you sure you want to delete this prompt?':
    'האם אתה בטוח שברצונך למחוק את ההנחיה הזו?',
  'No prompts yet': 'אין הנחיות עדיין',
  'Create your first prompt': 'צור את ההנחיה הראשונה שלך',

  // Prompts - Faith
  prompt_faith_1: 'מה הזיכרון המוקדם ביותר שלך של תחושת נוכחותו של אלוהים?',
  prompt_faith_2: 'איפה ראית חסד בחייך לאחרונה?',
  prompt_faith_3: 'איזו תפילה נשאה אותך דרך תקופה קשה?',
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
  prompt_self_9: 'תאר את היום המושלם והאידיאלי שלך מהבוקר ועד הלילה.',

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
  prompt_littleThings_4: 'תאר פרט קטן ויומיומי בסביבתך שהוא יפה.',
  prompt_littleThings_5: 'מהו הצליל האהוב עליך לשמוע כשאתה מתעורר בבוקר?',
  prompt_littleThings_6: 'כתוב על הנאה פשוטה שאתה מצפה לה כל יום.',
  prompt_littleThings_7: 'מה היה החלק הטוב ביותר בשגרת הבוקר שלך היום?',
  prompt_littleThings_8: 'שתף מפגש קצר עם זר שחימם את ליבך.',
  prompt_littleThings_9: 'מהו פריט זול שמביא ערך רב לחייך?',

  // Default Worksheet Template Keys
  'What I am grateful for today...': 'על מה אני אסיר תודה היום...',
  'My affirmation for today...': 'האמירה המחזקת שלי להיום...',
  'One little thing that made me smile recently...':
    'דבר קטן אחד שגרם לי לחייך לאחרונה...',

  // Moods
  Amazing: 'מדהים',
  Happy: 'שמח',
  Okay: 'בסדר',
  Sad: 'עצוב',
  Awful: 'נורא',
  'How are you feeling?': 'איך אתה מרגיש?',
  'Feeling Amazing': 'מרגיש נהדר',
  'Feeling Happy': 'מרגיש שמח',
  'Feeling Okay': 'מרגיש בסדר',
  'Feeling Sad': 'מרגיש עצוב',
  'Feeling Awful': 'מרגיש נורא',
  'Entry saved successfully': 'הרשומה נשמרה בהצלחה',
  'Failed to save entry': 'שמירת הרשומה נכשלה',
  'Failed to save voice memo': 'שמירת התזכורת הקולית נכשלה',
  'Failed to add photos': 'הוספת התמונות נכשלה',
  'Failed to delete entry': 'מחיקת הרשומה נכשלה',
  'Tag already exists': 'התגית כבר קיימת',
  'Tag created': 'התגית נוצרה',
  'Failed to create tag': 'יצירת התגית נכשלה',
  'Tag updated': 'התגית עודכנה',
  'Failed to update tag': 'עדכון התגית נכשל',
  'Tag deleted': 'התגית נמחקה',
  'Failed to delete tag': 'מחיקת התגית נכשלה',

  // Tags
  Tag: 'תגית',
  Tags: 'תגיות',
  'Tag name': 'שם תגית',
  'Add a Tag': 'הוסף תגית',
  'Create New Tag': 'צור תגית חדשה',
  'Edit Tag': 'ערוך תגית',
  'Delete Tag': 'מחק תגית',
  'Are you sure you want to delete the tag "{title}"?':
    'האם אתה בטוח שברצונך למחוק את התגית "{title}"?',

  // Milestones
  'days of gratitude': 'ימים של הכרת טובה',

  // Settings - Profile
  'Your Name': 'השם שלך',
  'Change Photo': 'שנה תמונה',
  'Profile Photo': 'תמונת פרופיל',
  'Would you like to update or remove your profile photo?':
    'האם ברצונך לעדכן או להסיר את תמונת הפרופיל שלך?',
  'Update Photo': 'עדכן תמונה',
  'Remove Photo': 'הסר תמונה',

  // Settings
  Language: 'שפה',
  'Select Language': 'בחר שפה',
  'Device Default': 'ברירת מחדל של המכשיר',
  'Restart Required': 'נדרש אתחול מחדש',
  'Language change requires app restart. Proceed?':
    'שינוי השפה דורש אתחול מחדש של האפליקציה. להמשיך?',
  Proceed: 'המשך',
  'Reload App': 'טען מחדש את האפליקציה',

  // Settings - Notifications
  Notifications: 'התראות',
  'Daily Reminder': 'תזכורת יומית',
  'Daily reminder notifications are on': 'התראות תזכורת יומיות מופעלות',
  'Daily reminder notifications are off': 'התראות תזכורת יומיות כבויות',
  'Adjust Reminder Time': 'התאמת זמן התזכורת',
  'Change your daily reminder time': 'שנה את זמן התזכורת היומית שלך',
  'Failed to update reminder': 'עדכון התזכורת נכשל',
  'Notification permission needed': 'נדרשת הרשאת התראות',
  'To get daily reminders, allow notifications for Tackbok in your device settings.':
    'כדי לקבל תזכורות יומיות, אפשר התראות עבור Tackbok בהגדרות המכשיר.',

  // Settings - Appearance
  Appearance: 'מראה',
  Theme: 'ערכת נושא',
  'Select a theme': 'בחר ערכת נושא',
  'Choose from over 10 different themes and color schemes':
    'בחר מתוך יותר מ-10 ערכות נושא וסכמות צבע שונות',
  'Timeline Entry Length': 'אורך רשומה בציר הזמן',
  'Number of lines shown in the timeline':
    'מספר השורות המוצגות בציר הזמן. הטקסט המלא נראה בלחיצה על הרשומה',
  'Show Timeline Borders': 'הצג גבולות ציר זמן',
  'Show the borders in the timeline': 'הצג את הגבולות בציר הזמן',
  'Hide the borders in the timeline': 'הסתר את הגבולות בציר הזמן',
  'Date Style': 'סגנון תאריך',
  'Date includes day of the week': 'התאריך כולל את יום השבוע',
  'First Day of Week': 'היום הראשון בשבוע',
  'Set the first day of the week in the calendar view':
    'הגדר את היום הראשון בשבוע בתצוגת היומן',

  // Settings - Typography
  Typography: 'טיפוגרפיה',
  'Title Font': 'גופן כותרת',
  'Choose a font for titles and headings': 'בחר גופן עבור כותרות וכותרות משנה',
  Default: 'ברירת מחדל',
  'Theme Default': 'ברירת מחדל של ערכת הנושא',
  'Font Size': 'גודל גופן',
  'Adjust the size of body text': 'התאם את גודל טקסט הגוף',
  Small: 'קטן',
  Large: 'גדול',
  'Preview of the selected font': 'תצוגה מקדימה של הגופן הנבחר',
  'Gratitude makes today brighter': 'הכרת תודה הופכת את היום לבהיר יותר',

  // Settings - Journaling
  Journaling: 'כתיבה יומית',
  'Worksheet Template': 'תבנית דף כתיבה',
  'Edit Worksheet Template': 'ערוך את תבנית דף הכתיבה',
  'Use this template to pre-fill the body of new gratitude entries':
    'השתמש בתבנית הזו כדי למלא מראש את גוף רשומות התודה החדשות',
  'Reset to Default': 'אפס לברירת המחדל',
  'Journaling Worksheet': 'דף כתיבה יומי',
  'Start Writing': 'התחל לכתוב',
  'Journal Focus Areas': 'תחומי התמקדות ביומן',
  'Personalize your journal prompts.': 'התאם אישית את ההנחיות ביומן שלך.',
  'Pick the topics you want to write about.': 'בחר את הנושאים שברצונך לכתוב עליהם.',
  'Select at least 2 focus areas': 'בחר לפחות 2 תחומי התמקדות',
  'Journal Prompts': 'הנחיות יומן',
  'Choose which prompts to show when starting a new journal entry.':
    'בחר אילו הנחיות להציג בעת התחלת רשומה חדשה.',
  Off: 'כבוי',
  'All Prompts': 'כל ההנחיות',
  'My Prompts': 'ההנחיות שלי',
  'Built In Prompts': 'הנחיות מובנות',
  focusArea_self_desc: 'הרהר בתחביבים, תחומי עניין, חוויות וחיים בכלל.',
  focusArea_littleThings_desc:
    'הוקר את הדברים הקטנים והברכות היומיומיות שלעתים נעלמות מעינינו.',
  focusArea_health_desc: 'הוקר את הברכות הרבות של גופך ויכולותיו.',
  focusArea_family_desc: 'הוקר את בני משפחתך ואת הרגעים שחלקת עמם.',
  focusArea_friends_desc: 'הוקר את חבריך האוהבים, התומכים והמבינים.',
  focusArea_faith_desc: 'התמקד בהערכת האמונה, הרוחניות והשלווה הפנימית שלך.',

  // Settings - Security
  Security: 'אבטחה',
  'Unlock Tackbok': 'פתיחת טאקבוק',
  'Lock with your device screen lock':
    'טאקבוק יכול להינעל באמצעות נעילת המסך של המכשיר — ביומטריה, קוד PIN, קו ביטול נעילה או סיסמה',
  Unlock: 'ביטול נעילה',
  'App lock unavailable': 'נעילת האפליקציה אינה זמינה',
  'Set up a screen lock (PIN, pattern, or biometrics) in your device settings first.':
    'תחילה יש להגדיר נעילת מסך (קוד PIN, קו ביטול נעילה או ביומטריה) בהגדרות המכשיר.',

  // Settings - Backup & Restore
  'Backup & Restore': 'גיבוי ושחזור',
  'Google Drive Backup': 'גיבוי ל-Google Drive',
  'Automatically back up your entries with Google Drive':
    'התחבר עם חשבון Google Drive שלך כדי לגבות אוטומטית את הרשומות שלך',
  'Backup Frequency': 'תדירות גיבוי',
  Daily: 'יומי',
  Weekly: 'שבועי',
  'On Every Change': 'בכל שינוי',
  'Export as .ZIP': 'ייצוא כקובץ .ZIP',
  'All of your data in a format that you can restore in the app later':
    'כל הנתונים שלך בפורמט שניתן לשחזר באפליקציה מאוחר יותר',
  'Import as .ZIP': 'ייבוא כקובץ .ZIP',
  'Restore your data from a .zip file': 'שחזר את הנתונים שלך מקובץ .zip',
  'Import from Gratitude App': 'ייבוא מאפליקציית Gratitude',
  'Importing from Gratitude App': 'מייבא מאפליקציית Gratitude',
  'Import data from a Gratitude App .zip backup':
    'ייבוא נתונים מקובץ .zip של אפליקציית Gratitude',
  'Choose Import Mode': 'בחר מצב ייבוא',
  'How should this import handle entries that already exist in Tackbok?':
    'כיצד ייבוא זה צריך לטפל ברשומות שכבר קיימות בטאקבוק?',
  'Skip Existing Entries': 'דלג על רשומות קיימות',
  'Skip Existing Entries (Recommended)': 'דלג על רשומות קיימות (מומלץ)',
  'Only import entries with new note IDs': 'ייבא רק רשומות עם מזהי הערות חדשים',
  'Overwrite Matching Entries': 'החלף רשומות תואמות',
  'Replace existing entries when note IDs match':
    'החלף רשומות קיימות כאשר מזהי ההערות תואמים',
  'Import from Presently App': 'ייבוא מאפליקציית Presently',
  'Restore your data from a Presently .csv file':
    'שחזר את הנתונים שלך מקובץ .csv של Presently',
  'Import from Presently?': 'ייבוא מ-Presently?',
  'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.':
    'פעולה זו תייבא רשומות מקובץ CSV של אפליקציית Presently. רשומות כפולות לא יובאו.',
  'Backup exported successfully': 'הגיבוי יוצא בהצלחה',
  'Export failed': 'הייצוא נכשל',
  importedCount: 'יובאו {count} רשומות',
  'Import failed': 'הייבוא נכשל',
  'Restoring Tackbok backup': 'משחזר גיבוי של טאקבוק',
  'Load Presently export': 'טוען ייצוא של Presently',
  'Import journal entries': 'מייבא רשומות יומן',
  'Open backup file': 'פותח קובץ גיבוי',
  'Validate backup contents': 'מאמת תוכן גיבוי',
  'Restore profile': 'משחזר פרופיל',
  'Import tags and prompts': 'מייבא תגיות והנחיות',
  'Restore entries and media': 'משחזר רשומות ומדיה',
  'Refresh journal data': 'מרענן נתוני יומן',
  'Loading the selected import file.': 'טוען את קובץ הייבוא שנבחר.',
  'Checking backup contents and file structure.': 'בודק את תוכן הגיבוי ומבנה הקובץ.',
  'Restoring profile details and profile photo if available.':
    'משחזר פרטי פרופיל ותמונת פרופיל במידה וזמינה.',
  'Adding tags and prompts before entries are restored.':
    'מוסיף תגיות והנחיות לפני שחזור הרשומות.',
  'Processing {processed} of {total} journal entries and attached media.':
    'מעבד {processed} מתוך {total} רשומות יומן ומדיה מצורפת.',
  'No journal entries found in this backup.': 'לא נמצאו רשומות יומן בגיבוי זה.',
  'Refreshing your journal so imported data appears everywhere.':
    'מרענן את היומן שלך כך שהנתונים המיובאים יופיעו בכל מקום.',
  'Entries processed': 'רשומות שעובדו',
  'Entries skipped due to errors': 'רשומות שנדלגו עקב שגיאות',
  'Please do not close or minimize the app while the import is in progress.':
    'אנא אל תסגור או תמזער את האפליקציה בזמן שהייבוא בעיצומו.',
  'Tags added': 'תגיות שנוספו',
  'Prompts added': 'הנחיות שנוספו',
  'Photos restored': 'תמונות ששוחזרו',
  'Voice memos restored': 'תזכורות קוליות ששוחזרו',
  'Media skipped': 'מדיה שנדלגה',
  'Tackbok backup restored': 'גיבוי טאקבוק שוחזר',
  'Gratitude import complete': 'ייבוא מ-Gratitude הושלם',
  'Presently import complete': 'ייבוא מ-Presently הושלם',
  'Your journal data is ready to review, but some items could not be restored.':
    'נתוני היומן שלך מוכנים לבדיקה, אך לא ניתן היה לשחזר פריטים מסוימים.',
  'Your journal data is ready to review.': 'נתוני היומן שלך מוכנים לבדיקה.',
  'This import finished with warnings. Some items could not be restored, and everything else already existed in Tackbok.':
    'הייבוא הסתיים עם אזהרות. לא ניתן היה לשחזר פריטים מסוימים, וכל השאר כבר היה קיים בטאקבוק.',
  'This import finished, but everything already existed in Tackbok.':
    'הייבוא הסתיים, אך הכל כבר היה קיים בטאקבוק.',
  'This import finished with warnings. Some items could not be restored.':
    'הייבוא הסתיים עם אזהרות. לא ניתן היה לשחזר פריטים מסוימים.',
  'This import finished successfully.': 'הייבוא הסתיים בהצלחה.',
  'Imported from Tackbok backup': 'יובא מגיבוי של טאקבוק',
  'Imported from Gratitude backup': 'יובא מגיבוי של Gratitude',
  'Imported from Presently export': 'יובא מייצוא של Presently',
  'New entries': 'רשומות חדשות',
  'Updated entries': 'רשומות מעודכנות',
  'Skipped duplicates': 'דילג על כפילויות',
  Import: 'ייבוא',

  // Settings - App Information
  'App Information': 'מידע על האפליקציה',
  FAQ: 'שאלות נפוצות',
  'Read frequently asked questions': 'קרא את השאלות הנפוצות של טאקבוק',
  'Share Tackbok': 'שתף את טאקבוק',
  'Share the app with friends and family':
    'נהנה מטאקבוק? שתף את האפליקציה עם חברים ומשפחה',
  'Practice gratitude with Tackbok, a simple, free, and private gratitude journaling app':
    'תרגל הכרת תודה עם טאקבוק, אפליקציה פשוטה, חינמית ופרטית ליומן תודה',
  'Privacy Policy': 'מדיניות פרטיות',
  'Read our privacy policy': 'קרא את מדיניות הפרטיות של טאקבוק',
  'Terms & Conditions': 'תנאים והגבלות',
  'Read our terms and conditions': 'קרא את התנאים וההגבלות שלנו',
  Analytics: 'איסוף נתוני ניתוח',
  'Collecting anonymized analytics to help diagnose problems':
    'טאקבוק אוסף מידע אנליטי אנונימי כדי לעזור באבחון בעיות ומעקב אחר מגמות',
  'Check for updates': 'בדיקת עדכונים',
  'Checking for updates…': 'בודק עדכונים…',
  'Last checked: {time}': 'בדיקה אחרונה: {time}',
  Never: 'מעולם לא',
  'Restart to apply': 'הפעלה מחדש להחלה',
  'Update downloaded. Restart to apply it.': 'העדכון ירד. הפעל מחדש כדי להחיל אותו.',
  'You already have the latest version': 'הגרסה האחרונה כבר מותקנת',
  'Unable to update': 'לא ניתן לעדכן',
  Version: 'מספר גרסה',

  // Settings - Danger Zone
  'Danger Zone': 'אזור מסוכן',
  'Delete All Data': 'מחק את כל הנתונים',
  'Permanently delete all your app data': 'מחק את כל נתוני האפליקציה שלך לצמיתות',
  'Delete all data?': 'למחוק את כל הנתונים?',
  'This action cannot be undone. All your app data will be permanently deleted.':
    'לא ניתן לבטל פעולה זו. כל נתוני האפליקציה שלך יימחקו לצמיתות.',
  'All data deleted': 'כל הנתונים נמחקו',
  'All data deleted, but some media files could not be removed.':
    'כל הנתונים נמחקו, אך לא ניתן היה להסיר חלק מקובצי המדיה.',
  'Delete failed': 'המחיקה נכשלה',

  // Time Picker
  'Select Time': 'בחר שעה',

  // Date Picker
  Today: 'היום',
  Yesterday: 'אתמול',
  Selected: 'נבחר',
  'Previous month': 'החודש הקודם',
  'Next month': 'החודש הבא',
  'Select month': 'בחר חודש',
  'Select year': 'בחר שנה',
  Random: 'אקראי',
  'Open a random entry': 'פתח רשומה אקראית',
  Sun: 'א',
  Mon: 'ב',
  Tue: 'ג',
  Wed: 'ד',
  Thu: 'ה',
  Fri: 'ו',
  Sat: 'ש',
  Sunday: 'ראשון',
  Monday: 'שני',
  Tuesday: 'שלישי',
  Wednesday: 'רביעי',
  Thursday: 'חמישי',
  Friday: 'שישי',
  Saturday: 'שבת',
  January: 'ינואר',
  February: 'פברואר',
  March: 'מרץ',
  April: 'אפריל',
  May: 'מאי',
  June: 'יוני',
  July: 'יולי',
  August: 'אוגוסט',
  September: 'ספטמבר',
  October: 'אוקטובר',
  November: 'נובמבר',
  December: 'דצמבר',
  JAN: 'ינו׳',
  FEB: 'פבר׳',
  MAR: 'מרץ',
  APR: 'אפר׳',
  MAY: 'מאי',
  JUN: 'יוני',
  JUL: 'יולי',
  AUG: 'אוג׳',
  SEP: 'ספט׳',
  OCT: 'אוק׳',
  NOV: 'נוב׳',
  DEC: 'דצמ׳',

  // Onboarding
  Skip: 'דילוג',
  Continue: 'המשך',
  Next: 'הבא',
  'Step {current} of {total}': 'שלב {current} מתוך {total}',
  'Get started': 'בואו נתחיל',
  'Already have a journal? Import it': 'כבר יש לך יומן? אפשר לייבא אותו',
  'A private place for your gratitude — free, offline, yours.':
    'מקום פרטי להכרת התודה שלך — חינמי, לא מקוון, ושלך בלבד.',
  'Your journal stays on your device.': 'היומן שלך נשאר במכשיר שלך.',
  'Import your journal': 'ייבוא היומן שלך',
  'Where is your journal coming from?': 'מאיפה מגיע היומן שלך?',
  'Tackbok Backup': 'גיבוי Tackbok',
  'Gratitude App': 'אפליקציית Gratitude',
  'Presently App': 'אפליקציית Presently',
  'What should we call you?': 'איך לקרוא לך?',
  'Your name is only used to greet you inside the app.':
    'השם משמש רק כדי לברך אותך בתוך האפליקציה.',
  'Your name (optional)': 'השם שלך (אופציונלי)',
  'Stays on your device.': 'נשאר במכשיר שלך.',
  'Make it yours': 'התאימו אותו לעצמכם',
  'Pick a look — you can change everything later in Settings.':
    'בחרו מראה — אפשר לשנות הכול מאוחר יותר בהגדרות.',
  'A walk in the morning sun': 'טיול בשמש הבוקר',
  'Grateful for quiet streets, warm coffee, and a sky full of color.':
    'תודה על רחובות שקטים, קפה חם ושמיים מלאי צבע.',
  'More themes…': 'עוד ערכות נושא…',
  'What do you want to be more grateful for?': 'על מה תרצו להכיר תודה יותר?',
  'We’ll suggest writing prompts from the areas you pick.':
    'נציע לכם רעיונות לכתיבה מהתחומים שתבחרו.',
  'Pick at least {count}': 'בחרו לפחות {count}',
  'Help improve Tackbok?': 'לעזור לשפר את Tackbok?',
  'Tackbok is free and open source. Anonymous stats help us find bugs and see which features matter.':
    'Tackbok חינמי ובקוד פתוח. סטטיסטיקות אנונימיות עוזרות לנו למצוא באגים ולהבין אילו תכונות חשובות.',
  'Anonymous usage stats only — which screens and features get used.':
    'סטטיסטיקות שימוש אנונימיות בלבד — אילו מסכים ותכונות נמצאים בשימוש.',
  'Never your journal content, photos, voice memos, or anything you type.':
    'לעולם לא תוכן היומן, תמונות, הקלטות קול או כל דבר שאתם מקלידים.',
  'Open source — the exact event list is public in the repo.':
    'קוד פתוח — רשימת האירועים המדויקת פומבית במאגר.',
  'See exactly what we collect': 'ראו בדיוק מה אנחנו אוספים',
  'Share anonymous stats': 'שיתוף סטטיסטיקות אנונימיות',
  'No thanks': 'לא, תודה',
  'What we collect': 'מה אנחנו אוספים',
  'These are the only events Tackbok records — anonymous counters with no content attached. The exact list is public in the open-source code.':
    'אלה האירועים היחידים ש-Tackbok מתעד — מונים אנונימיים ללא תוכן מצורף. הרשימה המדויקת פומבית בקוד הפתוח.',
  'Never collected': 'לעולם לא נאסף',
  'Your journal text, titles, photos, voice memos, tags, name, email, or anything you type. No ads, no selling data, no third-party tracking.':
    'טקסט היומן, כותרות, תמונות, הקלטות קול, תגיות, שם, אימייל או כל דבר שאתם מקלידים. בלי פרסומות, בלי מכירת נתונים, בלי מעקב של צד שלישי.',
  'If you opt in, the anonymous steps you took during this setup are included. If you decline, they are discarded and never leave your device.':
    'אם תסכימו, הצעדים האנונימיים שביצעתם במהלך ההגדרה ייכללו. אם תסרבו, הם יימחקו מיד ולעולם לא יעזבו את המכשיר.',
  'You’re all set, {name}!': 'הכול מוכן, {name}!',
  'You’re all set!': 'הכול מוכן!',
  'Two last things you can turn on — both optional.':
    'שני דברים אחרונים שאפשר להפעיל — שניהם אופציונליים.',
  'Add example entries': 'הוספת רשומות לדוגמה',
  'A few sample entries show how photos, voice memos, moods and tags work. Remove them anytime with one tap.':
    'כמה רשומות לדוגמה מראות איך עובדים תמונות, הקלטות קול, מצבי רוח ותגיות. אפשר להסיר אותן בכל רגע בלחיצה אחת.',
  'Remind me daily': 'תזכורת יומית',
  'A gentle nudge to write — never your journal content.':
    'דחיפה עדינה לכתוב — לעולם לא תוכן היומן שלכם.',
  'Remind me at {time}': 'להזכיר לי ב-{time}',
  'Setting things up…': 'רק רגע, מסדרים הכול…',
  'Start journaling': 'להתחיל לכתוב',
  'Showing example entries': 'מוצגות רשומות לדוגמה',
  'Remove all': 'הסרת הכול',
  'Hide this banner': 'הסתרת ההודעה הזו',
  'Example entries removed': 'רשומות הדוגמה הוסרו',
  'Failed to remove example entries': 'הסרת רשומות הדוגמה נכשלה',
  'Add today’s entry here.': 'הוסיפו כאן את הרשומה של היום.',
  'Press and hold, then drag to move these buttons along the edge.':
    'לחצו לחיצה ארוכה וגררו כדי להזיז את הכפתורים לאורך הקצה.',
  'Tap an entry to view or edit it.': 'הקישו על רשומה כדי לצפות בה או לערוך אותה.',
  'Find memories by text or tag.': 'מצאו זיכרונות לפי טקסט או תגית.',
  'Replay Onboarding': 'הפעלת ההיכרות מחדש',
  'Run the welcome setup again': 'הפעלת הגדרת הפתיחה מחדש',
  'Replay onboarding?': 'להפעיל את ההיכרות מחדש?',
  'The welcome setup will start again. Your journal entries and settings are kept.':
    'הגדרת הפתיחה תתחיל מחדש. רשומות היומן וההגדרות שלכם נשמרות.',
  Replay: 'הפעלה מחדש',

  // Onboarding sample entries (seeded content)
  sample_tag_family: 'משפחה',
  sample_tag_littleThings: 'דברים קטנים',
  sample_entry_welcome_title: 'ברוכים הבאים ל-Tackbok 👋',
  sample_entry_welcome_body:
    'זהו יומן הכרת התודה שלכם — מקום לרגעים הטובים. הקישו על כפתור + כדי לכתוב שורה אחת או עמוד שלם, פעם ביום או מתי שתרצו. הקישו על הכרטיס הזה כדי לראות את הרשומה המלאה.',
  sample_entry_photos_title: 'רגעים קטנים',
  sample_entry_photos_body: 'אפשר לצרף תמונות לזיכרון — הקישו על תמונה כדי להגדיל.',
  sample_entry_voice_title: 'במילים שלי',
  sample_entry_voice_body:
    'לפעמים קל יותר לומר את זה בקול. הקישו על נגן כדי לשמוע הקלטה קצרה.',
  sample_entry_tags_body:
    'הרשומה הזו עונה על אחת מהצעות הכתיבה ונושאת שתי תגיות. נסו את החיפוש למעלה וסננו לפי תגית כדי למצוא אותה שוב.',

  // Date Format Patterns (placeholders: {weekday}, {month}, {day}, {year})
  'dateFormat.short': '{day} ב{month} {year}',
  'dateFormat.full': 'יום {weekday}, {day} ב{month} {year}',
  'dateFormat.timeLabel': '{weekday} בשעה {time}',
};
