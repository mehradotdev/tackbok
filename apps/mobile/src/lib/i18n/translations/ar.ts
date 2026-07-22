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
  Back: 'رجوع',
  Create: 'إنشاء',
  Discard: 'تجاهل',
  Delete: 'حذف',
  Remove: 'إزالة',
  Close: 'إغلاق',
  Play: 'تشغيل',
  Pause: 'إيقاف مؤقت',
  Settings: 'الإعدادات',
  'Share Feedback': 'مشاركة الملاحظات',
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
  'What were you grateful for?': 'ما الذي كنت ممتنًا له؟',
  'Failed to load entries': 'فشل تحميل السجلات',
  'Write now': 'اكتب الآن',
  'Pick a date': 'اختر تاريخًا',
  'Collapse gratitude actions': 'طي إجراءات الامتنان',
  'Expand gratitude actions': 'توسيع إجراءات الامتنان',

  // Date Entries
  'Loading...': 'جاري التحميل...',
  'No entries for this date': 'لا توجد سجلات لهذا التاريخ',
  'Create Entry': 'إنشاء سجل',
  'Something went wrong. Creating new entry.': 'حدث خطأ ما. جارٍ إنشاء سجل جديد.',

  // Gratitude Entry
  'Delete Entry?': 'حذف السجل؟',
  'This entry will be permanently deleted.': 'سيتم حذف هذا السجل نهائيًا.',
  'Leave without saving?': 'المغادرة دون حفظ؟',
  'Your entry is unsaved. Would you like to keep editing or discard them?':
    'سجلك غير محفوظ. هل تريد الاستمرار في التحرير أو تجاهله؟',
  'Keep Editing': 'متابعة التحرير',

  'Pick any date': 'اختر أي تاريخ',
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
  'Discard Recording': 'تجاهل التسجيل',
  'Processing Audio...': 'جاري معالجة الصوت...',
  'Optimizing your recording.': 'جاري تحسين التسجيل.',
  'Voice notes save automatically at 30:00.':
    'يتم حفظ الملاحظات الصوتية تلقائيًا عند 30:00.',
  'Title (optional)': 'العنوان (اختياري)',
  'Use Prompt': 'استخدم السؤال',
  'New Prompt': 'سؤال جديد',
  'Add Prompt': 'إضافة سؤال',
  'Show All': 'عرض الكل',
  'Prompt text': 'نص السؤال',
  'Prompt already exists': 'السؤال موجود بالفعل',
  'Prompt created': 'تم إنشاء السؤال',
  'Failed to create prompt': 'فشل إنشاء السؤال',
  'Prompt updated': 'تم تحديث السؤال',
  'Failed to update prompt': 'فشل تحديث السؤال',
  'Prompt deleted': 'تم حذف السؤال',
  'Failed to delete prompt': 'فشل حذف السؤال',
  Faith: 'الإيمان',
  Self: 'الذات',
  Health: 'الصحة',
  Friends: 'الأصدقاء',
  Family: 'العائلة',
  'Little things': 'الأشياء الصغيرة',
  'Create Prompt': 'إنشاء سؤال',
  'Create a Prompt': 'إنشاء سؤال',
  'Edit Prompt': 'تعديل السؤال',
  'Delete Prompt': 'حذف السؤال',
  'Delete Prompt?': 'حذف السؤال؟',
  'Are you sure you want to delete this prompt?': 'هل أنت متأكد أنك تريد حذف هذا السؤال؟',
  'No prompts yet': 'لا توجد أسئلة بعد',
  'Create your first prompt': 'أنشئ سؤالك الأول',

  // Prompts - Faith
  prompt_faith_1: 'ما أول ذكرى لديك لشعورك بحضور الله؟',
  prompt_faith_2: 'أين رأيت نعمة في حياتك مؤخراً؟',
  prompt_faith_3: 'ما الصلاة التي حملتك خلال موسم صعب؟',
  prompt_faith_4: 'كيف غير إيمانك نظرتك للتحديات؟',
  prompt_faith_5: 'ما هي الممارسة أو العادة الروحية التي تجلب لك السلام الأكبر؟',
  prompt_faith_6: 'اكتب عن وقت شعرت فيه بوضوح أنك موجه بقوة عليا.',
  prompt_faith_7: 'ما هو التعليم أو الاقتباس المعين الذي يلهم حياتك اليومية؟',
  prompt_faith_8: 'كيف تجد التواصل الروحي في خضم أسبوع مزدحم؟',
  prompt_faith_9: 'تأمل في لحظة قدم لك فيها إيمانك الراحة أثناء عدم اليقين.',

  // Prompts - Self
  prompt_self_1: 'ما الشيء الذي تحتاج إلى المزيد منه في حياتك؟',
  prompt_self_2: 'ما الشيء الذي كان صعباً عليك ومع ذلك فعلته؟',
  prompt_self_3: 'ماذا ستقول لنسختك الأصغر سناً اليوم؟',
  prompt_self_4: 'ما هو الإنجاز الأخير الذي لم تحتفل به بما فيه الكفاية؟',
  prompt_self_5: 'اكتب ثلاثة أشياء تحبها في شخصيتك.',
  prompt_self_6: 'كيف تطورت من خطأ ارتكبته مؤخراً؟',
  prompt_self_7: 'ما هي الحدود التي تحتاج إلى وضعها لحماية طاقتك؟',
  prompt_self_8: 'في أي مجال من مجالات حياتك تشعر فيها بأنك على طبيعتك؟',
  prompt_self_9: 'صف يومك المثالي، من الصباح إلى المساء.',

  // Prompts - Health
  prompt_health_1: 'ما الجزء من جسدك الذي تشعر بأكبر امتنان له اليوم؟',
  prompt_health_2: 'كيف ساعدتك الراحة مؤخراً؟',
  prompt_health_3: 'ما العادة الصحية التي تفتخر بالحفاظ عليها؟',
  prompt_health_4: 'ما هي الوجبة المغذية التي تجعلك تشعر بالرضا دائمًا؟',
  prompt_health_5: 'صف نشاطًا بدنيًا يجلب لك الفرح بدلاً من الشعور بأنه عمل روتيني.',
  prompt_health_6: 'كيف يخبرك جسدك عندما يحتاج إلى الإبطاء أو الراحة؟',
  prompt_health_7: 'ما الذي تفعله اليوم للعناية بصحتك العقلية؟',
  prompt_health_8: 'اكتب عن وقت تغلبت فيه على تحدٍ أو إصابة جسدية.',
  prompt_health_9: 'ما هو التغيير الصغير الذي يمكنك إجراؤه لتحسين جودة نومك؟',

  // Prompts - Friends
  prompt_friends_1: 'أي صديق جعل حياتك أخف مؤخراً؟',
  prompt_friends_2: 'ما الذكرى مع صديق التي ما زالت تجعلك تبتسم؟',
  prompt_friends_3: 'من تريد أن تشجعه هذا الأسبوع؟',
  prompt_friends_4: 'ما هي الجودة التي تقدرها أكثر في صداقاتك القريبة؟',
  prompt_friends_5: 'اكتب عن صديق ساعدك على رؤية الأشياء من منظور مختلف.',
  prompt_friends_6: 'كيف تفضل إظهار تقديرك وحبك لأصدقائك؟',
  prompt_friends_7: 'من هو الصديق الذي لم تتحدث إليه منذ فترة، وماذا ستقول له؟',
  prompt_friends_8: 'صف مغامرة ممتعة أو غير متوقعة قمت بها مع صديق.',
  prompt_friends_9: 'ما هو الدرس الذي تعلمته من إحدى صداقاتك؟',

  // Prompts - Family
  prompt_family_1: 'ما التقليد العائلي الذي تشعر بالامتنان له؟',
  prompt_family_2: 'من في عائلتك علّمك شيئاً باقياً؟',
  prompt_family_3: 'ما اللحظة الصغيرة مع العائلة التي تريد أن تتذكرها؟',
  prompt_family_4: 'ما هي القصة من تاريخ عائلتك التي تجدها ملهمة؟',
  prompt_family_5: 'كيف تطورت علاقتك بأحد أفراد العائلة بمرور الوقت؟',
  prompt_family_6: 'اكتب عن مهارة أو وصفة تم تناقلها في عائلتك.',
  prompt_family_7: 'ما هي السمة الشخصية المحددة التي تشاركها مع أحد والديك أو إخوتك؟',
  prompt_family_8: 'صف ذكرى من الطفولة لا تزال تجلب لك فرحًا هائلاً.',
  prompt_family_9: 'كيف تدعم عائلتك بعضها البعض خلال الأوقات الصعبة؟',

  // Prompts - Little Things
  prompt_littleThings_1: 'ما الذي جعلك تبتسم اليوم؟',
  prompt_littleThings_2: 'ما اللحظة الصغيرة التي جعلتك تتوقف اليوم؟',
  prompt_littleThings_3: 'ما الراحة اليومية التي ستفتقدها أكثر من غيرها؟',
  prompt_littleThings_4: 'صف تفصيلاً صغيراً ودنيويًا في محيطك يكون جميلًا.',
  prompt_littleThings_5: 'ما هو صوتك المفضل الذي تسمعه عندما تستيقظ في الصباح؟',
  prompt_littleThings_6: 'اكتب عن متعة بسيطة تتطلع إليها كل يوم.',
  prompt_littleThings_7: 'ما هو أفضل جزء من روتينك الصباحي اليوم؟',
  prompt_littleThings_8: 'شارك لقاءً قصيرًا مع شخص غريب دافئ قلبك.',
  prompt_littleThings_9: 'ما هو العنصر غير المكلف الذي يجلب قيمة كبيرة لحياتك؟',

  // Default Worksheet Template Keys
  'What I am grateful for today...': 'ما الذي أشعر بالامتنان له اليوم...',
  'My affirmation for today...': 'توكيدي لنفسي اليوم...',
  'One little thing that made me smile recently...':
    'شيء صغير واحد جعلني أبتسم مؤخراً...',

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
  'Entry saved successfully': 'تم حفظ الإدخال بنجاح',
  'Failed to save entry': 'فشل حفظ الإدخال',
  'Failed to save voice memo': 'فشل حفظ المذكرة الصوتية',
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
  'Edit Tag': 'تعديل الوسم',
  'Delete Tag': 'حذف الوسم',
  'Are you sure you want to delete the tag "{title}"?':
    'هل أنت متأكد أنك تريد حذف الوسم "{title}"؟',

  // Milestones
  'days of gratitude': 'أيام من الامتنان',

  // Settings - Profile
  'Your Name': 'اسمك',
  'Change Photo': 'تغيير الصورة',
  'Profile Photo': 'صورة الملف الشخصي',
  'Would you like to update or remove your profile photo?':
    'هل تريد تحديث أو إزالة صورة ملفك الشخصي؟',
  'Update Photo': 'تحديث الصورة',
  'Remove Photo': 'إزالة الصورة',

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
  'Failed to update reminder': 'فشل تحديث التذكير',
  'Notification permission needed': 'مطلوب إذن الإشعارات',
  'To get daily reminders, allow notifications for Tackbok in your device settings.':
    'للحصول على تذكيرات يومية، اسمح بالإشعارات لتطبيق Tackbok من إعدادات جهازك.',

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

  // Settings - Typography
  Typography: 'الخطوط',
  'Title Font': 'خط العنوان',
  'Choose a font for titles and headings': 'اختر خطًا للعناوين والترويسات',
  Default: 'افتراضي',
  'Font Size': 'حجم الخط',
  'Adjust the size of body text': 'ضبط حجم النص الأساسي',
  Small: 'صغير',
  Large: 'كبير',
  'Preview of the selected font': 'معاينة الخط المحدد',
  'Gratitude makes today brighter': 'الامتنان يجعل اليوم أكثر إشراقًا',

  // Settings - Journaling
  Journaling: 'الكتابة اليومية',
  'Worksheet Template': 'قالب ورقة الكتابة',
  'Edit Worksheet Template': 'تعديل قالب ورقة الكتابة',
  'Use this template to pre-fill the body of new gratitude entries':
    'استخدم هذا القالب لملء نص الإدخالات الجديدة مسبقاً',
  'Reset to Default': 'إعادة التعيين إلى الافتراضي',
  'Journaling Worksheet': 'ورقة الكتابة اليومية',
  'Start Writing': 'ابدأ الكتابة',
  'Journal Focus Areas': 'مجالات التركيز في اليوميات',
  'Personalize your journal prompts.': 'خصّص مطالبات يومياتك.',
  'Pick the topics you want to write about.': 'اختر الموضوعات التي تريد الكتابة عنها.',
  'Select at least 2 focus areas': 'اختر مجالين على الأقل',
  'Journal Prompts': 'مطالبات اليوميات',
  'Choose which prompts to show when starting a new journal entry.':
    'اختر المطالبات التي تظهر عند بدء إدخال جديد.',
  Off: 'إيقاف',
  'All Prompts': 'كل الأسئلة',
  'My Prompts': 'أسئلتي',
  'Built In Prompts': 'المطالبات المدمجة',
  focusArea_self_desc: 'تأمل في هواياتك واهتماماتك وتجاربك وحياتك بشكل عام.',
  focusArea_littleThings_desc:
    'قدّر الأشياء الصغيرة والنعم اليومية التي كثيرًا ما نغفل عنها.',
  focusArea_health_desc: 'قدّر النعم الكثيرة لجسمك وقدراته.',
  focusArea_family_desc: 'قدّر أفراد عائلتك واللحظات المشتركة معهم.',
  focusArea_friends_desc: 'قدّر أصدقاءك المحبين والداعمين والمتفهمين.',
  focusArea_faith_desc: 'ركّز على تقدير إيمانك وروحانيتك وسلامك الداخلي.',

  // Settings - Security
  Security: 'الأمان',
  'Unlock Tackbok': 'فتح تاكبوك',
  'Lock with biometric scanner if supported':
    'يمكن لتاكبوك القفل باستخدام الماسح البيومتري لجهازك (إذا كان مدعوماً)',

  // Settings - Backup & Restore
  'Backup & Restore': 'النسخ الاحتياطي والاستعادة',
  'Google Drive Backup': 'نسخ احتياطي على Google Drive',
  'Automatically back up your entries with Google Drive':
    'قم بتسجيل الدخول بحساب Google Drive الخاص بك للنسخ الاحتياطي التلقائي لإدخالاتك',
  'Backup Frequency': 'تكرار النسخ الاحتياطي',
  Daily: 'يومياً',
  Weekly: 'أسبوعياً',
  'On Every Change': 'عند كل تغيير',
  'Export as .ZIP': 'تصدير بصيغة .ZIP',
  'All of your data in a format that you can restore in the app later':
    'جميع بياناتك بتنسيق يمكنك استعادته في التطبيق لاحقاً',
  'Import as .ZIP': 'استيراد بصيغة .ZIP',
  'Restore your data from a .zip file': 'استعادة بياناتك من ملف .zip',
  'Import from Gratitude App': 'استيراد من تطبيق Gratitude',
  'Importing from Gratitude App': 'جاري الاستيراد من تطبيق Gratitude',
  'Import data from a Gratitude App .zip backup':
    'استيراد البيانات من نسخة .zip لتطبيق Gratitude',
  'Choose Import Mode': 'اختر وضع الاستيراد',
  'How should this import handle entries that already exist in Tackbok?':
    'كيف يجب أن يتعامل هذا الاستيراد مع الإدخالات الموجودة بالفعل في تاكبوك؟',
  'Skip Existing Entries': 'تخطي الإدخالات الحالية',
  'Skip Existing Entries (Recommended)': 'تخطي الإدخالات الحالية (موصى به)',
  'Only import entries with new note IDs': 'استيراد الإدخالات بمعرفات ملاحظات جديدة فقط',
  'Overwrite Matching Entries': 'استبدال الإدخالات المطابقة',
  'Replace existing entries when note IDs match':
    'استبدال الإدخالات الحالية عند تطابق معرفات الملاحظات',
  'Import from Presently App': 'استيراد من تطبيق Presently',
  'Restore your data from a Presently .csv file':
    'استعادة بياناتك من ملف .csv لتطبيق Presently',
  'Import from Presently?': 'استيراد من Presently؟',
  'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.':
    'سيتم استيراد الإدخالات من ملف CSV لتطبيق Presently. سيتم تخطي الإدخالات المكررة.',
  'Backup exported successfully': 'تم تصدير النسخة الاحتياطية بنجاح',
  'Export failed': 'فشل التصدير',
  importedCount: 'تم استيراد {count} إدخال/إدخالات',
  'Import failed': 'فشل الاستيراد',
  'Restoring Tackbok backup': 'جاري استعادة النسخة الاحتياطية لتاكبوك',
  'Load Presently export': 'تحميل تصدير Presently',
  'Import journal entries': 'استيراد إدخالات اليوميات',
  'Open backup file': 'فتح ملف النسخة الاحتياطية',
  'Validate backup contents': 'التحقق من محتويات النسخة الاحتياطية',
  'Restore profile': 'استعادة الملف الشخصي',
  'Import tags and prompts': 'استيراد الوسوم والمطالبات',
  'Restore entries and media': 'استعادة الإدخالات والوسائط',
  'Refresh journal data': 'تحديث بيانات اليوميات',
  'Loading the selected import file.': 'جاري تحميل ملف الاستيراد المحدد.',
  'Checking backup contents and file structure.':
    'جاري التحقق من محتويات ملف النسخ الاحتياطي وهيكله.',
  'Restoring profile details and profile photo if available.':
    'جاري استعادة تفاصيل الملف الشخصي وصورة الملف الشخصي إن وجدت.',
  'Adding tags and prompts before entries are restored.':
    'جاري إضافة الوسوم والمطالبات قبل استعادة الإدخالات.',
  'Processing {processed} of {total} journal entries and attached media.':
    'جاري معالجة {processed} من {total} من إدخالات اليوميات والوسائط المرفقة.',
  'No journal entries found in this backup.':
    'لم يتم العثور على إدخالات يوميات في هذه النسخة الاحتياطية.',
  'Refreshing your journal so imported data appears everywhere.':
    'جاري تحديث يومياتك حتى تظهر البيانات المستوردة في كل مكان.',
  'Entries processed': 'الإدخالات المعالجة',
  'Entries skipped due to errors': 'إدخالات تم تخطيها بسبب أخطاء',
  'Please do not close or minimize the app while the import is in progress.':
    'الرجاء عدم إغلاق التطبيق أو تصغيره أثناء تقدم عملية الاستيراد.',
  'Tags added': 'الوسوم المضافة',
  'Prompts added': 'المطالبات المضافة',
  'Photos restored': 'الصور المستعادة',
  'Voice memos restored': 'المذكرات الصوتية المستعادة',
  'Media skipped': 'الوسائط المتخطاة',
  'Tackbok backup restored': 'تمت استعادة النسخة الاحتياطية لتاكبوك',
  'Gratitude import complete': 'اكتمل استيراد Gratitude',
  'Presently import complete': 'اكتمل استيراد Presently',
  'Your journal data is ready to review, but some items could not be restored.':
    'بيانات يومياتك جاهزة للمراجعة، ولكن لم يتم استعادة بعض العناصر.',
  'Your journal data is ready to review.': 'بيانات يومياتك جاهزة للمراجعة.',
  'This import finished with warnings. Some items could not be restored, and everything else already existed in Tackbok.':
    'انتهى الاستيراد مع تحذيرات. لم يتم استعادة بعض العناصر، وكل شيء آخر موجود بالفعل في تاكبوك.',
  'This import finished, but everything already existed in Tackbok.':
    'انتهى الاستيراد، لكن كل شيء كان موجودًا بالفعل في تاكبوك.',
  'This import finished with warnings. Some items could not be restored.':
    'انتهى هذا الاستيراد مع تحذيرات. لم يتم استعادة بعض العناصر.',
  'This import finished successfully.': 'انتهى هذا الاستيراد بنجاح.',
  'Imported from Tackbok backup': 'مستورد من نسخة تاكبوك الاحتياطية',
  'Imported from Gratitude backup': 'مستورد من نسخة Gratitude الاحتياطية',
  'Imported from Presently export': 'مستورد من تصدير Presently',
  'New entries': 'إدخالات جديدة',
  'Updated entries': 'إدخالات تم تحديثها',
  'Skipped duplicates': 'تم تخطي المكررات',
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
  'Check for updates': 'التحقق من التحديثات',
  'Checking for updates…': 'جارٍ التحقق من التحديثات…',
  'Restart to apply': 'أعد التشغيل للتطبيق',
  'Update downloaded. Restart to apply it.': 'تم تنزيل التحديث. أعد التشغيل لتطبيقه.',
  'You already have the latest version': 'لديك أحدث إصدار بالفعل',
  'Unable to update': 'تعذّر التحديث',
  Version: 'رقم الإصدار',

  // Settings - Danger Zone
  'Danger Zone': 'منطقة الخطر',
  'Delete All Data': 'حذف جميع البيانات',
  'Permanently delete all your app data': 'حذف جميع بيانات التطبيق الخاصة بك بشكل دائم',
  'Delete all data?': 'حذف جميع البيانات؟',
  'This action cannot be undone. All your app data will be permanently deleted.':
    'لا يمكن التراجع عن هذا الإجراء. سيتم حذف جميع بيانات التطبيق الخاصة بك بشكل دائم.',
  'All data deleted': 'تم حذف جميع البيانات',
  'All data deleted, but some media files could not be removed.':
    'تم حذف جميع البيانات، ولكن تعذر إزالة بعض ملفات الوسائط.',
  'Delete failed': 'فشل الحذف',

  // Time Picker
  'Select Time': 'حدد الوقت',

  // Date Picker
  Today: 'اليوم',
  Yesterday: 'أمس',
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
