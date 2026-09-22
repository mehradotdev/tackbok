import type { Translations } from '../types';

/**
 * Arabic (ar) translations
 * Contains translations for all UI strings used in the application
 */
export const ar: Translations = {
  // Cold-start header greeting
  'greeting.welcomeBack': 'مرحبًا بعودتك',
  'greeting.goodMorning': 'صباح الخير',
  'greeting.goodAfternoon': 'طاب يومك',
  'greeting.goodEvening': 'مساء الخير',
  'greeting.goodNight': 'تصبح على خير',
  'greeting.happySunday': 'أحد سعيد',
  'greeting.happyMonday': 'اثنين سعيد',
  'greeting.happyTuesday': 'ثلاثاء سعيد',
  'greeting.happyWednesday': 'أربعاء سعيد',
  'greeting.happyThursday': 'خميس سعيد',
  'greeting.happyFriday': 'جمعة سعيدة',
  'greeting.happySaturday': 'سبت سعيد',
  'greeting.withName': '{greeting}، {name}',

  // Common
  'common.tackbok': 'تاكبوك',
  'common.cancel': 'إلغاء',
  'common.done': 'تم',
  'common.save': 'حفظ',
  'common.back': 'رجوع',
  'common.create': 'إنشاء',
  'common.discard': 'تجاهل',
  'common.delete': 'حذف',
  'common.remove': 'إزالة',
  'common.close': 'إغلاق',
  'common.play': 'تشغيل',
  'common.pause': 'إيقاف مؤقت',
  'common.settings': 'الإعدادات',
  'common.shareFeedback': 'مشاركة الملاحظات',
  'common.contactUs': 'اتصل بنا',
  'common.unknownError': 'خطأ غير معروف',
  'common.retry': 'إعادة المحاولة',

  // Header & Search
  'search.searchGratitudeLogs': 'البحث في السجلات…',
  'search.startTypingToSearchYourGratitudeLogs': 'اكتب للبحث في سجلاتك',
  'search.searchFailed': 'فشل البحث',
  'search.noResults': 'لا توجد نتائج',

  // Gratitude
  'gratitude.whatAreYouGratefulForToday': 'ما الذي تشعر بالامتنان له اليوم؟',
  'gratitude.whatWereYouGratefulForYesterday': 'ما الذي كنت ممتناً له بالأمس؟',
  'gratitude.whatAreYouGratefulFor': 'ما الذي تشعر بالامتنان له؟',
  'gratitude.whatWereYouGratefulFor': 'ما الذي كنت ممتنًا له؟',
  'gratitude.failedToLoadEntries': 'فشل تحميل السجلات',
  'gratitude.writeNow': 'اكتب الآن',
  'gratitude.pickADate': 'اختر تاريخًا',
  'gratitude.playWithPet': 'العب مع الحيوان الأليف',
  'gratitude.collapseGratitudeActions': 'طي إجراءات الامتنان',
  'gratitude.expandGratitudeActions': 'توسيع إجراءات الامتنان',

  // Date Entries
  'dateEntries.loading': 'جاري التحميل...',
  'dateEntries.noEntriesForThisDate': 'لا توجد سجلات لهذا التاريخ',
  'dateEntries.createEntry': 'إنشاء سجل',
  'dateEntries.somethingWentWrongCreatingNewEntry': 'حدث خطأ ما. جارٍ إنشاء سجل جديد.',

  // Gratitude Entry
  'entry.deleteEntry': 'حذف السجل؟',
  'entry.thisEntryWillBePermanentlyDeleted': 'سيتم حذف هذا السجل نهائيًا.',
  'entry.entryNotFound': 'لم يتم العثور على السجل',
  'entry.leaveWithoutSaving': 'المغادرة دون حفظ؟',
  'entry.discardChanges.message':
    'لم تُحفظ التغييرات. هل تريد متابعة التحرير أم تجاهل التغييرات؟',
  'entry.keepEditing': 'متابعة التحرير',

  'entry.pickAnyDate': 'اختر أي تاريخ',
  'entry.mood': 'المزاج',
  'entry.photo': 'صورة',
  'entry.addPhoto': 'إضافة صورة',
  'entry.takePhoto': 'التقاط صورة',
  'entry.chooseFromLibrary': 'اختيار من المكتبة',
  'entry.maximumCountPhotosPerEntry': 'الحد الأقصى {count} صور لكل سجل',
  'entry.maximumCountVoiceMemosPerEntry': 'الحد الأقصى {count} ملاحظات صوتية لكل سجل',
  'entry.cameraAccessRequired': 'مطلوب الوصول إلى الكاميرا',
  'entry.photoLibraryAccessRequired': 'مطلوب الوصول إلى مكتبة الصور',
  'entry.pleaseEnableCameraAccessInYourDeviceSettingsToTake':
    'يرجى تمكين الوصول إلى الكاميرا في إعدادات جهازك لالتقاط الصور.',
  'entry.pleaseEnablePhotoLibraryAccessInYourDeviceSettingsTo':
    'يرجى تمكين الوصول إلى مكتبة الصور في إعدادات جهازك لاختيار الصور.',
  'entry.openSettings': 'فتح الإعدادات',
  'entry.voice': 'صوت',
  'entry.microphoneAccessRequired': 'مطلوب الوصول للميكروفون',
  'entry.pleaseEnableMicrophoneAccessInYourDeviceSettingsToRecord':
    'يرجى تمكين الوصول إلى الميكروفون في إعدادات جهازك لتسجيل الملاحظات الصوتية.',
  'entry.recordVoiceNote': 'تسجيل ملاحظة صوتية',
  'entry.tapTheButtonBelowWhenReady': 'اضغط على الزر أدناه عندما تكون جاهزًا.',
  'entry.startRecording': 'بدء التسجيل',
  'entry.recordingVoiceNote': 'جارٍ تسجيل ملاحظة صوتية…',
  'entry.stopRecording': 'إيقاف التسجيل',
  'entry.voiceNoteRecorded': 'تم تسجيل الملاحظة الصوتية',
  'entry.tapOnThePlayButtonToListen': 'اضغط على زر التشغيل للاستماع.',
  'entry.saveRecording': 'حفظ التسجيل',
  'entry.discardRecording': 'تجاهل التسجيل',
  'entry.voiceNotesSaveAutomaticallyAt3000':
    'تُحفظ الملاحظات الصوتية تلقائيًا بعد 30 دقيقة.',
  'entry.titleOptional': 'العنوان (اختياري)',
  'entry.usePrompt': 'استخدم السؤال',
  'entry.newPrompt': 'سؤال جديد',
  'entry.addPrompt': 'إضافة سؤال',
  'entry.showAll': 'عرض الكل',
  'entry.promptText': 'نص السؤال',
  'entry.promptAlreadyExists': 'السؤال موجود بالفعل',
  'entry.promptCreated': 'تم إنشاء السؤال',
  'entry.failedToCreatePrompt': 'فشل إنشاء السؤال',
  'entry.promptUpdated': 'تم تحديث السؤال',
  'entry.failedToUpdatePrompt': 'فشل تحديث السؤال',
  'entry.promptDeleted': 'تم حذف السؤال',
  'entry.failedToDeletePrompt': 'فشل حذف السؤال',
  'entry.faith': 'الإيمان',
  'entry.self': 'الذات',
  'entry.health': 'الصحة',
  'entry.friends': 'الأصدقاء',
  'entry.family': 'العائلة',
  'entry.littleThings': 'الأشياء الصغيرة',
  'entry.createPrompt': 'إنشاء سؤال',
  'entry.createAPrompt': 'إنشاء سؤال',
  'entry.editPrompt': 'تعديل السؤال',
  'entry.deletePrompt': 'حذف السؤال',
  'entry.deletePrompt2': 'حذف السؤال؟',
  'entry.areYouSureYouWantToDeleteThisPrompt': 'هل أنت متأكد أنك تريد حذف هذا السؤال؟',
  'entry.noPromptsYet': 'لا توجد أسئلة بعد',
  'entry.createYourFirstPrompt': 'أنشئ سؤالك الأول',

  // Prompts - Faith
  prompt_faith_1: 'ما أول ذكرى لديك لشعورك بحضور الله؟',
  prompt_faith_2: 'أين رأيت نعمة في حياتك مؤخراً؟',
  prompt_faith_3: 'ما الصلاة التي ساعدتك على تجاوز فترة صعبة؟',
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
  prompt_self_9: 'صف يومك المثالي من الصباح إلى الليل.',

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
  prompt_littleThings_4: 'صف تفصيلًا صغيرًا من الحياة اليومية حولك تراه جميلًا.',
  prompt_littleThings_5: 'ما هو صوتك المفضل الذي تسمعه عندما تستيقظ في الصباح؟',
  prompt_littleThings_6: 'اكتب عن متعة بسيطة تتطلع إليها كل يوم.',
  prompt_littleThings_7: 'ما هو أفضل جزء من روتينك الصباحي اليوم؟',
  prompt_littleThings_8: 'صف لقاءً قصيرًا مع شخص غريب جلب لك الفرح.',
  prompt_littleThings_9: 'ما هو العنصر غير المكلف الذي يجلب قيمة كبيرة لحياتك؟',

  // Default Worksheet Template Keys
  'worksheet.whatIAmGratefulForToday': 'ما الذي أشعر بالامتنان له اليوم...',
  'worksheet.myAffirmationForToday': 'توكيدي لنفسي اليوم...',
  'worksheet.oneLittleThingThatMadeMeSmileRecently':
    'شيء صغير واحد جعلني أبتسم مؤخراً...',

  // Moods
  'mood.amazing': 'مذهل',
  'mood.happy': 'سعيد',
  'mood.okay': 'بخير',
  'mood.sad': 'حزين',
  'mood.awful': 'سيء جداً',
  'mood.howAreYouFeeling': 'كيف تشعر؟',
  'mood.feelingAmazing': 'أشعر بالروعة',
  'mood.feelingHappy': 'أشعر بالسعادة',
  'mood.feelingOkay': 'أشعر بأنني بخير',
  'mood.feelingSad': 'أشعر بالحزن',
  'mood.feelingAwful': 'أشعر بالسوء',
  'mood.entrySavedSuccessfully': 'تم حفظ السجل بنجاح',
  'mood.failedToSaveEntry': 'فشل حفظ السجل',
  'mood.failedToSaveVoiceMemo': 'فشل حفظ الملاحظة الصوتية',
  'mood.failedToAddPhotos': 'فشل إضافة الصور',
  'mood.failedToDeleteEntry': 'فشل حذف السجل',
  'mood.tagAlreadyExists': 'الوسم موجود بالفعل',
  'mood.tagCreated': 'تم إنشاء الوسم',
  'mood.failedToCreateTag': 'فشل إنشاء الوسم',
  'mood.tagUpdated': 'تم تحديث الوسم',
  'mood.failedToUpdateTag': 'فشل تحديث الوسم',
  'mood.tagDeleted': 'تم حذف الوسم',
  'mood.failedToDeleteTag': 'فشل حذف الوسم',

  // Tags
  'tags.tag': 'وسم',
  'tags.tagName': 'اسم الوسم',
  'tags.addATag': 'إضافة وسم',
  'tags.createNewTag': 'إنشاء وسم',
  'tags.editTag': 'تعديل الوسم',
  'tags.deleteTag': 'حذف الوسم',
  'tags.areYouSureYouWantToDeleteTheTagTitle':
    'هل أنت متأكد أنك تريد حذف الوسم "{title}"؟',

  // Milestones
  'milestone.daysOfGratitude': 'أيام من الامتنان',

  // Settings - Profile
  'profile.yourName': 'اسمك',
  'profile.changePhoto': 'تغيير الصورة',
  'profile.profilePhoto': 'صورة الملف الشخصي',
  'profile.wouldYouLikeToUpdateOrRemoveYourProfilePhoto':
    'هل تريد تحديث أو إزالة صورة ملفك الشخصي؟',
  'profile.updatePhoto': 'تحديث الصورة',
  'profile.removePhoto': 'إزالة الصورة',

  // Settings
  'settings.language': 'اللغة',
  'settings.selectLanguage': 'اختر اللغة',
  'settings.deviceDefault': 'افتراضي الجهاز',
  'settings.restartRequired': 'إعادة التشغيل مطلوبة',
  'settings.languageChangeRequiresAppRestartProceed':
    'يتطلب تغيير اللغة إعادة تشغيل تاكبوك. هل تريد المتابعة؟',
  'settings.proceed': 'متابعة',
  'settings.reloadApp': 'إعادة تحميل التطبيق',

  // Settings - Notifications
  'notifications.notifications': 'الإشعارات',
  'notifications.dailyReminder': 'التذكير اليومي',
  'notifications.dailyReminderNotificationsAreOn': 'إشعارات التذكير اليومية مفعلة',
  'notifications.dailyReminderNotificationsAreOff': 'إشعارات التذكير اليومية معطلة',
  'notifications.adjustReminderTime': 'ضبط وقت التذكير',
  'notifications.changeYourDailyReminderTime': 'غيّر وقت التذكير اليومي',
  'notifications.failedToUpdateReminder': 'فشل تحديث التذكير',
  'notifications.notificationPermissionNeeded': 'مطلوب إذن الإشعارات',
  'notifications.toGetDailyRemindersAllowNotificationsForTackbokInYour':
    'للحصول على تذكيرات يومية، اسمح بالإشعارات لتطبيق Tackbok من إعدادات جهازك.',

  // Settings - Appearance
  'appearance.appearance': 'المظهر',
  'appearance.theme': 'السمة',
  'appearance.selectATheme': 'اختر سمة',
  'appearance.countThemesAndColorSchemes': '{count} سمة ونظام ألوان',
  'appearance.timelineEntryLength': 'طول سجل الجدول الزمني',
  'appearance.numberOfLinesShownInTheTimeline':
    'عدد الأسطر المعروضة في الجدول الزمني. اضغط على سجل لقراءة النص الكامل.',
  'appearance.showTimelineBorders': 'إظهار حدود الجدول الزمني',
  'appearance.showTheBordersInTheTimeline': 'إظهار الحدود في الجدول الزمني',
  'appearance.hideTheBordersInTheTimeline': 'إخفاء الحدود من الجدول الزمني',
  'appearance.dateStyle': 'نمط التاريخ',
  'appearance.dateIncludesDayOfTheWeek': 'التاريخ يتضمن يوم الأسبوع',
  'appearance.firstDayOfWeek': 'أول يوم في الأسبوع',
  'appearance.setTheFirstDayOfTheWeekInTheCalendar':
    'حدد أول يوم في الأسبوع في عرض التقويم',

  // Settings - Typography
  'typography.typography': 'الخطوط',
  'typography.titleFont': 'خط العنوان',
  'typography.chooseAFontForTitlesAndHeadings': 'اختر خطًا للعناوين والترويسات',
  'typography.default': 'افتراضي',
  'typography.themeDefault': 'افتراضي السمة',
  'typography.fontSize': 'حجم الخط',
  'typography.adjustTheSizeOfBodyText': 'ضبط حجم النص الأساسي',
  'typography.small': 'صغير',
  'typography.large': 'كبير',
  'typography.previewOfTheSelectedFont': 'معاينة الخط المحدد',
  'typography.gratitudeMakesTodayBrighter': 'الامتنان يجعل اليوم أكثر إشراقًا',

  // Settings - Journaling
  'journaling.journaling': 'الكتابة اليومية',
  'journaling.editWorksheetTemplate': 'تعديل قالب ورقة الكتابة',
  'journaling.resetToDefault': 'إعادة التعيين إلى الافتراضي',
  'journaling.journalingWorksheet': 'ورقة الكتابة اليومية',
  'journaling.startWriting': 'ابدأ الكتابة',
  'journaling.journalFocusAreas': 'مجالات التركيز في اليوميات',
  'journaling.personalizeYourJournalPrompts': 'خصّص أسئلة يومياتك.',
  'journaling.pickTheTopicsYouWantToWriteAbout': 'اختر الموضوعات التي تريد الكتابة عنها.',
  'journaling.selectAtLeast2FocusAreas': 'اختر مجالين على الأقل',
  'journaling.journalPrompts': 'أسئلة اليوميات',
  'journaling.chooseWhichPromptsToShowWhenStartingANewJournal':
    'اختر الأسئلة التي تظهر عند بدء سجل جديد.',
  'journaling.off': 'إيقاف',
  'journaling.allPrompts': 'كل الأسئلة',
  'journaling.myPrompts': 'أسئلتي',
  'journaling.builtInPrompts': 'أسئلة مدمجة',
  'journaling.focusareaSelfDesc': 'تأمل في هواياتك واهتماماتك وتجاربك وحياتك بشكل عام.',
  'journaling.focusareaLittlethingsDesc':
    'قدّر الأشياء الصغيرة والنعم اليومية التي كثيرًا ما نغفل عنها.',
  'journaling.focusareaHealthDesc': 'قدّر النعم الكثيرة لجسمك وقدراته.',
  'journaling.focusareaFamilyDesc': 'قدّر أفراد عائلتك واللحظات المشتركة معهم.',
  'journaling.focusareaFriendsDesc': 'قدّر أصدقاءك المحبين والداعمين والمتفهمين.',
  'journaling.focusareaFaithDesc': 'ركّز على تقدير إيمانك وروحانيتك وسلامك الداخلي.',

  // Settings - Security
  'security.security': 'الأمان',
  'security.lockAfter': 'القفل بعد',
  'security.timeAwayFromTheAppBeforeRequiringAnUnlock':
    'الوقت خارج التطبيق قبل طلب إلغاء القفل.',
  'security.0Seconds': '0 ثانية',
  'security.30Seconds': '30 ثانية',
  'security.1Minute': 'دقيقة واحدة',
  'security.2Minutes': 'دقيقتان',
  'security.unlockTackbok': 'فتح تاكبوك',
  'security.lockWithYourDeviceScreenLock':
    'يمكن لتاكبوك القفل باستخدام قفل شاشة جهازك — المقاييس الحيوية أو رمز PIN أو النمط أو كلمة المرور',
  'security.unlock': 'فتح القفل',
  'security.appLockUnavailable': 'قفل التطبيق غير متاح',
  'security.setUpAScreenLockPinPatternOrBiometricsIn':
    'قم أولاً بإعداد قفل الشاشة (رمز PIN أو النمط أو المقاييس الحيوية) في إعدادات جهازك.',

  // Settings - Backup & Restore
  'backup.backupRestore': 'النسخ الاحتياطي والاستعادة',
  'backup.googleDriveBackup': 'نسخ احتياطي على Google Drive',
  'backup.exportAsZip': 'تصدير بصيغة ZIP',
  'backup.allOfYourDataInAFormatThatYouCan':
    'جميع بياناتك بتنسيق يمكنك استعادته في التطبيق لاحقاً',
  'backup.importAsZip': 'استيراد من ملف ZIP',
  'backup.restoreYourDataFromAZipFile': 'استعادة بياناتك من ملف .zip',
  'backup.importFromGratitudeApp': 'استيراد من تطبيق Gratitude',
  'backup.importingFromGratitudeApp': 'جاري الاستيراد من تطبيق Gratitude',
  'backup.importDataFromAGratitudeAppZipBackup':
    'استيراد البيانات من نسخة .zip لتطبيق Gratitude',
  'backup.chooseImportMode': 'اختر وضع الاستيراد',
  'backup.howShouldThisImportHandleEntriesThatAlreadyExistIn':
    'كيف يجب أن يتعامل هذا الاستيراد مع السجلات الموجودة بالفعل في تاكبوك؟',
  'backup.skipExistingEntries': 'تخطي السجلات الحالية',
  'backup.skipExistingEntriesRecommended': 'تخطي السجلات الحالية (موصى به)',
  'backup.onlyImportEntriesWithNewNoteIds': 'استيراد السجلات بمعرفات ملاحظات جديدة فقط',
  'backup.overwriteMatchingEntries': 'استبدال السجلات المطابقة',
  'backup.replaceExistingEntriesWhenNoteIdsMatch':
    'استبدال السجلات الحالية عند تطابق معرفات الملاحظات',
  'backup.importFromPresentlyApp': 'استيراد من تطبيق Presently',
  'backup.restoreYourDataFromAPresentlyCsvFile':
    'استعادة بياناتك من ملف .csv لتطبيق Presently',
  'backup.importFromPresently': 'استيراد من Presently؟',
  'backup.thisWillImportEntriesFromAPresentlyAppCsvFile':
    'سيتم استيراد السجلات من ملف CSV لتطبيق Presently. سيتم تخطي السجلات المكررة.',
  'backup.backupExportedSuccessfully': 'تم تصدير النسخة الاحتياطية بنجاح',
  'backup.exportFailed': 'فشل التصدير',
  'backup.importFailed': 'فشل الاستيراد',
  'backup.restoringTackbokBackup': 'جاري استعادة النسخة الاحتياطية لتاكبوك',
  'backup.loadPresentlyExport': 'تحميل تصدير Presently',
  'backup.importJournalEntries': 'استيراد سجلات اليوميات',
  'backup.openBackupFile': 'فتح ملف النسخة الاحتياطية',
  'backup.validateBackupContents': 'التحقق من محتويات النسخة الاحتياطية',
  'backup.restoreProfile': 'استعادة الملف الشخصي',
  'backup.importTagsAndPrompts': 'استيراد الوسوم والأسئلة',
  'backup.restoreEntriesAndMedia': 'استعادة السجلات والوسائط',
  'backup.refreshJournalData': 'تحديث بيانات اليوميات',
  'backup.loadingTheSelectedImportFile': 'جاري تحميل ملف الاستيراد المحدد.',
  'backup.checkingBackupContentsAndFileStructure':
    'جاري التحقق من محتويات ملف النسخ الاحتياطي وهيكله.',
  'backup.restoringProfileDetailsAndProfilePhotoIfAvailable':
    'جاري استعادة تفاصيل الملف الشخصي وصورة الملف الشخصي إن وجدت.',
  'backup.addingTagsAndPromptsBeforeEntriesAreRestored':
    'جاري إضافة الوسوم والأسئلة قبل استعادة السجلات.',
  'backup.processingProcessedOfTotalJournalEntriesAndAttachedMedia':
    'جاري معالجة {processed} من {total} من سجلات اليوميات والوسائط المرفقة.',
  'backup.noJournalEntriesFoundInThisBackup':
    'لم يتم العثور على سجلات يوميات في هذه النسخة الاحتياطية.',
  'backup.refreshingYourJournalSoImportedDataAppearsEverywhere':
    'جاري تحديث يومياتك حتى تظهر البيانات المستوردة في كل مكان.',
  'backup.entriesProcessed': 'السجلات المعالجة',
  'backup.entriesSkippedDueToErrors': 'سجلات تم تخطيها بسبب أخطاء',
  'backup.pleaseDoNotCloseOrMinimizeTheAppWhileThe':
    'الرجاء عدم إغلاق التطبيق أو تصغيره أثناء تقدم عملية الاستيراد.',
  'backup.tagsAdded': 'الوسوم المضافة',
  'backup.promptsAdded': 'الأسئلة المضافة',
  'backup.photosRestored': 'الصور المستعادة',
  'backup.voiceMemosRestored': 'الملاحظات الصوتية المستعادة',
  'backup.mediaSkipped': 'الوسائط المتخطاة',
  'backup.tackbokBackupRestored': 'تمت استعادة النسخة الاحتياطية لتاكبوك',
  'backup.gratitudeImportComplete': 'اكتمل استيراد Gratitude',
  'backup.presentlyImportComplete': 'اكتمل استيراد Presently',
  'backup.yourJournalDataIsReadyToReviewButSomeItems':
    'بيانات يومياتك جاهزة للمراجعة، ولكن لم يتم استعادة بعض العناصر.',
  'backup.yourJournalDataIsReadyToReview': 'بيانات يومياتك جاهزة للمراجعة.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe':
    'انتهى الاستيراد مع تحذيرات. لم يتم استعادة بعض العناصر، وكل شيء آخر موجود بالفعل في تاكبوك.',
  'backup.thisImportFinishedButEverythingAlreadyExistedInTackbok':
    'انتهى الاستيراد، لكن كل شيء كان موجودًا بالفعل في تاكبوك.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe2':
    'انتهى هذا الاستيراد مع تحذيرات. لم يتم استعادة بعض العناصر.',
  'backup.thisImportFinishedSuccessfully': 'انتهى هذا الاستيراد بنجاح.',
  'backup.importedFromTackbokBackup': 'مستورد من نسخة تاكبوك الاحتياطية',
  'backup.importedFromGratitudeBackup': 'مستورد من نسخة Gratitude الاحتياطية',
  'backup.importedFromPresentlyExport': 'مستورد من تصدير Presently',
  'backup.newEntries': 'سجلات جديدة',
  'backup.updatedEntries': 'سجلات تم تحديثها',
  'backup.skippedDuplicates': 'تم تخطي المكررات',
  'backup.import': 'استيراد',

  // Settings - App Information
  'appInfo.appInformation': 'معلومات التطبيق',
  'appInfo.faq': 'الأسئلة الشائعة',
  'appInfo.readFrequentlyAskedQuestions': 'اقرأ الأسئلة الشائعة عن تاكبوك',
  'appInfo.shareTackbok': 'شارك تاكبوك',
  'appInfo.shareTheAppWithFriendsAndFamily':
    'هل تستمتع بتاكبوك؟ شارك التطبيق مع أصدقائك وعائلتك',
  'appInfo.practiceGratitudeWithTackbokASimpleFreeAndPrivateGratitude':
    'مارس الامتنان مع تاكبوك، تطبيق بسيط ومجاني وخاص لتدوين الامتنان',
  'appInfo.supportTackbok': 'ادعم تاكبوك',
  'appInfo.tackbokIsFreeToUseAndThatsNotChangingIf':
    'تاكبوك مجاني للاستخدام، وهذا لن يتغير. إذا أضاف قليلًا من الامتنان إلى يومك، فيمكنك دعم التطبيق، لكن لا توجد ميزات لفتحها. الجميع يحصل على التطبيق نفسه.',
  'appInfo.keepingTackbokRunningCurrentlyCostsAboutUs3325Per':
    'تبلغ تكلفة تشغيل تاكبوك حاليًا نحو 33.25 دولارًا أمريكيًا شهريًا، قبل الضرائب والرسوم وتكاليف الاستخدام الإضافي. إذا وجدت فيه فائدة، فحتى المساهمة الصغيرة تساعد على إبقائه مجانيًا للجميع.',
  'appInfo.waysToSupport': 'طرق الدعم',
  'appInfo.free': 'مجاني',
  'appInfo.smallThanks': 'شكر صغير',
  'appInfo.helpsMeFinishWork10MinutesEarlier':
    'يمنحني 10 دقائق إضافية في نهاية يوم العمل',
  'appInfo.heartfeltThanks': 'شكر من القلب',
  'appInfo.helpsPayForHostingAndOnlineServices':
    'يساعد في دفع تكاليف الاستضافة والخدمات عبر الإنترنت',
  'appInfo.bigThanks': 'شكر كبير',
  'appInfo.helpsTestAndReleaseTackbokUpdates': 'يساعد في اختبار تحديثات تاكبوك وإصدارها',
  'appInfo.deepestThanks': 'جزيل الشكر',
  'appInfo.helpsCoverOneMonthOfTackboksRunningCostsAndOngoing':
    'يساعد في تغطية شهر من تكاليف تشغيل تاكبوك وتطويره المستمر',
  'appInfo.unavailable': 'غير متاح',
  'appInfo.supportOptionsCouldNotBeLoadedPleaseTryAgain':
    'تعذر تحميل خيارات الدعم. يرجى المحاولة مرة أخرى.',
  'appInfo.youAppearToBeOfflineCheckYourConnectionAndTry':
    'يبدو أنك غير متصل بالإنترنت. تحقق من اتصالك وحاول مرة أخرى.',
  'appInfo.thePurchaseCouldNotBeCompletedPleaseTryAgain':
    'تعذر إكمال عملية الشراء. يرجى المحاولة مرة أخرى.',
  'appInfo.paymentSuccessful': 'تم الدفع بنجاح',
  'appInfo.thankYou': 'شكرًا لك!',
  'appInfo.yourSupportHelpsKeepTackbokFreeAndIndependentItGenuinely':
    'يساعد دعمك على إبقاء تاكبوك مجانيًا ومستقلًا. إنه يعني لنا الكثير حقًا.',
  'appInfo.thankYouForSupportingTackbokItGenuinelyMeansALot':
    'شكرًا لدعم تاكبوك. هذا يعني لنا الكثير حقًا.',
  'appInfo.yourPaymentIsPendingTheStoreWillFinishItWhen':
    'دفعتك معلقة. سيكملها المتجر عند اكتمال الموافقة أو الدفع.',
  'appInfo.whereYourSupportHelps': 'أين يساعد دعمك',
  'appInfo.cloudflareWorkers': 'Cloudflare Workers',
  'appInfo.expoEas': 'Expo EAS',
  'appInfo.appleDeveloperMembership': 'عضوية Apple Developer',
  'appInfo.tackbokOrgDomain': 'نطاق tackbok.org',
  'appInfo.googlePlayRegistration': 'التسجيل في Google Play',
  'appInfo.monthlyBaseline': 'التكلفة الشهرية الأساسية',
  'appInfo.us5Month': 'US$5 شهريًا',
  'appInfo.us19Month': 'US$19 شهريًا',
  'appInfo.us99Year': 'US$99 سنويًا',
  'appInfo.us12Year': 'US$12 سنويًا',
  'appInfo.us25OneTime': 'US$25 لمرة واحدة',
  'appInfo.aboutUs3325': 'نحو US$33.25',
  'appInfo.rateTackbok': 'قيّم تاكبوك',
  'appInfo.leaveAnHonestRatingInTheAppStore': 'اترك تقييمًا صادقًا في متجر التطبيقات',
  'appInfo.unableToOpenTheStore': 'تعذر فتح المتجر',
  'appInfo.confirmTier': 'تأكيد {tier}',
  'appInfo.theStoreWillChargePriceForThisVoluntaryOneTime':
    'سيخصم المتجر {price} مقابل هذا الدعم الاختياري لمرة واحدة. لا يفتح أي ميزات ويمكن شراؤه مرة أخرى.',
  'appInfo.privacyPolicy': 'سياسة الخصوصية',
  'appInfo.readOurPrivacyPolicy': 'اقرأ سياسة خصوصية تاكبوك',
  'appInfo.termsConditions': 'الشروط والأحكام',
  'appInfo.readOurTermsAndConditions': 'اقرأ الشروط والأحكام',
  'appInfo.analytics': 'جمع بيانات التحليلات',
  'appInfo.collectingAnonymizedAnalyticsToHelpDiagnoseProblems':
    'يقوم تاكبوك بجمع معلومات تحليلية مجهولة للمساعدة في تشخيص المشاكل ومراقبة الاتجاهات',
  'appInfo.checkForUpdates': 'التحقق من التحديثات',
  'appInfo.checkingForUpdates': 'جارٍ التحقق من التحديثات…',
  'appInfo.lastCheckedTime': 'آخر تحقق: {time}',
  'appInfo.never': 'أبدًا',
  'appInfo.restart': 'إعادة التشغيل',
  'appInfo.restartToApply': 'أعد التشغيل للتطبيق',
  'appInfo.updateDownloadedRestartToApplyIt': 'تم تنزيل التحديث. أعد التشغيل لتطبيقه.',
  'appInfo.youAlreadyHaveTheLatestVersion': 'لديك أحدث إصدار بالفعل',
  'appInfo.unableToUpdate': 'تعذّر التحديث',
  'appInfo.version': 'رقم الإصدار',

  // Settings - Danger Zone
  'dangerZone.dangerZone': 'منطقة الخطر',
  'dangerZone.deleteAllData': 'حذف جميع البيانات',
  'dangerZone.deleteAllData2': 'هل تريد حذف جميع البيانات؟',
  'dangerZone.permanentlyDeleteAllYourAppData': 'حذف جميع بيانات التطبيق نهائيًا',
  'dangerZone.thisActionCannotBeUndoneAllYourAppDataWill':
    'لا يمكن التراجع عن هذا الإجراء. سيتم حذف جميع بيانات تطبيقك نهائيًا.',
  'dangerZone.allDataDeleted': 'تم حذف جميع البيانات',
  'dangerZone.allDataDeletedButSomeMediaFilesCouldNotBe':
    'تم حذف جميع البيانات، ولكن تعذر إزالة بعض ملفات الوسائط.',
  'dangerZone.deleteFailed': 'فشل الحذف',

  // Time Picker
  'time.selectTime': 'حدد الوقت',

  // Date Picker
  'calendar.today': 'اليوم',
  'calendar.yesterday': 'أمس',
  'calendar.previousMonth': 'الشهر السابق',
  'calendar.nextMonth': 'الشهر التالي',
  'calendar.selectMonth': 'اختر الشهر',
  'calendar.selectYear': 'اختر السنة',
  'calendar.random': 'عشوائي',
  'calendar.openARandomEntry': 'افتح مدخلًا عشوائيًا',
  'calendar.sun': 'أحد',
  'calendar.mon': 'إثنين',
  'calendar.tue': 'ثلاثاء',
  'calendar.wed': 'أربعاء',
  'calendar.thu': 'خميس',
  'calendar.fri': 'جمعة',
  'calendar.sat': 'سبت',
  'calendar.sunday': 'الأحد',
  'calendar.monday': 'الاثنين',
  'calendar.tuesday': 'الثلاثاء',
  'calendar.wednesday': 'الأربعاء',
  'calendar.thursday': 'الخميس',
  'calendar.friday': 'الجمعة',
  'calendar.saturday': 'السبت',
  'calendar.january': 'يناير',
  'calendar.february': 'فبراير',
  'calendar.march': 'مارس',
  'calendar.april': 'أبريل',
  'calendar.may': 'مايو',
  'calendar.june': 'يونيو',
  'calendar.july': 'يوليو',
  'calendar.august': 'أغسطس',
  'calendar.september': 'سبتمبر',
  'calendar.october': 'أكتوبر',
  'calendar.november': 'نوفمبر',
  'calendar.december': 'ديسمبر',
  'calendar.jan': 'يناير',
  'calendar.feb': 'فبراير',
  'calendar.mar': 'مارس',
  'calendar.apr': 'أبريل',
  'calendar.may2': 'مايو',
  'calendar.jun': 'يونيو',
  'calendar.jul': 'يوليو',
  'calendar.aug': 'أغسطس',
  'calendar.sep': 'سبتمبر',
  'calendar.oct': 'أكتوبر',
  'calendar.nov': 'نوفمبر',
  'calendar.dec': 'ديسمبر',

  // Onboarding
  'onboarding.skip': 'تخطي',
  'onboarding.continue': 'متابعة',
  'onboarding.next': 'التالي',
  'onboarding.stepCurrentOfTotal': 'الخطوة {current} من {total}',
  'onboarding.getStarted': 'ابدأ الآن',
  'onboarding.alreadyHaveAJournalImportIt': 'هل لديك يوميّات بالفعل؟ استوردها',
  'onboarding.aPrivatePlaceForYourGratitudeFreeOfflineYours':
    'مكان خاص لامتنانك — مجاني، ويعمل دون إنترنت، وملكك وحدك.',
  'onboarding.importYourJournal': 'استيراد يوميّاتك',
  'onboarding.whereIsYourJournalComingFrom': 'من أين تأتي يوميّاتك؟',
  'onboarding.tackbokBackup': 'نسخة Tackbok الاحتياطية',
  'onboarding.gratitudeApp': 'تطبيق Gratitude',
  'onboarding.presentlyApp': 'تطبيق Presently',
  'onboarding.whatShouldWeCallYou': 'بماذا نناديك؟',
  'onboarding.yourNameIsOnlyUsedToGreetYouInsideThe':
    'يُستخدم اسمك فقط للترحيب بك داخل التطبيق.',
  'onboarding.yourNameOptional': 'اسمك (اختياري)',
  'onboarding.staysOnYourDevice': 'يبقى على جهازك.',
  'onboarding.makeItYours': 'اجعله يناسبك',
  'onboarding.pickALookYouCanChangeEverythingLaterInSettings':
    'اختر مظهرًا — يمكنك تغيير كل شيء لاحقًا من الإعدادات.',
  'onboarding.aWalkInTheMorningSun': 'نزهة تحت شمس الصباح',
  'onboarding.gratefulForQuietStreetsWarmCoffeeAndASkyFull':
    'ممتن للشوارع الهادئة، والقهوة الدافئة، وسماء مليئة بالألوان.',
  'onboarding.moreThemes': 'مزيد من السمات…',
  'onboarding.whatDoYouWantToBeMoreGratefulFor': 'ما الذي تريد أن تكون أكثر امتنانًا له؟',
  'onboarding.wellSuggestWritingPromptsFromTheAreasYouPick':
    'سنقترح عليك أفكارًا للكتابة من المجالات التي تختارها.',
  'onboarding.pickAtLeastCount': 'اختر {count} على الأقل',
  'onboarding.helpImproveTackbok': 'هل تودّ المساعدة في تحسين Tackbok؟',
  'onboarding.tackbokIsFreeAndOpenSourceAnonymousStatsHelpUs':
    'تطبيق Tackbok مجاني ومفتوح المصدر. تساعدنا الإحصاءات المجهولة في اكتشاف الأخطاء ومعرفة الميزات المهمة.',
  'onboarding.anonymousUsageStatsOnlyIncludingWhichScreensAndFeaturesGet':
    'إحصاءات استخدام مجهولة فقط — أي الشاشات والميزات تُستخدم.',
  'onboarding.neverYourJournalContentPhotosVoiceMemosOrAnythingYou':
    'لن نجمع أبدًا محتوى يوميّاتك أو صورك أو مذكّراتك الصوتية أو أي شيء تكتبه.',
  'onboarding.openSourceTheExactEventListIsPublicInThe':
    'مفتوح المصدر — قائمة الأحداث الكاملة متاحة للجميع في المستودع.',
  'onboarding.seeExactlyWhatWeCollect': 'اطّلع بالضبط على ما نجمعه',
  'onboarding.shareAnonymousStats': 'مشاركة إحصاءات مجهولة',
  'onboarding.noThanks': 'لا، شكرًا',
  'onboarding.whatWeCollect': 'ما الذي نجمعه',
  'onboarding.withYourPermissionTackbokRecordsLimitedAnonymousUsageInformationThis':
    'بإذنك، يسجّل Tackbok معلومات استخدام محدودة ومجهولة الهوية. قد تشمل الشاشات التي تمت زيارتها والميزات المستخدمة وما إذا كانت العمليات الاختيارية قد نجحت. ولا تشمل أبدًا محتوى يومياتك أو أي شيء تكتبه.',
  'onboarding.auditTheAnalyticsCodeOnGithub': 'راجع رمز التحليلات على GitHub',
  'onboarding.neverCollected': 'لا يُجمع أبدًا',
  'onboarding.yourJournalTextTitlesPhotosVoiceMemosTagsNameEmail':
    'نص يوميّاتك أو العناوين أو الصور أو المذكّرات الصوتية أو الوسوم أو الاسم أو البريد الإلكتروني أو أي شيء تكتبه. لا إعلانات، ولا بيع للبيانات، ولا تتبّع من أطراف خارجية.',
  'onboarding.youreAllSetName': 'كل شيء جاهز يا {name}!',
  'onboarding.youreAllSet': 'كل شيء جاهز!',
  'onboarding.twoLastThingsYouCanTurnOnBothAreOptional':
    'أمران أخيران يمكنك تفعيلهما — كلاهما اختياري.',
  'onboarding.addExampleEntries': 'إضافة مدخلات تجريبية',
  'onboarding.aFewSampleEntriesShowHowPhotosVoiceMemosMoods':
    'بضع مدخلات تجريبية تُظهر كيفية عمل الصور والمذكّرات الصوتية والحالات المزاجية والوسوم. يمكنك إزالتها في أي وقت بضغطة واحدة.',
  'onboarding.remindMeDaily': 'ذكّرني يوميًا',
  'onboarding.aGentleNudgeToWriteNeverYourJournalContent':
    'تنبيه لطيف للكتابة — دون محتوى يوميّاتك أبدًا.',
  'onboarding.remindMeAtTime': 'ذكّرني في {time}',
  'onboarding.settingThingsUp': 'جارٍ التجهيز…',
  'onboarding.startJournaling': 'ابدأ التدوين',
  'onboarding.showingExampleEntries': 'تُعرض مدخلات تجريبية',
  'onboarding.removeAll': 'إزالة الكل',
  'onboarding.hideThisBanner': 'إخفاء هذا الشريط',
  'onboarding.exampleEntriesRemoved': 'تمت إزالة السجلات التجريبية',
  'onboarding.failedToRemoveExampleEntries': 'تعذّرت إزالة السجلات التجريبية',
  'onboarding.addTodaysEntryHere': 'أضف مدخل اليوم من هنا.',
  'onboarding.pressAndHoldThenDragToMoveTheseButtonsAlong':
    'اضغط مطولاً ثم اسحب لتحريك هذه الأزرار على طول الحافة.',
  'onboarding.tapAnEntryToViewOrEditIt': 'اضغط على أي مدخل لعرضه أو تعديله.',
  'onboarding.findMemoriesByTextOrTag': 'ابحث عن الذكريات بالنص أو الوسم.',
  'onboarding.replayOnboarding': 'إعادة تشغيل جولة الترحيب',
  'onboarding.runTheWelcomeSetupAgain': 'تشغيل إعداد الترحيب مرة أخرى',
  'onboarding.replayOnboarding2': 'إعادة تشغيل جولة الترحيب؟',
  'onboarding.theWelcomeSetupWillStartAgainYourJournalEntriesAnd':
    'سيبدأ إعداد الترحيب من جديد. ستبقى مدخلات يوميّاتك وإعداداتك كما هي.',
  'onboarding.replay': 'إعادة التشغيل',

  // Onboarding sample entries (seeded content)
  sample_tag_family: 'العائلة',
  sample_tag_littleThings: 'الأشياء الصغيرة',
  sample_entry_welcome_title: 'مرحبًا بك في Tackbok 👋',
  sample_entry_welcome_body:
    'هذا دفتر امتنانك — مكان للحظات الجميلة. اضغط على زر + لكتابة سطر واحد أو صفحة كاملة، مرة في اليوم أو متى شئت. اضغط على هذه البطاقة لرؤية السجل كاملًا.',
  sample_entry_photos_title: 'لحظات صغيرة',
  sample_entry_photos_body: 'يمكنك إرفاق الصور بأي ذكرى — اضغط على صورة لتكبيرها.',
  sample_entry_voice_title: 'بكلماتي الخاصة',
  sample_entry_voice_body:
    'أحيانًا يكون قولها أسهل. اضغط على التشغيل لسماع مذكّرة صوتية قصيرة.',
  sample_entry_tags_body:
    'يجيب هذا السجل عن أحد أسئلة الكتابة ويحمل وسمين. جرّب البحث في الأعلى وصفِّ النتائج حسب الوسم للعثور عليه مجددًا.',

  // Insights
  'insights.insights': 'الإحصاءات',
  'insights.overview': 'نظرة عامة',
  'insights.gratitudeScore': 'مؤشر الامتنان',
  'insights.currentStreak': 'السلسلة الحالية',
  'insights.longestStreak': 'أطول سلسلة',
  'insights.daysJournaled': 'أيام التدوين',
  'insights.consistency': 'المواظبة',
  'insights.entries': 'السجلات',
  'insights.less': 'أقل',
  'insights.more': 'أكثر',
  'insights.yourHappiestDayIsWeekday': 'أسعد أيامك هو {weekday}',
  'insights.moodOverTime': 'المزاج بمرور الوقت',
  'insights.writingHabits': 'عادات الكتابة',
  'insights.morning': 'صباحًا',
  'insights.afternoon': 'ظهرًا',
  'insights.evening': 'مساءً',
  'insights.night': 'ليلًا',
  'insights.youreAMorningWriter': 'تفضّل الكتابة صباحًا',
  'insights.youreAnAfternoonWriter': 'تفضّل الكتابة ظهرًا',
  'insights.youreAnEveningWriter': 'تفضّل الكتابة مساءً',
  'insights.youreANightWriter': 'تفضّل الكتابة ليلًا',
  'insights.entriesPerMonth': 'السجلات شهريًا',
  'insights.topTags': 'أكثر الوسوم استخدامًا',
  'insights.totals': 'الإجماليات',
  'insights.words': 'الكلمات',
  'insights.characters': 'الأحرف',
  'insights.photos': 'الصور',
  'insights.voiceMemos': 'الملاحظات الصوتية',
  'insights.yourMemories': 'ذكرياتك',
  'insights.onThisDay': 'في مثل هذا اليوم',
  'insights.oneYearAgoToday': 'قبل عام في مثل هذا اليوم',
  'insights.oneMonthAgoToday': 'قبل شهر في مثل هذا اليوم',
  'insights.countYearsAgoToday': 'قبل {count} أعوام في مثل هذا اليوم',
  'insights.aMomentFromThisDay': 'لحظة من هذا اليوم',
  'insights.noInsightsYet': 'لا إحصاءات بعد',
  'insights.writeAFewEntriesAndYourStatsWillShowUp':
    'اكتب بعض السجلات وستظهر إحصاءاتك هنا.',

  // المشاركة والإنجازات
  'sharing.shareYourGratitude': 'شارك امتنانك',
  'sharing.iWasGratefulFor': 'كنت ممتنًا لـ',
  'sharing.shareImage': 'مشاركة الصورة',
  'sharing.shareEntry': 'مشاركة السجل',
  'sharing.includeMood': 'تضمين الحالة المزاجية',
  'sharing.moodIsHiddenUnlessYouIncludeIt': 'تظل الحالة المزاجية مخفية ما لم تضمّنها',
  'sharing.includePhotos': 'تضمين الصور',
  'sharing.upToTheFirstFivePhotosWillBeShared': 'ستتم مشاركة أول خمس صور كحد أقصى',
  'sharing.chooseAStyle': 'اختر نمطًا',
  'sharing.sharingIsNotAvailableOnThisDevice': 'المشاركة غير متاحة على هذا الجهاز',
  'sharing.couldNotShareImagePleaseTryAgain':
    'تعذرت مشاركة الصورة. يرجى المحاولة مرة أخرى.',
  'sharing.themeTheme': 'سمة {theme}',
  'sharing.themeThemeSelected': 'سمة {theme}، محددة',
  'sharing.dayOneComplete': 'اكتمل اليوم الأول!',
  'sharing.aBeautifulBeginningKeepNoticingTheGood':
    'بداية جميلة. واصل ملاحظة الأشياء الجيدة.',
  'sharing.countDaysOfGratitude': '{count} يومًا من الامتنان!',
  'sharing.congratulationsOnMakingGratitudePartOfYourJourney':
    'تهانينا لجعل الامتنان جزءًا من رحلتك.',
  'sharing.shareAchievement': 'مشاركة الإنجاز',
  'sharing.openCountDayAchievement': 'فتح إنجاز {count} يومًا',

  // Date Format Patterns (placeholders: {weekday}, {month}, {day}, {year})
  'dateFormat.timeLabel': '{weekday} في {time}',

  // Cloud Backup & Sync
  'cloud.attentionNeeded': 'يلزم الانتباه',
  'cloud.backUpAndSyncYourJournalWithYourOwnGoogle':
    'انسخ يومياتك وامنحها المزامنة عبر Google Drive الخاص بك. لن يتم إنشاء حساب Tackbok.',
  'cloud.backupFromDate': 'نسخة احتياطية من {date}',
  'cloud.beforeYouConnect': 'قبل الاتصال',
  'cloud.checkingGoogleDriveForChanges': 'جارٍ التحقق من التغييرات في Google Drive',
  'cloud.chooseABackupToMergeWithThisJournalBothSides':
    'اختر نسخة احتياطية لدمجها مع هذه اليوميات. سيتم الاحتفاظ بالجانبين.',
  'cloud.chooseABackupToRestoreOnThisDevice':
    'اختر نسخة احتياطية لاستعادتها على هذا الجهاز.',
  'cloud.chooseWhichCopiesOfYourJournalToRemove': 'اختر نسخ يومياتك التي تريد إزالتها.',
  'cloud.cloudBackupSync': 'النسخ الاحتياطي والمزامنة السحابية',
  'cloud.cloudBackupConnected': 'تم ربط النسخة الاحتياطية السحابية',
  'cloud.cloudBackupCouldNotBeUpdated': 'تعذر تحديث النسخة الاحتياطية السحابية',
  'cloud.cloudBackupDeleted': 'تم حذف النسخة الاحتياطية السحابية',
  'cloud.cloudBackupDeletionReceived': 'تم استلام طلب حذف النسخة السحابية',
  'cloud.cloudBackupNumber': 'النسخة السحابية {number}',
  'cloud.backupsAreEncryptedInTransitAndAtRestByGoogle':
    'يشفّر Google Drive النسخ الاحتياطية أثناء النقل وأثناء التخزين، لكنها ليست مشفّرة من طرف إلى طرف.',
  'cloud.cloudRestoreStarted': 'بدأت الاستعادة من السحابة',
  'cloud.cloudSyncAttentionNeeded': 'المزامنة السحابية: يلزم الانتباه',
  'cloud.cloudSyncChangesSafelyQueued':
    'المزامنة السحابية: التغييرات في قائمة انتظار آمنة',
  'cloud.cloudSyncPaused': 'المزامنة السحابية: متوقفة مؤقتًا',
  'cloud.cloudSyncSyncing': 'المزامنة السحابية: جارٍ المزامنة',
  'cloud.cloudSyncUpToDate': 'المزامنة السحابية: محدّثة',
  'cloud.connectGoogleDrive': 'الاتصال بـ Google Drive',
  'cloud.connecting': 'جارٍ الاتصال…',
  'cloud.createCloudBackup': 'إنشاء نسخة احتياطية سحابية',
  'cloud.deleteCloudAndLocalJournalData': 'حذف بيانات اليوميات السحابية والمحلية',
  'cloud.deleteCloudBackup': 'حذف النسخة الاحتياطية السحابية',
  'cloud.deleteCloudBackup2': 'هل تريد حذف النسخة الاحتياطية السحابية؟',
  'cloud.deleteJournalEverywhere': 'حذف اليوميات في كل مكان',
  'cloud.deleteJournalEverywhere2': 'هل تريد حذف اليوميات في كل مكان؟',
  'cloud.deleteOrResetData': 'حذف البيانات أو إعادة ضبطها',
  'cloud.deletingJournalEverywhere': 'جارٍ حذف اليوميات من كل مكان…',
  'cloud.removingTheCloudBackupAndJournalDataKeepTackbokOpen':
    'جارٍ حذف النسخة الاحتياطية السحابية وبيانات اليوميات. أبقِ Tackbok مفتوحًا.',
  'cloud.disconnect': 'قطع الاتصال',
  'cloud.disconnectProvider': 'قطع الاتصال بـ {provider}',
  'cloud.disconnectProviderFromThisDevice': 'هل تريد قطع اتصال {provider} بهذا الجهاز؟',
  'cloud.disconnectThenDeleteLocalJournalDataOnly':
    'قطع الاتصال ثم حذف بيانات اليوميات المحلية فقط',
  'cloud.editsRemainSafelyQueuedOnThisDevice':
    'ستبقى التعديلات في قائمة انتظار آمنة على هذا الجهاز.',
  'cloud.entry': 'سجل',
  'cloud.googleDrive': 'Google Drive',
  'cloud.googleDriveAccessIsRequiredTryAgainAndSelectThe':
    'يلزم السماح بالوصول إلى Google Drive. حاول مرة أخرى وحدد مربع اختيار الوصول إلى Drive.',
  'cloud.googleDriveConnected': 'تم الاتصال بـ Google Drive',
  'cloud.googleDriveConnectionWasNotCompleted': 'لم يكتمل الاتصال بـ Google Drive',
  'cloud.googleDriveCouldNotBeReachedYourChangesRemainSafely':
    'تعذر الوصول إلى Google Drive. ستظل تغييراتك في قائمة الانتظار بأمان.',
  'cloud.photosAndVoiceMemosAreWaitingForWiFiYour':
    'تنتظر الصور والملاحظات الصوتية شبكة Wi-Fi. ستظل تغييراتك في قائمة الانتظار بأمان.',
  'cloud.googleDriveDisconnectedOnThisDevice': 'تم قطع اتصال Google Drive على هذا الجهاز',
  'cloud.googleDriveIsBusyTryAgainShortly': 'Google Drive مشغول. حاول مرة أخرى بعد قليل.',
  'cloud.googleDriveNeedsToBeReconnected': 'يلزم إعادة الاتصال بـ Google Drive.',
  'cloud.googleDriveReconnected': 'تمت إعادة الاتصال بـ Google Drive',
  'cloud.googleDriveStorageIsFull': 'مساحة تخزين Google Drive ممتلئة.',
  'cloud.googleDriveStatus': 'Google Drive — {status}',
  'cloud.ifGoogleShowsADriveAccessCheckboxSelectItBackup':
    'إذا عرضت Google مربع اختيار للوصول إلى Drive، فحدده. لا يمكن توصيل النسخ الاحتياطي من دون هذا الإذن.',
  'cloud.journalDeletionReceived': 'تم استلام حذف اليوميات',
  'cloud.journalTextStillSyncsOnMobileData':
    'تستمر مزامنة نص اليوميات عبر بيانات الهاتف.',
  'cloud.keepLocalDataAndTheCloudCopy': 'الاحتفاظ بالبيانات المحلية والنسخة السحابية',
  'cloud.keepLocalJournalData': 'الاحتفاظ ببيانات اليوميات المحلية',
  'cloud.keepTheCloudCopyAndOtherDevices': 'الاحتفاظ بالنسخة السحابية والأجهزة الأخرى',
  'cloud.lastSuccessfulSyncDate': 'آخر مزامنة ناجحة: {date}',
  'cloud.localDataAndTheCloudBackupWillBothRemainOther':
    'ستبقى البيانات المحلية والنسخة السحابية. وستظل الأجهزة الأخرى متصلة.',
  'cloud.markAsReviewed': 'وضع علامة تمت المراجعة',
  'cloud.mergingChangesAndUpdatingGoogleDrive': 'جارٍ دمج التغييرات وتحديث Google Drive',
  'cloud.noTackbokBackupFoundInThisGoogleAccount':
    'لم يتم العثور على نسخة Tackbok احتياطية في حساب Google هذا',
  'cloud.noInternetConnectionYourChangesRemainSafelyQueued':
    'لا يوجد اتصال بالإنترنت. ستظل تغييراتك في قائمة الانتظار بأمان.',
  'cloud.noExistingTackbokBackupWasFoundCreateOneForThis':
    'لم يتم العثور على نسخة Tackbok احتياطية. أنشئ نسخة لهذه اليوميات.',
  'cloud.optionalCloudBackup': 'نسخ احتياطي سحابي اختياري',
  'cloud.pauseSync': 'إيقاف المزامنة مؤقتًا',
  'cloud.preparingJournalChanges': 'جارٍ تحضير تغييرات اليوميات',
  'cloud.preparingRestoredJournalData': 'جارٍ تحضير بيانات اليوميات المستعادة',
  'cloud.profile': 'الملف الشخصي',
  'cloud.prompt': 'موجّه الكتابة',
  'cloud.reconnectGoogleDrive': 'إعادة الاتصال بـ Google Drive',
  'cloud.recoveredConflicts': 'تعارضات تم استردادها',
  'cloud.recoveredConflictsMarkedAsReviewed':
    'تم وضع علامة المراجعة على التعارضات المستردة',
  'cloud.recoveredTypeConflictCountPreservedAlternatives':
    'تم استرداد تعارض {type} — تم الاحتفاظ بـ {count} بدائل',
  'cloud.resetThisDeviceOnly': 'إعادة ضبط هذا الجهاز فقط',
  'cloud.resetThisDeviceOnly2': 'هل تريد إعادة ضبط هذا الجهاز فقط؟',
  'cloud.merge': 'دمج',
  'cloud.restoreCloudBackup': 'استعادة النسخة السحابية',
  'cloud.restoreFromYourCloudBackup': 'الاستعادة من نسختك الاحتياطية السحابية',
  'cloud.restoring': 'جارٍ الاستعادة…',
  'cloud.safelyQueued': 'في قائمة انتظار آمنة',
  'cloud.savingSyncedJournalDataOnThisDevice':
    'جارٍ حفظ بيانات اليوميات المتزامنة على هذا الجهاز',
  'cloud.setupElapsedSeconds': 'الوقت المنقضي: {seconds} ث',
  'cloud.setupProgressHelp':
    'يربط Tackbok هذا الجهاز ويبدأ المزامنة الأولى. قد تستغرق النسخ الاحتياطية الكبيرة والصور والملاحظات الصوتية وقتًا أطول.',
  'cloud.setupTakingLonger':
    'يستغرق هذا وقتًا أطول من المعتاد. تحقق من اتصالك بالإنترنت وأبقِ Tackbok مفتوحًا ليتمكن من المتابعة.',
  'cloud.settingUpCloudSync': 'جارٍ إعداد المزامنة السحابية…',
  'cloud.stepCurrentOfTotalInThisBatch': 'الخطوة {current} من {total} في هذه الدفعة',
  'cloud.syncCompleted': 'اكتملت المزامنة',
  'cloud.syncNow': 'المزامنة الآن',
  'cloud.syncPaused': 'تم إيقاف المزامنة مؤقتًا',
  'cloud.syncResumed': 'تم استئناف المزامنة',
  'cloud.syncRunsInSafeBatchesYouCanKeepUsingTackbok':
    'تعمل المزامنة على دفعات آمنة. يمكنك متابعة استخدام Tackbok.',
  'cloud.syncMediaOnWiFiOnly': 'مزامنة الوسائط عبر Wi-Fi فقط',
  'cloud.syncing': 'جارٍ المزامنة…',
  'cloud.theCloudCopyAndThisDevicesJournalWillBePermanently':
    'سيتم حذف النسخة السحابية ويوميات هذا الجهاز نهائيًا. ستحذف الأجهزة الأخرى يومياتها المحلية عند المزامنة.',
  'cloud.theCloudCopyWillBePermanentlyDeletedAfterVerificationLocal':
    'سيتم حذف النسخة السحابية نهائيًا بعد التحقق. ستبقى بيانات اليوميات المحلية.',
  'cloud.thisCloudBackupWasDeletedLocalJournalDataRemainsOn':
    'تم حذف هذه النسخة السحابية. ستبقى بيانات اليوميات المحلية على هذا الجهاز.',
  'cloud.thisCloudBackupContainsDataTackbokCannotRead':
    'تحتوي هذه النسخة الاحتياطية السحابية على بيانات لا يستطيع Tackbok قراءتها.',
  'cloud.finishDeletingThisJournal': 'هل تريد إكمال حذف هذه اليوميات؟',
  'cloud.cloudDeletionIsAlreadyRecordedEraseTheRemainingJournalData':
    'تم تسجيل الحذف من السحابة بالفعل. امسح بيانات اليوميات المتبقية من هذا الجهاز.',
  'cloud.finishDeletion': 'إكمال الحذف',
  'cloud.yourGoogleEmailIsStoredSecurelyOnThisDeviceTo':
    'يُخزَّن بريدك الإلكتروني في Google بأمان على هذا الجهاز لتحديد الحساب المتصل، ويُحذف عند قطع الاتصال. ولا يتم تضمينه مطلقًا في النسخ الاحتياطية أو السجلات أو بيانات التشخيص أو التحليلات.',
  'cloud.thisDeviceDisconnectsFirstThenDeletesItsLocalJournalThe':
    'سيقطع هذا الجهاز الاتصال أولًا ثم يحذف يومياته المحلية. ستبقى النسخة السحابية والأجهزة الأخرى.',
  'cloud.thisDeviceWasReset': 'تمت إعادة ضبط هذا الجهاز',
  'cloud.thisJournalWasDeletedEverywhereThisDeviceIsDisconnected':
    'تم حذف هذه اليوميات في كل مكان. هذا الجهاز غير متصل.',
  'cloud.upToDate': 'محدّث',
  'cloud.verifyBackupHealth': 'التحقق من سلامة النسخة الاحتياطية',
  'cloud.waitingForTheFirstSuccessfulSync': 'في انتظار أول مزامنة ناجحة',
  'cloud.youCanLeaveThisScreenSyncingResumesWhenTackbokIs':
    'يمكنك مغادرة هذه الشاشة؛ تستأنف المزامنة عندما يكون Tackbok نشطًا.',
  'cloud.yourJournalStaysOnYourDeviceCloudBackupIsOptional':
    'تبقى يومياتك على جهازك — مع نسخ احتياطي سحابي اختياري.',
  'cloud.countChangesSafelyQueued': '{count} تغييرات في قائمة انتظار آمنة',
  'cloud.countChangesRemaining': 'متبقٍ {count} تغييرات',
  'cloud.googleDriveAuthorizationNeedsAttention': 'يحتاج تفويض Google Drive إلى تدخل.',
  'cloud.thisBackupBelongsToADifferentConnectedGoogleAccount':
    'تنتمي هذه النسخة الاحتياطية إلى حساب Google آخر متصل.',
  'cloud.googleDrivePermissionWasNotFullyGranted': 'لم يُمنح إذن Google Drive بالكامل.',
  'cloud.theConnectedCloudBackupDoesNotMatchThisJournal':
    'النسخة الاحتياطية السحابية المتصلة لا تطابق هذه اليوميات.',
  'cloud.thisBackupWasCreatedByANewerTackbokVersion':
    'أُنشئت هذه النسخة الاحتياطية بإصدار أحدث من Tackbok.',
  'cloud.aCloudSnapshotFailedItsSafetyChecks':
    'لم تجتز نسخة احتياطية محفوظة في السحابة فحوصات الأمان.',
  'cloud.aDeviceBackupPointsToAMissingSnapshot':
    'تشير نسخة احتياطية لجهاز إلى نسخة محفوظة مفقودة.',
  'cloud.twoDifferentBackupsClaimTheSameDeviceVersion':
    'تدّعي نسختان احتياطيتان مختلفتان إصدار الجهاز نفسه.',
  'cloud.tooManyIndependentDeviceBackupsNeedConsolidation':
    'هناك عدد كبير جدًا من النسخ الاحتياطية المنفصلة للأجهزة، ويجب دمجها.',
  'cloud.aRecoveredItemConflictsWithAnExistingStableIdentifier':
    'لعنصر تم استرداده المعرّف الداخلي نفسه لعنصر موجود.',
  'cloud.tackbokCouldNotSafelyStageBackupDataOnThisDevice':
    'تعذّر على تاكبوك إعداد بيانات النسخة الاحتياطية بأمان على هذا الجهاز.',
  'cloud.googleDriveDoesNotHaveEnoughFreeStorage':
    'لا توجد مساحة حرة كافية في Google Drive.',
  'cloud.googleDriveDeniedAccessToTheAppBackupFolder':
    'رفض Google Drive الوصول إلى مجلد النسخ الاحتياطي للتطبيق.',
  'cloud.aReferencedPhotoOrVoiceMemoIsUnavailable':
    'توجد صورة أو ملاحظة صوتية تحتاجها النسخة الاحتياطية ولكنها غير متاحة.',
  'cloud.aLocalPhotoOrVoiceMemoCouldNotBeVerified':
    'تعذّر التحقق من صورة أو ملاحظة صوتية على هذا الجهاز.',
  'cloud.yourJournalIsNotReadyForCloudSyncYet':
    'يومياتك غير جاهزة للمزامنة السحابية بعد.',
  'cloud.thisCloudBackupWasDeletedFromAnotherDevice':
    'حُذفت هذه النسخة السحابية من جهاز آخر.',
  'cloud.thisJournalWasDeletedEverywhereFromAnotherDevice':
    'حُذفت هذه اليوميات في كل مكان من جهاز آخر.',
  'cloud.cloudDeletionStoppedBeforeEveryBackupObjectWasRemoved':
    'توقف الحذف من السحابة قبل إزالة جميع بيانات النسخ الاحتياطية.',
  'cloud.backupCleanupWasStoppedToProtectACurrentSnapshot':
    'توقف تنظيف النسخ الاحتياطية لحماية نسخة لا تزال قيد الاستخدام.',
  'cloud.chooseTheConnectedAccount': 'اختر الحساب المتصل',
  'cloud.chooseAGoogleAccountToReconnect': 'اختر حساب Google لإعادة الاتصال',
  'cloud.finishConnection': 'أكمل الاتصال',
  'cloud.reconnectToTheCorrectBackup': 'أعد الاتصال بالنسخة الصحيحة',
  'cloud.updateTackbok': 'حدّث Tackbok',
  'cloud.retryAndVerifyBackup': 'أعد المحاولة وتحقق من النسخة',
  'cloud.repairFromVerifiedBackup': 'أصلح من نسخة متحقق منها',
  'cloud.inspectAndRepairBackup': 'افحص النسخة وأصلحها',
  'cloud.consolidateBackups': 'دمج النسخ الاحتياطية',
  'cloud.exportJournalAndRepairBackup': 'صدّر اليوميات وأصلح النسخة',
  'cloud.freeDeviceStorageAndRetry': 'حرر مساحة الجهاز وأعد المحاولة',
  'cloud.manageGoogleDriveStorage': 'إدارة مساحة Google Drive',
  'cloud.retryMissingMedia': 'أعد محاولة الوسائط المفقودة',
  'cloud.locateOrRetryAttachment': 'حدد المرفق أو أعد المحاولة',
  'cloud.retryJournalPreparation': 'أعد محاولة تجهيز اليوميات',
  'cloud.acknowledgeAndDisconnect': 'أقرّ وافصل الاتصال',
  'cloud.reviewDeletionAndEraseThisDevice': 'راجع الحذف وامسح هذا الجهاز',
  'cloud.resumeDeletion': 'استئناف الحذف',
  'cloud.cloudDeletionCompleted': 'اكتمل الحذف السحابي',
  'cloud.exportOrRepairTheAffectedJournalDataThenReturnAnd':
    'صدّر بيانات اليوميات المتأثرة أو أصلحها، ثم عُد وأعد المحاولة.',
  'cloud.cloudBackupRetryCompleted': 'اكتملت إعادة محاولة النسخ السحابي',
  'cloud.cloudSyncCouldNotFinishYourChangesRemainSafelyQueued':
    'تعذّرت مزامنة السحابة. تبقى تغييراتك محفوظة بأمان في قائمة الانتظار.',
  'cloud.googleDriveRejectedABackupRequestUpdateTackbokAndRetry':
    'رفض Google Drive طلب نسخ احتياطي. حدّث Tackbok وأعد المحاولة.',
  'time.hours': 'الساعات',
  'time.minutes': 'الدقائق',
  'common.databaseUpdateFailed': 'تعذّر تحديث قاعدة بيانات دفتر اليوميات: {message}',
};
