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
  Create: 'צור',
  Discard: 'בטל שינויים',
  Continue: 'המשך',
  Delete: 'מחק',
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
  'Camera Access Required': 'נדרשת גישה למצלמה',
  'Photo Library Access Required': 'נדרשת גישה לספריית התמונות',
  'Please enable camera access in your device settings to take photos.':
    'אנא אפשר גישה למצלמה בהגדרות המכשיר שלך כדי לצלם תמונות.',
  'Please enable photo library access in your device settings to select photos.':
    'אנא אפשר גישה לספריית התמונות בהגדרות המכשיר שלך כדי לבחור תמונות.',
  'Open Settings': 'פתח הגדרות',
  Voice: 'קול',

  'Title (optional)': 'כותרת (אופציונלי)',
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
  'Choose from over 40 different themes and color schemes':
    'בחר מתוך יותר מ-40 ערכות נושא וסכמות צבע שונות',
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
  'Permanently delete all your entries and photos':
    'מחק את כל הרשומות והתמונות שלך לצמיתות',
  'Delete all data?': 'למחוק את כל הנתונים?',
  'This action cannot be undone. All your entries and photos will be permanently deleted.':
    'לא ניתן לבטל פעולה זו. כל הרשומות והתמונות שלך יימחקו לצמיתות.',
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
