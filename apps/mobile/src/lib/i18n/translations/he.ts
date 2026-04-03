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
  Continue: 'המשך',
  Delete: 'מחק',
  Remove: 'הסר',
  Close: 'סגור',
  Play: 'נגן',
  Pause: 'השהה',
  Settings: 'הגדרות',
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
  'Failed to load entries': 'טעינת הרשומות נכשלה',
  'I was grateful for': 'הייתי אסיר תודה על',

  // Date Entries
  'Loading...': 'טוען...',
  'No entries for this date': 'אין רשומות לתאריך זה',
  'Create Entry': 'צור רשומה',
  'Something went wrong. Creating new entry.': 'משהו השתבש. יוצר רשומה חדשה.',

  // Gratitude Entry
  'Delete Entry?': 'מחק רשומה?',
  'Clearing the text will delete this entry entirely.':
    'ניקוי הטקסט ימחק את הרשומה הזו לחלוטין.',
  'This entry will be permanently deleted.': 'רשומה זו תימחק לצמיתות.',
  'Leave without saving?': 'לצאת ללא שמירה?',
  'Your entry is unsaved. Would you like to keep editing or discard them?':
    'הרשומה לא נשמרה. האם ברצונך להמשיך לערוך או למחוק?',
  'Keep Editing': 'המשך לערוך',

  'Pick any date': 'בחר תאריך כלשהו',
  'Select date': 'בחר תאריך',
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
  'Record Again': 'הקלט שוב',

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
  'Add tags...': 'הוסף תגיות...',
  'Entry saved successfully': 'הרשומה נשמרה בהצלחה',
  'Failed to save entry': 'שמירת הרשומה נכשלה',
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
  'New tag name...': 'שם תגית חדשה...',
  'No tags yet': 'אין תגיות עדיין',
  'Create your first tag': 'צור את התגית הראשונה שלך',
  'Edit Tag': 'ערוך תגית',
  'Delete Tag': 'מחק תגית',
  'Are you sure you want to delete the tag "{title}"?':
    'האם אתה בטוח שברצונך למחוק את התגית "{title}"?',

  // Milestones
  'days of gratitude': 'ימים של הכרת טובה',

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
  'Inspirational Quotes': 'ציטוטים מעוררי השראה',
  'Gratitude quotes will be shown on entry page': 'ציטוטי הכרת טובה יוצגו בדף הרשומה',
  'Date Style': 'סגנון תאריך',
  'Date includes day of the week': 'התאריך כולל את יום השבוע',
  'First Day of Week': 'היום הראשון בשבוע',
  'Set the first day of the week in the calendar view':
    'הגדר את היום הראשון בשבוע בתצוגת היומן',

  // Settings - Journaling
  Journaling: 'כתיבה יומית',
  'Worksheet Template': 'תבנית דף כתיבה',
  'Customize the default worksheet for new gratitude entries':
    'התאם את דף הכתיבה ברירת המחדל לרשומות תודה חדשות',
  'Edit Worksheet Template': 'ערוך את תבנית דף הכתיבה',
  'Use this template to pre-fill the body of new gratitude entries':
    'השתמש בתבנית הזו כדי למלא מראש את גוף רשומות התודה החדשות',
  'Reset to Default': 'אפס לברירת המחדל',
  'Journaling Worksheet': 'דף כתיבה יומי',
  'A template for your daily journaling routine.':
    'תבנית לשגרת הכתיבה וההתבוננות היומית שלך.',
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
  focusArea_littleThings_desc: 'הוקר את הדברים הקטנים והברכות היומיומיות שלעתים נעלמות מעינינו.',
  focusArea_health_desc: 'הוקר את הברכות הרבות של גופך ויכולותיו.',
  focusArea_family_desc: 'הוקר את בני משפחתך ואת הרגעים שחלקת עמם.',
  focusArea_friends_desc: 'הוקר את חבריך האוהבים, התומכים והמבינים.',
  focusArea_faith_desc: 'התמקד בהערכת האמונה, הרוחניות והשלווה הפנימית שלך.',

  // Settings - Security
  Security: 'אבטחה',
  'Unlock Tackbok': 'פתיחת טאקבוק',
  'Lock with biometric scanner if supported':
    'טאקבוק יכול לנעול באמצעות הסורק הביומטרי של המכשיר (אם נתמך)',

  // Settings - Backup & Restore
  'Backup & Restore': 'גיבוי ושחזור',
  'Google Drive Backup': 'גיבוי ל-Google Drive',
  'Automatically back up your entries with Google Drive':
    'התחבר עם חשבון Google Drive לגיבוי אוטומטי של הרשומות שלך',
  'Backup Frequency': 'תדירות גיבוי',
  Daily: 'יומי',
  Weekly: 'שבועי',
  'On Every Change': 'בכל שינוי',
  'Export to CSV': 'ייצוא ל-CSV',
  'Full backup of entries and tags': 'גיבוי מלא של רשומות ותגיות',
  'Import Entries from CSV': 'ייבוא רשומות מ-CSV',
  'Restore from a Tackbok backup file': 'שחזור מקובץ גיבוי של טאקבוק',
  'Import from Presently App': 'ייבוא מאפליקציית Presently',
  'Import entries from a Presently CSV export': 'ייבוא רשומות מייצוא CSV של Presently',
  'Import from Presently?': 'ייבוא מ-Presently?',
  'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.':
    'פעולה זו תייבא רשומות מקובץ CSV של אפליקציית Presently. רשומות כפולות ידלגו.',
  'Entries exported successfully': 'הרשומות יוצאו בהצלחה',
  'Export failed': 'הייצוא נכשל',
  importedCount: 'יובאו {count} רשומות',
  importedCountSingular: 'יובאה {count} רשומה',
  'Import failed': 'הייבוא נכשל',
  'Importing entries...': 'מייבא רשומות...',
  'Are you sure you want to import?': 'האם אתה בטוח שברצונך לייבא?',
  'This will import entries from a Tackbok backup file. Duplicate entries will be skipped.':
    'פעולה זו תייבא רשומות מקובץ גיבוי של טאקבוק. רשומות כפולות ידלגו.',
  Import: 'ייבוא',

  // Settings - App Information
  'App Information': 'מידע על האפליקציה',
  FAQ: 'שאלות נפוצות',
  'Read frequently asked questions': 'קרא את השאלות הנפוצות של טאקבוק',
  'Share Tackbok': 'שתף את טאקבוק',
  'Share the app with friends and family':
    'נהנה מטאקבוק? שתף את האפליקציה עם חברים ומשפחה',
  'Privacy Policy': 'מדיניות פרטיות',
  'Read our privacy policy': 'קרא את מדיניות הפרטיות של טאקבוק',
  'Terms & Conditions': 'תנאים והגבלות',
  'Read our terms and conditions': 'קרא את התנאים וההגבלות שלנו',
  Analytics: 'איסוף נתוני ניתוח',
  'Collecting anonymized analytics to help diagnose problems':
    'טאקבוק אוסף מידע אנליטי אנונימי כדי לעזור באבחון בעיות ומעקב אחר מגמות',
  Version: 'מספר גרסה',

  // Settings - Danger Zone
  'Danger Zone': 'אזור מסוכן',
  'Delete All Data': 'מחק את כל הנתונים',
  'Permanently delete all your entries, photos, and voice memos':
    'מחק את כל הרשומות, התמונות וההקלטות הקוליות שלך לצמיתות',
  'Delete all data?': 'למחוק את כל הנתונים?',
  'This action cannot be undone. All your entries, photos, and voice memos will be permanently deleted.':
    'לא ניתן לבטל פעולה זו. כל הרשומות, התמונות וההקלטות הקוליות שלך יימחקו לצמיתות.',
  'All data deleted': 'כל הנתונים נמחקו',
  'Delete failed': 'המחיקה נכשלה',

  // Time Picker
  'Select Time': 'בחר שעה',

  // Date Picker
  Today: 'היום',
  Yesterday: 'אתמול',
  'Select Date': 'בחר תאריך',
  'Has entry': 'יש רשומה',
  Selected: 'נבחר',
  'Previous month': 'החודש הקודם',
  'Next month': 'החודש הבא',
  'Select month': 'בחר חודש',
  'Select year': 'בחר שנה',
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

  // Date Format Patterns (placeholders: {weekday}, {month}, {day}, {year})
  'dateFormat.short': '{day} ב{month} {year}',
  'dateFormat.full': 'יום {weekday}, {day} ב{month} {year}',
  'dateFormat.timeLabel': '{weekday} בשעה {time}',
};
