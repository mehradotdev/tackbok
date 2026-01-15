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
  Delete: 'מחק',
  Settings: 'הגדרות',
  'Contact Us': 'צור קשר',
  'Unknown error': 'שגיאה לא ידועה',

  // Header & Search
  'Search gratitude logs...': 'חפש יומני הכרת טובה...',
  'Start typing to search your gratitude logs': 'התחל להקליד כדי לחפש ביומני ההוקרה שלך',
  'Search failed': 'החיפוש נכשל',
  'No results': 'אין תוצאות',

  // Gratitude
  'What are you grateful for today?': 'על מה אתה אסיר תודה היום?',
  'What were you grateful for yesterday?': 'על מה היית אסיר תודה אתמול?',
  'What are you grateful for?': 'על מה אתה אסיר תודה?',
  'Failed to load entries': 'טעינת הרשומות נכשלה',
  'I was grateful for': 'הייתי אסיר תודה על',

  // Gratitude Entry
  'Delete Entry?': 'מחק רשומה?',
  'Clearing the text will delete this entry entirely.':
    'ניקוי הטקסט ימחק את הרשומה הזו לחלוטין.',

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

  // Settings - Notifications
  Notifications: 'התראות',
  'Daily Reminder Notifications': 'התראות תזכורת יומיות',
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
  'Inspirational Quotes': 'ציטוטים מעוררי השראה',
  'Gratitude quotes will be shown on entry page': 'ציטוטי הכרת טובה יוצגו בדף הרשומה',
  'Date Style': 'סגנון תאריך',
  'Date includes day of the week': 'התאריך כולל את יום השבוע',
  'First Day of Week': 'היום הראשון בשבוע',
  'Set the first day of the week in the calendar view':
    'הגדר את היום הראשון בשבוע בתצוגת היומן',
  Saturday: 'שבת',
  Sunday: 'ראשון',
  Monday: 'שני',

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
  'Manually export your entries to CSV format':
    'ייצא ידנית את הרשומות שלך לפורמט CSV למכשיר',
  'Import from Backup': 'ייבוא מגיבוי',
  'Select a backed up CSV file to import': 'בחר קובץ CSV מגובה לייבוא',

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

  // Date Picker
  'Select Date': 'בחר תאריך',
  'Has entry': 'יש רשומה',
  Selected: 'נבחר',
  Sun: 'א',
  Mon: 'ב',
  Tue: 'ג',
  Wed: 'ד',
  Thu: 'ה',
  Fri: 'ו',
  Sat: 'ש',
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
};
