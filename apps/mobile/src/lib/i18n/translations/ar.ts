import type { Translations } from '../types';

/**
 * Arabic (ar) translations
 * Contains translations for all UI strings used in the application
 */
export const ar: Translations = {
  // Common
  Tackbok: 'تاكبوك',
  Cancel: 'إلغاء',
  Done: 'تم',
  Save: 'حفظ',
  Edit: 'تعديل',
  Add: 'إضافة',
  Create: 'إنشاء',
  Discard: 'تجاهل',
  Continue: 'متابعة',
  Delete: 'حذف',
  Remove: 'إزالة',
  Close: 'إغلاق',
  Play: 'تشغيل',
  Pause: 'إيقاف مؤقت',
  Settings: 'الإعدادات',
  'Contact Us': 'اتصل بنا',
  'Unknown error': 'خطأ غير معروف',

  // Header & Search
  'Search gratitude logs...': 'بحث في سجلات الامتنان...',
  'Start typing to search your gratitude logs': 'ابدأ الكتابة للبحث في سجلات الامتنان',
  'Search failed': 'فشل البحث',
  'No results': 'لا توجد نتائج',

  // Gratitude
  'What are you grateful for today?': 'ما الذي تشعر بالامتنان له اليوم؟',
  'What were you grateful for yesterday?': 'ما الذي كنت ممتناً له بالأمس؟',
  'What are you grateful for?': 'ما الذي تشعر بالامتنان له؟',
  'Failed to load entries': 'فشل تحميل السجلات',
  'I was grateful for': 'كنت ممتناً لـ',

  // Date Entries
  'Loading...': 'جاري التحميل...',
  'No entries for this date': 'لا توجد سجلات لهذا التاريخ',
  'Create Entry': 'إنشاء سجل',
  'Something went wrong. Creating new entry.': 'حدث خطأ ما. جارٍ إنشاء سجل جديد.',

  // Gratitude Entry
  'Delete Entry?': 'حذف السجل؟',
  'Clearing the text will delete this entry entirely.':
    'مسح النص سيؤدي إلى حذف هذا السجل تماماً.',
  'This entry will be permanently deleted.': 'سيتم حذف هذا السجل نهائيًا.',
  'Leave without saving?': 'المغادرة دون حفظ؟',
  'Your entry is unsaved. Would you like to keep editing or discard them?':
    'سجلك غير محفوظ. هل تريد الاستمرار في التحرير أو تجاهله؟',
  'Keep Editing': 'متابعة التحرير',

  'Pick any date': 'اختر أي تاريخ',
  'Select date': 'حدد التاريخ',
  Mood: 'المزاج',
  Photo: 'صورة',
  'Add Photo': 'إضافة صورة',
  'Take Photo': 'التقاط صورة',
  'Choose from Library': 'اختيار من المكتبة',
  'Maximum {count} photos per entry': 'الحد الأقصى {count} صور لكل سجل',
  'Maximum {count} voice memos per entry': 'الحد الأقصى {count} مذكرات صوتية لكل سجل',
  'Camera Access Required': 'مطلوب الوصول إلى الكاميرا',
  'Photo Library Access Required': 'مطلوب الوصول إلى مكتبة الصور',
  'Please enable camera access in your device settings to take photos.':
    'يرجى تمكين الوصول إلى الكاميرا في إعدادات جهازك لالتقاط الصور.',
  'Please enable photo library access in your device settings to select photos.':
    'يرجى تمكين الوصول إلى مكتبة الصور في إعدادات جهازك لاختيار الصور.',
  'Open Settings': 'فتح الإعدادات',
  Voice: 'صوت',
  'Microphone Access Required': 'مطلوب الوصول للميكروفون',
  'Please enable microphone access in your device settings to record voice memos.':
    'يرجى تمكين الوصول إلى الميكروفون في إعدادات جهازك لتسجيل المذكرات الصوتية.',
  'Record Voice Note': 'تسجيل ملاحظة صوتية',
  'Tap the button below when ready.': 'اضغط على الزر أدناه عندما تكون جاهزًا.',
  'Start Recording': 'بدء التسجيل',
  'Recording Voice Note...': 'جاري تسجيل ملاحظة صوتية...',
  'Stop Recording': 'إيقاف التسجيل',
  'Voice Note Recorded': 'تم تسجيل الملاحظة الصوتية',
  'Tap on the play button to listen.': 'اضغط على زر التشغيل للاستماع.',
  'Save Recording': 'حفظ التسجيل',
  'Record Again': 'تسجيل مرة أخرى',

  'Title (optional)': 'العنوان (اختياري)',
  // Moods
  Amazing: 'مذهل',
  Happy: 'سعيد',
  Okay: 'بخير',
  Sad: 'حزين',
  Awful: 'سيء جداً',
  'How are you feeling?': 'كيف تشعر؟',
  'Feeling Amazing': 'أشعر بالروعة',
  'Feeling Happy': 'أشعر بالسعادة',
  'Feeling Okay': 'أشعر بأنني بخير',
  'Feeling Sad': 'أشعر بالحزن',
  'Feeling Awful': 'أشعر بالسوء',
  'Add tags...': 'أضف وسوم...',
  'Entry saved successfully': 'تم حفظ الإدخال بنجاح',
  'Failed to save entry': 'فشل حفظ الإدخال',
  'Failed to add photos': 'فشل إضافة الصور',
  'Failed to delete entry': 'فشل حذف الإدخال',
  'Tag already exists': 'الوسم موجود بالفعل',
  'Tag created': 'تم إنشاء الوسم',
  'Failed to create tag': 'فشل إنشاء الوسم',
  'Tag updated': 'تم تحديث الوسم',
  'Failed to update tag': 'فشل تحديث الوسم',
  'Tag deleted': 'تم حذف الوسم',
  'Failed to delete tag': 'فشل حذف الوسم',

  // Tags
  Tag: 'وسم',
  Tags: 'الوسوم',
  'Tag name': 'اسم الوسم',
  'Add a Tag': 'أضف وسماً',
  'Create New Tag': 'إنشاء وسم جديد',
  'New tag name...': 'اسم الوسم الجديد...',
  'No tags yet': 'لا توجد وسوم بعد',
  'Create your first tag': 'أنشئ وسمك الأول',
  'Edit Tag': 'تعديل الوسم',
  'Delete Tag': 'حذف الوسم',
  'Are you sure you want to delete the tag "{title}"?':
    'هل أنت متأكد أنك تريد حذف الوسم "{title}"؟',

  // Milestones
  'days of gratitude': 'أيام من الامتنان',

  // Settings
  Language: 'اللغة',
  'Select Language': 'اختر اللغة',
  'Device Default': 'افتراضي الجهاز',
  'Restart Required': 'إعادة التشغيل مطلوبة',
  'Language change requires app restart. Proceed?':
    'تغيير اللغة يتطلب إعادة تشغيل التطبيق. هل تريد المتابعة؟',
  Proceed: 'متابعة',
  'Reload App': 'إعادة تحميل التطبيق',

  // Settings - Notifications
  Notifications: 'الإشعارات',
  'Daily Reminder': 'التذكير اليومي',
  'Daily reminder notifications are on': 'إشعارات التذكير اليومية مفعلة',
  'Daily reminder notifications are off': 'إشعارات التذكير اليومية معطلة',
  'Adjust Reminder Time': 'ضبط وقت التذكير',
  'Change your daily reminder time': 'غيّر وقت التذكير اليومي',

  // Settings - Appearance
  Appearance: 'المظهر',
  Theme: 'السمة',
  'Select a theme': 'اختر سمة',
  'Choose from over 10 different themes and color schemes':
    'اختر من بين أكثر من 10 سمة ونظام ألوان مختلف',
  'Timeline Entry Length': 'طول إدخال الجدول الزمني',
  'Number of lines shown in the timeline':
    'عدد الأسطر المعروضة في الجدول الزمني. النص الكامل يظهر عند النقر على الإدخال',
  'Show Timeline Borders': 'إظهار حدود الجدول الزمني',
  'Show the borders in the timeline': 'إظهار الحدود في الجدول الزمني',
  'Hide the borders in the timeline': 'إخفاء الحدود من الجدول الزمني',
  'Inspirational Quotes': 'اقتباسات ملهمة',
  'Gratitude quotes will be shown on entry page': 'ستظهر اقتباسات الامتنان في صفحة السجل',
  'Date Style': 'نمط التاريخ',
  'Date includes day of the week': 'التاريخ يتضمن يوم الأسبوع',
  'First Day of Week': 'أول يوم في الأسبوع',
  'Set the first day of the week in the calendar view':
    'حدد أول يوم في الأسبوع في عرض التقويم',

  // Settings - Security
  Security: 'الأمان',
  'Unlock Tackbok': 'فتح تاكبوك',
  'Lock with biometric scanner if supported':
    'يمكن لتاكبوك القفل باستخدام الماسح البيومتري لجهازك (إذا كان مدعوماً)',

  // Settings - Backup & Restore
  'Backup & Restore': 'النسخ الاحتياطي والاستعادة',
  'Google Drive Backup': 'نسخ احتياطي على Google Drive',
  'Automatically back up your entries with Google Drive':
    'سجّل الدخول باستخدام حساب Google Drive لإجراء نسخ احتياطي تلقائي لإدخالاتك',
  'Backup Frequency': 'تكرار النسخ الاحتياطي',
  Daily: 'يومياً',
  Weekly: 'أسبوعياً',
  'On Every Change': 'عند كل تغيير',
  'Export to CSV': 'تصدير إلى CSV',
  'Full backup of entries and tags': 'نسخ احتياطي كامل للسجلات والوسوم',
  'Import Entries from CSV': 'استيراد السجلات من CSV',
  'Restore from a Tackbok backup file': 'استعادة من ملف نسخ احتياطي لتاكبوك',
  'Import from Presently App': 'استيراد من تطبيق Presently',
  'Import entries from a Presently CSV export':
    'استيراد السجلات من ملف CSV لتطبيق Presently',
  'Import from Presently?': 'استيراد من Presently؟',
  'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.':
    'سيتم استيراد السجلات من ملف CSV لتطبيق Presently. سيتم تخطي السجلات المكررة.',
  'Entries exported successfully': 'تم تصدير السجلات بنجاح',
  'Export failed': 'فشل التصدير',
  importedCount: 'تم استيراد {count} سجلات',
  importedCountSingular: 'تم استيراد {count} سجل',
  'Import failed': 'فشل الاستيراد',
  'Importing entries...': 'جارٍ استيراد السجلات...',
  'Are you sure you want to import?': 'هل أنت متأكد أنك تريد الاستيراد؟',
  'This will import entries from a Tackbok backup file. Duplicate entries will be skipped.':
    'سيتم استيراد السجلات من ملف نسخ احتياطي لتاكبوك. سيتم تخطي السجلات المكررة.',
  Import: 'استيراد',

  // Settings - App Information
  'App Information': 'معلومات التطبيق',
  FAQ: 'الأسئلة الشائعة',
  'Read frequently asked questions': 'اقرأ الأسئلة الشائعة عن تاكبوك',
  'Share Tackbok': 'شارك تاكبوك',
  'Share the app with friends and family':
    'هل تستمتع بتاكبوك؟ شارك التطبيق مع أصدقائك وعائلتك',
  'Privacy Policy': 'سياسة الخصوصية',
  'Read our privacy policy': 'اقرأ سياسة خصوصية تاكبوك',
  'Terms & Conditions': 'الشروط والأحكام',
  'Read our terms and conditions': 'اقرأ الشروط والأحكام',
  Analytics: 'جمع بيانات التحليلات',
  'Collecting anonymized analytics to help diagnose problems':
    'يقوم تاكبوك بجمع معلومات تحليلية مجهولة للمساعدة في تشخيص المشاكل ومراقبة الاتجاهات',
  Version: 'رقم الإصدار',

  // Settings - Danger Zone
  'Danger Zone': 'منطقة الخطر',
  'Delete All Data': 'حذف جميع البيانات',
  'Permanently delete all your entries, photos, and voice memos':
    'حذف جميع سجلاتك وصورك ومذكراتك الصوتية بشكل دائم',
  'Delete all data?': 'حذف جميع البيانات؟',
  'This action cannot be undone. All your entries, photos, and voice memos will be permanently deleted.':
    'لا يمكن التراجع عن هذا الإجراء. سيتم حذف جميع سجلاتك وصورك ومذكراتك الصوتية بشكل دائم.',
  'All data deleted': 'تم حذف جميع البيانات',
  'Delete failed': 'فشل الحذف',

  // Time Picker
  'Select Time': 'حدد الوقت',

  // Date Picker
  Today: 'اليوم',
  Yesterday: 'أمس',
  'Select Date': 'اختر تاريخاً',
  'Has entry': 'يحتوي على مدخل',
  Selected: 'محدد',
  'Previous month': 'الشهر السابق',
  'Next month': 'الشهر التالي',
  'Select month': 'اختر الشهر',
  'Select year': 'اختر السنة',
  Sun: 'أحد',
  Mon: 'إثنين',
  Tue: 'ثلاثاء',
  Wed: 'أربعاء',
  Thu: 'خميس',
  Fri: 'جمعة',
  Sat: 'سبت',
  Sunday: 'الأحد',
  Monday: 'الاثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة',
  Saturday: 'السبت',
  January: 'يناير',
  February: 'فبراير',
  March: 'مارس',
  April: 'أبريل',
  May: 'مايو',
  June: 'يونيو',
  July: 'يوليو',
  August: 'أغسطس',
  September: 'سبتمبر',
  October: 'أكتوبر',
  November: 'نوفمبر',
  December: 'ديسمبر',
  JAN: 'يناير',
  FEB: 'فبراير',
  MAR: 'مارس',
  APR: 'أبريل',
  MAY: 'مايو',
  JUN: 'يونيو',
  JUL: 'يوليو',
  AUG: 'أغسطس',
  SEP: 'سبتمبر',
  OCT: 'أكتوبر',
  NOV: 'نوفمبر',
  DEC: 'ديسمبر',

  // Date Format Patterns (placeholders: {weekday}, {month}, {day}, {year})
  'dateFormat.short': '{day} {month} {year}',
  'dateFormat.full': '{weekday}، {day} {month} {year}',
  'dateFormat.timeLabel': '{weekday} في {time}',
};
