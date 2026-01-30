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
  Continue: 'متابعة',
  Delete: 'حذف',
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
  'No entries for this date': 'لا توجد إدخالات لهذا التاريخ',
  'Create Entry': 'إنشاء إدخال',

  // Gratitude Entry
  'Delete Entry?': 'حذف السجل؟',
  'Clearing the text will delete this entry entirely.':
    'مسح النص سيؤدي إلى حذف هذا السجل تماماً.',
  'Are you sure you want to go back?': 'هل أنت متأكد أنك تريد الرجوع؟',
  'Your entry is unsaved and your changes will be lost!':
    'لم يتم حفظ إدخالك وسوف تضيع تغييراتك!',

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
  'Choose from over 40 different themes and color schemes':
    'اختر من بين أكثر من 40 سمة ونظام ألوان مختلف',
  'Timeline Entry Length': 'طول إدخال الجدول الزمني',
  'Number of lines shown in the timeline':
    'عدد الأسطر المعروضة في الجدول الزمني. النص الكامل يظهر عند النقر على الإدخال',
  'Show Timeline Borders': 'إظهار حدود الجدول الزمني',
  'Show the borders in the timeline': 'إظهار الحدود في الجدول الزمني',
  'Hide the borders in the timeline': 'إخفاء الحدود من الجدول الزمني',
  'Inspirational Quotes': 'اقتباسات ملهمة',
  'Gratitude quotes will be shown on entry page':
    'ستظهر اقتباسات الامتنان في صفحة الإدخال',
  'Date Style': 'نمط التاريخ',
  'Date includes day of the week': 'التاريخ يتضمن يوم الأسبوع',
  'First Day of Week': 'أول يوم في الأسبوع',
  'Set the first day of the week in the calendar view':
    'حدد أول يوم في الأسبوع في عرض التقويم',
  Saturday: 'السبت',
  Sunday: 'الأحد',
  Monday: 'الاثنين',

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
  'Manually export your entries to CSV format':
    'صدّر إدخالاتك يدوياً بتنسيق CSV إلى جهازك',
  'Import from Backup': 'استيراد من نسخة احتياطية',
  'Select a backed up CSV file to import': 'حدد ملف CSV محفوظ للاستيراد',
  'Entries exported successfully': 'تم تصدير السجلات بنجاح',
  'Export failed': 'فشل التصدير',
  Imported: 'تم استيراد',
  entries: 'سجلات',
  'Import failed': 'فشل الاستيراد',
  'Are you sure you want to import?': 'هل أنت متأكد أنك تريد الاستيراد؟',
  'Imported data could overwrite existing entries.':
    'قد تحل البيانات المستوردة محل السجلات الموجودة.',
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
  'Permanently delete all your entries': 'حذف جميع سجلاتك بشكل دائم',
  'Delete all data?': 'حذف جميع البيانات؟',
  'This action cannot be undone. All your entries will be permanently deleted.':
    'لا يمكن التراجع عن هذا الإجراء. سيتم حذف جميع سجلاتك بشكل دائم.',
  'All data deleted': 'تم حذف جميع البيانات',
  'Delete failed': 'فشل الحذف',

  // Date Picker
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
};
