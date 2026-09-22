/**
 * Source messages. Stable identifiers are independent of English wording.
 * Keep every locale synchronized; see docs/localization.md.
 */
export const en = {
  // Cold-start header greeting
  'greeting.welcomeBack': 'Welcome back',
  'greeting.goodMorning': 'Good morning',
  'greeting.goodAfternoon': 'Good afternoon',
  'greeting.goodEvening': 'Good evening',
  'greeting.goodNight': 'Good night',
  'greeting.happySunday': 'Happy Sunday',
  'greeting.happyMonday': 'Happy Monday',
  'greeting.happyTuesday': 'Happy Tuesday',
  'greeting.happyWednesday': 'Happy Wednesday',
  'greeting.happyThursday': 'Happy Thursday',
  'greeting.happyFriday': 'Happy Friday',
  'greeting.happySaturday': 'Happy Saturday',
  'greeting.withName': '{greeting}, {name}',

  // Common
  'common.tackbok': 'Tackbok',
  'common.cancel': 'Cancel',
  'common.done': 'Done',
  'common.save': 'Save',
  'common.back': 'Back',
  'common.create': 'Create',
  'common.discard': 'Discard',
  'common.delete': 'Delete',
  'common.remove': 'Remove',
  'common.close': 'Close',
  'common.play': 'Play',
  'common.pause': 'Pause',
  'common.settings': 'Settings',
  'common.shareFeedback': 'Share feedback',
  'common.contactUs': 'Contact us',
  'common.unknownError': 'Unknown error',
  'common.retry': 'Retry',

  // Header & Search
  'search.searchGratitudeLogs': 'Search entries…',
  'search.startTypingToSearchYourGratitudeLogs': 'Type to search your entries',
  'search.searchFailed': 'Search failed',
  'search.noResults': 'No results',

  // Gratitude
  'gratitude.whatAreYouGratefulForToday': 'What are you grateful for today?',
  'gratitude.whatWereYouGratefulForYesterday': 'What were you grateful for yesterday?',
  'gratitude.whatAreYouGratefulFor': 'What are you grateful for?',
  'gratitude.whatWereYouGratefulFor': 'What were you grateful for?',
  'gratitude.failedToLoadEntries': 'Failed to load entries',
  'gratitude.writeNow': 'Write now',
  'gratitude.pickADate': 'Pick a date',
  'gratitude.playWithPet': 'Play with pet',
  'gratitude.collapseGratitudeActions': 'Collapse gratitude actions',
  'gratitude.expandGratitudeActions': 'Expand gratitude actions',

  // Date Entries
  'dateEntries.loading': 'Loading…',
  'dateEntries.noEntriesForThisDate': 'No entries for this date',
  'dateEntries.createEntry': 'Create entry',
  'dateEntries.somethingWentWrongCreatingNewEntry':
    'Something went wrong. Creating a new entry.',

  // Gratitude Entry
  'entry.deleteEntry': 'Delete entry?',
  'entry.thisEntryWillBePermanentlyDeleted': 'This entry will be permanently deleted.',
  'entry.entryNotFound': 'Entry not found',
  'entry.leaveWithoutSaving': 'Leave without saving?',
  'entry.discardChanges.message':
    'Your changes have not been saved. Keep editing or discard changes?',
  'entry.keepEditing': 'Keep editing',

  'entry.pickAnyDate': 'Pick any date',
  'entry.mood': 'Mood',
  'entry.photo': 'Photo',
  'entry.addPhoto': 'Add photo',
  'entry.takePhoto': 'Take photo',
  'entry.chooseFromLibrary': 'Choose from library',
  'entry.maximumCountPhotosPerEntry': 'Maximum {count} photos per entry',
  'entry.maximumCountVoiceMemosPerEntry': 'Maximum {count} voice notes per entry',
  'entry.cameraAccessRequired': 'Camera access required',
  'entry.photoLibraryAccessRequired': 'Photo library access required',
  'entry.pleaseEnableCameraAccessInYourDeviceSettingsToTake':
    'Please enable camera access in your device settings to take photos.',
  'entry.pleaseEnablePhotoLibraryAccessInYourDeviceSettingsTo':
    'Please enable photo library access in your device settings to select photos.',
  'entry.openSettings': 'Open settings',
  'entry.voice': 'Voice',
  'entry.microphoneAccessRequired': 'Microphone access required',
  'entry.pleaseEnableMicrophoneAccessInYourDeviceSettingsToRecord':
    'Please enable microphone access in your device settings to record voice notes.',
  'entry.recordVoiceNote': 'Record voice note',
  'entry.tapTheButtonBelowWhenReady': 'Tap the button below when ready.',
  'entry.startRecording': 'Start recording',
  'entry.recordingVoiceNote': 'Recording voice note…',
  'entry.stopRecording': 'Stop recording',
  'entry.voiceNoteRecorded': 'Voice note recorded',
  'entry.tapOnThePlayButtonToListen': 'Tap play to listen.',
  'entry.saveRecording': 'Save recording',
  'entry.discardRecording': 'Discard recording',
  'entry.voiceNotesSaveAutomaticallyAt3000':
    'Voice notes save automatically after 30 minutes.',
  'entry.titleOptional': 'Title (optional)',
  'entry.usePrompt': 'Use prompt',
  'entry.newPrompt': 'New prompt',
  'entry.addPrompt': 'Add prompt',
  'entry.showAll': 'Show all',
  'entry.promptText': 'Prompt text',
  'entry.promptAlreadyExists': 'Prompt already exists',
  'entry.promptCreated': 'Prompt created',
  'entry.failedToCreatePrompt': 'Failed to create prompt',
  'entry.promptUpdated': 'Prompt updated',
  'entry.failedToUpdatePrompt': 'Failed to update prompt',
  'entry.promptDeleted': 'Prompt deleted',
  'entry.failedToDeletePrompt': 'Failed to delete prompt',
  'entry.faith': 'Faith',
  'entry.self': 'Self',
  'entry.health': 'Health',
  'entry.friends': 'Friends',
  'entry.family': 'Family',
  'entry.littleThings': 'Little things',
  'entry.createPrompt': 'Create prompt',
  'entry.createAPrompt': 'Create prompt',
  'entry.editPrompt': 'Edit prompt',
  'entry.deletePrompt': 'Delete prompt',
  'entry.deletePrompt2': 'Delete prompt?',
  'entry.areYouSureYouWantToDeleteThisPrompt':
    'Are you sure you want to delete this prompt?',
  'entry.noPromptsYet': 'No prompts yet',
  'entry.createYourFirstPrompt': 'Create your first prompt',

  // Prompts - Faith
  prompt_faith_1: "What's your earliest memory of feeling God's presence?",
  prompt_faith_2: 'Where have you seen grace in your life recently?',
  prompt_faith_3: 'Which prayer helped you through a difficult time?',
  prompt_faith_4: 'How has your faith changed the way you view challenges?',
  prompt_faith_5: 'What spiritual practice or habit brings you the most peace?',
  prompt_faith_6: 'Write about a time when you felt clearly guided by a higher power.',
  prompt_faith_7: 'What is a specific teaching or quote that inspires your daily life?',
  prompt_faith_8: 'How do you find spiritual connection in the midst of a busy week?',
  prompt_faith_9:
    'Reflect on a moment when your faith offered you comfort during uncertainty.',

  // Prompts - Self
  prompt_self_1: 'What do you need more of in your life?',
  prompt_self_2: 'What is something that was hard to do but you did it anyway?',
  prompt_self_3: 'What would you tell your younger self today?',
  prompt_self_4: "What is a recent accomplishment that you haven't celebrated enough?",
  prompt_self_5: 'Write down three things you love about your personality.',
  prompt_self_6: 'How have you grown from a mistake you made recently?',
  prompt_self_7: 'What boundary do you need to set to protect your energy?',
  prompt_self_8: 'In what area of your life do you feel the most authentic?',
  prompt_self_9: 'Describe your ideal day from morning to night.',

  // Prompts - Health
  prompt_health_1: 'What part of your body are you most thankful for today?',
  prompt_health_2: 'How has rest helped you lately?',
  prompt_health_3: 'What healthy habit are you proud of keeping?',
  prompt_health_4: 'What is a nourishing meal that always makes you feel good?',
  prompt_health_5:
    'Describe a physical activity that brings you joy rather than feeling like a chore.',
  prompt_health_6: 'How does your body tell you when it needs to slow down or rest?',
  prompt_health_7: 'What are you doing today to care for your mental well-being?',
  prompt_health_8: 'Write about a time you overcame a physical challenge or injury.',
  prompt_health_9: 'What small change can you make to improve your sleep quality?',

  // Prompts - Friends
  prompt_friends_1: 'Which friend has made your life lighter recently?',
  prompt_friends_2: 'What is a memory with a friend that still makes you smile?',
  prompt_friends_3: 'Who do you want to encourage this week?',
  prompt_friends_4: 'What quality do you value most in your closest friendships?',
  prompt_friends_5:
    'Write about a friend who helped you see things from a different perspective.',
  prompt_friends_6:
    'How do you prefer to show your appreciation and love to your friends?',
  prompt_friends_7:
    "Who is a friend you haven't spoken to in a while, and what would you say to them?",
  prompt_friends_8: 'Describe a fun or unexpected adventure you had with a friend.',
  prompt_friends_9: "What is a lesson you've learned from one of your friendships?",

  // Prompts - Family
  prompt_family_1: 'What family tradition are you grateful for?',
  prompt_family_2: 'Who in your family taught you something lasting?',
  prompt_family_3: 'What is a small moment with family you want to remember?',
  prompt_family_4: "What is a story from your family's history that you find inspiring?",
  prompt_family_5: 'How has your relationship with a family member evolved over time?',
  prompt_family_6:
    'Write about a skill or a recipe that has been passed down in your family.',
  prompt_family_7:
    'What is a specific personality trait you share with a parent or sibling?',
  prompt_family_8: 'Describe a childhood memory that still brings you immense joy.',
  prompt_family_9: 'How does your family support each other during difficult times?',

  // Prompts - Little Things
  prompt_littleThings_1: 'What made you smile today?',
  prompt_littleThings_2: 'What small moment made you pause today?',
  prompt_littleThings_3: 'What everyday comfort would you miss the most?',
  prompt_littleThings_4:
    'Describe a small, everyday detail around you that you find beautiful.',
  prompt_littleThings_5:
    'What is your favorite sound to hear when you wake up in the morning?',
  prompt_littleThings_6:
    'Write about a simple pleasure that you look forward to every day.',
  prompt_littleThings_7: 'What was the best part of your morning routine today?',
  prompt_littleThings_8:
    'Describe a brief encounter with a stranger that brought you joy.',
  prompt_littleThings_9:
    'What is an inexpensive item that brings a lot of value to your life?',

  // Default Worksheet Template Keys
  'worksheet.whatIAmGratefulForToday': 'What I am grateful for today…',
  'worksheet.myAffirmationForToday': 'My affirmation for today…',
  'worksheet.oneLittleThingThatMadeMeSmileRecently':
    'One little thing that made me smile recently…',

  // Moods
  'mood.amazing': 'Amazing',
  'mood.happy': 'Happy',
  'mood.okay': 'Okay',
  'mood.sad': 'Sad',
  'mood.awful': 'Awful',
  'mood.howAreYouFeeling': 'How are you feeling?',
  'mood.feelingAmazing': 'Feeling amazing',
  'mood.feelingHappy': 'Feeling happy',
  'mood.feelingOkay': 'Feeling okay',
  'mood.feelingSad': 'Feeling sad',
  'mood.feelingAwful': 'Feeling awful',
  'mood.entrySavedSuccessfully': 'Entry saved successfully',
  'mood.failedToSaveEntry': 'Failed to save entry',
  'mood.failedToSaveVoiceMemo': 'Failed to save voice note',
  'mood.failedToAddPhotos': 'Failed to add photos',
  'mood.failedToDeleteEntry': 'Failed to delete entry',
  'mood.tagAlreadyExists': 'Tag already exists',
  'mood.tagCreated': 'Tag created',
  'mood.failedToCreateTag': 'Failed to create tag',
  'mood.tagUpdated': 'Tag updated',
  'mood.failedToUpdateTag': 'Failed to update tag',
  'mood.tagDeleted': 'Tag deleted',
  'mood.failedToDeleteTag': 'Failed to delete tag',

  // Tags
  'tags.tag': 'Tag',
  'tags.tagName': 'Tag name',
  'tags.addATag': 'Add tag',
  'tags.createNewTag': 'Create tag',
  'tags.editTag': 'Edit tag',
  'tags.deleteTag': 'Delete tag',
  'tags.areYouSureYouWantToDeleteTheTagTitle':
    'Are you sure you want to delete the tag "{title}"?',

  // Milestones
  'milestone.daysOfGratitude': 'days of gratitude',

  // Settings - Profile
  'profile.yourName': 'Your name',
  'profile.changePhoto': 'Change photo',
  'profile.profilePhoto': 'Profile photo',
  'profile.wouldYouLikeToUpdateOrRemoveYourProfilePhoto':
    'Would you like to update or remove your profile photo?',
  'profile.updatePhoto': 'Update photo',
  'profile.removePhoto': 'Remove photo',

  // Settings
  'settings.language': 'Language',
  'settings.selectLanguage': 'Select language',
  'settings.deviceDefault': 'Device default',
  'settings.restartRequired': 'Restart required',
  'settings.languageChangeRequiresAppRestartProceed':
    'Changing the language requires restarting Tackbok. Continue?',
  'settings.proceed': 'Proceed',
  'settings.reloadApp': 'Reload app',

  // Settings - Notifications
  'notifications.notifications': 'Notifications',
  'notifications.dailyReminder': 'Daily reminder',
  'notifications.dailyReminderNotificationsAreOn': 'Daily reminder notifications are on',
  'notifications.dailyReminderNotificationsAreOff':
    'Daily reminder notifications are off',
  'notifications.adjustReminderTime': 'Adjust reminder time',
  'notifications.changeYourDailyReminderTime': 'Change your daily reminder time',
  'notifications.failedToUpdateReminder': 'Failed to update reminder',
  'notifications.notificationPermissionNeeded': 'Notification permission needed',
  'notifications.toGetDailyRemindersAllowNotificationsForTackbokInYour':
    'To get daily reminders, allow notifications for Tackbok in your device settings.',

  // Settings - Appearance
  'appearance.appearance': 'Appearance',
  'appearance.theme': 'Theme',
  'appearance.selectATheme': 'Select a theme',
  'appearance.countThemesAndColorSchemes': '{count} themes and color schemes',
  'appearance.timelineEntryLength': 'Timeline entry length',
  'appearance.numberOfLinesShownInTheTimeline':
    'Number of lines shown in the timeline. Tap an entry to read the full text.',
  'appearance.showTimelineBorders': 'Show timeline borders',
  'appearance.showTheBordersInTheTimeline': 'Show the borders in the timeline',
  'appearance.hideTheBordersInTheTimeline': 'Hide the borders in the timeline',
  'appearance.dateStyle': 'Date style',
  'appearance.dateIncludesDayOfTheWeek': 'Date includes day of the week',
  'appearance.firstDayOfWeek': 'First day of week',
  'appearance.setTheFirstDayOfTheWeekInTheCalendar':
    'Set the first day of the week in the calendar view',

  // Settings - Typography
  'typography.typography': 'Typography',
  'typography.titleFont': 'Title font',
  'typography.chooseAFontForTitlesAndHeadings': 'Choose a font for titles and headings',
  'typography.default': 'Default',
  'typography.themeDefault': 'Theme default',
  'typography.fontSize': 'Font size',
  'typography.adjustTheSizeOfBodyText': 'Adjust the size of body text',
  'typography.small': 'Small',
  'typography.large': 'Large',
  'typography.previewOfTheSelectedFont': 'Preview of the selected font',
  'typography.gratitudeMakesTodayBrighter': 'Gratitude makes today brighter',

  // Settings - Journaling
  'journaling.journaling': 'Journaling',
  'journaling.editWorksheetTemplate': 'Edit worksheet template',
  'journaling.resetToDefault': 'Reset to default',
  'journaling.journalingWorksheet': 'Journaling worksheet',
  'journaling.startWriting': 'Start writing',
  'journaling.journalFocusAreas': 'Journal focus areas',
  'journaling.personalizeYourJournalPrompts': 'Personalize your journal prompts.',
  'journaling.pickTheTopicsYouWantToWriteAbout':
    'Pick the topics you want to write about.',
  'journaling.selectAtLeast2FocusAreas': 'Select at least 2 focus areas',
  'journaling.journalPrompts': 'Journal prompts',
  'journaling.chooseWhichPromptsToShowWhenStartingANewJournal':
    'Choose which prompts to show when starting a new journal entry.',
  'journaling.off': 'Off',
  'journaling.allPrompts': 'All prompts',
  'journaling.myPrompts': 'My prompts',
  'journaling.builtInPrompts': 'Built-in prompts',
  'journaling.focusareaSelfDesc':
    'Reflect on your hobbies, interests, experiences, and life in general.',
  'journaling.focusareaLittlethingsDesc':
    'Cherish the small, often overlooked blessings of everyday life.',
  'journaling.focusareaHealthDesc':
    'Appreciate the many blessings of your body and its capabilities.',
  'journaling.focusareaFamilyDesc':
    'Appreciate your family members and moments shared with them.',
  'journaling.focusareaFriendsDesc':
    'Cherish your loving, supportive, and understanding friends.',
  'journaling.focusareaFaithDesc':
    'Focus on appreciating your faith, spirituality, and inner peace.',

  // Settings - Security
  'security.security': 'Security',
  'security.lockAfter': 'Lock after',
  'security.timeAwayFromTheAppBeforeRequiringAnUnlock':
    'Time away from the app before requiring an unlock.',
  'security.0Seconds': '0 seconds',
  'security.30Seconds': '30 seconds',
  'security.1Minute': '1 minute',
  'security.2Minutes': '2 minutes',
  'security.unlockTackbok': 'Unlock Tackbok',
  'security.lockWithYourDeviceScreenLock':
    "Tackbok can lock with your device's screen lock — biometrics, PIN, pattern, or passcode",
  'security.unlock': 'Unlock',
  'security.appLockUnavailable': 'App lock unavailable',
  'security.setUpAScreenLockPinPatternOrBiometricsIn':
    'Set up a screen lock (PIN, pattern, or biometrics) in your device settings first.',

  // Settings - Backup & Restore
  'backup.backupRestore': 'Backup & restore',
  'backup.googleDriveBackup': 'Google Drive backup',
  'backup.exportAsZip': 'Export as ZIP',
  'backup.allOfYourDataInAFormatThatYouCan':
    'All of your data in a format that you can restore in the app later',
  'backup.importAsZip': 'Import from ZIP',
  'backup.restoreYourDataFromAZipFile': 'Restore your data from a .zip file',
  'backup.importFromGratitudeApp': 'Import from Gratitude app',
  'backup.importingFromGratitudeApp': 'Importing from Gratitude app',
  'backup.importDataFromAGratitudeAppZipBackup':
    'Import data from a Gratitude app .zip backup',
  'backup.chooseImportMode': 'Choose import mode',
  'backup.howShouldThisImportHandleEntriesThatAlreadyExistIn':
    'How should this import handle entries that already exist in Tackbok?',
  'backup.skipExistingEntries': 'Skip existing entries',
  'backup.skipExistingEntriesRecommended': 'Skip existing entries (recommended)',
  'backup.onlyImportEntriesWithNewNoteIds': 'Only import entries with new note IDs',
  'backup.overwriteMatchingEntries': 'Overwrite matching entries',
  'backup.replaceExistingEntriesWhenNoteIdsMatch':
    'Replace existing entries when note IDs match',
  'backup.importFromPresentlyApp': 'Import from Presently app',
  'backup.restoreYourDataFromAPresentlyCsvFile':
    'Restore your data from a Presently .csv file',
  'backup.importFromPresently': 'Import from Presently?',
  'backup.thisWillImportEntriesFromAPresentlyAppCsvFile':
    'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.',
  'backup.backupExportedSuccessfully': 'Backup exported successfully',
  'backup.exportFailed': 'Export failed',
  'backup.importFailed': 'Import failed',
  'backup.restoringTackbokBackup': 'Restoring Tackbok backup',
  'backup.loadPresentlyExport': 'Load Presently export',
  'backup.importJournalEntries': 'Import journal entries',
  'backup.openBackupFile': 'Open backup file',
  'backup.validateBackupContents': 'Validate backup contents',
  'backup.restoreProfile': 'Restore profile',
  'backup.importTagsAndPrompts': 'Import tags and prompts',
  'backup.restoreEntriesAndMedia': 'Restore entries and media',
  'backup.refreshJournalData': 'Refresh journal data',
  'backup.loadingTheSelectedImportFile': 'Loading the selected import file.',
  'backup.checkingBackupContentsAndFileStructure':
    'Checking backup contents and file structure.',
  'backup.restoringProfileDetailsAndProfilePhotoIfAvailable':
    'Restoring profile details and profile photo if available.',
  'backup.addingTagsAndPromptsBeforeEntriesAreRestored':
    'Adding tags and prompts before entries are restored.',
  'backup.processingProcessedOfTotalJournalEntriesAndAttachedMedia':
    'Processing {processed} of {total} journal entries and attached media.',
  'backup.noJournalEntriesFoundInThisBackup': 'No journal entries found in this backup.',
  'backup.refreshingYourJournalSoImportedDataAppearsEverywhere':
    'Refreshing your journal so imported data appears everywhere.',
  'backup.entriesProcessed': 'Entries processed',
  'backup.entriesSkippedDueToErrors': 'Entries skipped due to errors',
  'backup.pleaseDoNotCloseOrMinimizeTheAppWhileThe':
    'Please do not close or minimize the app while the import is in progress.',
  'backup.tagsAdded': 'Tags added',
  'backup.promptsAdded': 'Prompts added',
  'backup.photosRestored': 'Photos restored',
  'backup.voiceMemosRestored': 'Voice notes restored',
  'backup.mediaSkipped': 'Media skipped',
  'backup.tackbokBackupRestored': 'Tackbok backup restored',
  'backup.gratitudeImportComplete': 'Gratitude import complete',
  'backup.presentlyImportComplete': 'Presently import complete',
  'backup.yourJournalDataIsReadyToReviewButSomeItems':
    'Your journal data is ready to review, but some items could not be restored.',
  'backup.yourJournalDataIsReadyToReview': 'Your journal data is ready to review.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe':
    'This import finished with warnings. Some items could not be restored, and everything else already existed in Tackbok.',
  'backup.thisImportFinishedButEverythingAlreadyExistedInTackbok':
    'This import finished, but everything already existed in Tackbok.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe2':
    'This import finished with warnings. Some items could not be restored.',
  'backup.thisImportFinishedSuccessfully': 'This import finished successfully.',
  'backup.importedFromTackbokBackup': 'Imported from Tackbok backup',
  'backup.importedFromGratitudeBackup': 'Imported from gratitude backup',
  'backup.importedFromPresentlyExport': 'Imported from Presently export',
  'backup.newEntries': 'New entries',
  'backup.updatedEntries': 'Updated entries',
  'backup.skippedDuplicates': 'Skipped duplicates',
  'backup.import': 'Import',

  // Settings - App Information
  'appInfo.appInformation': 'App information',
  'appInfo.faq': 'FAQ',
  'appInfo.readFrequentlyAskedQuestions': "Read Tackbok's frequently asked questions",
  'appInfo.shareTackbok': 'Share Tackbok',
  'appInfo.shareTheAppWithFriendsAndFamily':
    'Enjoying Tackbok? Share the app with your friends and family',
  'appInfo.practiceGratitudeWithTackbokASimpleFreeAndPrivateGratitude':
    'Practice gratitude with Tackbok, a simple, free, and private gratitude journaling app',
  'appInfo.supportTackbok': 'Support Tackbok',
  'appInfo.tackbokIsFreeToUseAndThatsNotChangingIf':
    "Tackbok is free to use, and that's not changing. If it has brought a little more gratitude into your day, you’re welcome to support it, though there’s nothing to unlock. Everyone gets the same app.",
  'appInfo.keepingTackbokRunningCurrentlyCostsAboutUs3325Per':
    'Keeping Tackbok running currently costs about US$33.25 per month, before taxes, fees, and usage overages. If you’ve found it worthwhile, even a small contribution helps keep it free for everyone.',
  'appInfo.waysToSupport': 'Ways to support',
  'appInfo.free': 'Free',
  'appInfo.smallThanks': 'Small thanks',
  'appInfo.helpsMeFinishWork10MinutesEarlier': 'Helps me finish work 10 minutes earlier',
  'appInfo.heartfeltThanks': 'Heartfelt thanks',
  'appInfo.helpsPayForHostingAndOnlineServices':
    'Helps pay for hosting and online services',
  'appInfo.bigThanks': 'Big thanks',
  'appInfo.helpsTestAndReleaseTackbokUpdates': 'Helps test and release Tackbok updates',
  'appInfo.deepestThanks': 'Deepest thanks',
  'appInfo.helpsCoverOneMonthOfTackboksRunningCostsAndOngoing':
    'Helps cover one month of Tackbok’s running costs and ongoing development',
  'appInfo.unavailable': 'Unavailable',
  'appInfo.supportOptionsCouldNotBeLoadedPleaseTryAgain':
    'Support options could not be loaded. Please try again.',
  'appInfo.youAppearToBeOfflineCheckYourConnectionAndTry':
    'You appear to be offline. Check your connection and try again.',
  'appInfo.thePurchaseCouldNotBeCompletedPleaseTryAgain':
    'The purchase could not be completed. Please try again.',
  'appInfo.paymentSuccessful': 'Payment successful',
  'appInfo.thankYou': 'Thank you!',
  'appInfo.yourSupportHelpsKeepTackbokFreeAndIndependentItGenuinely':
    'Your support helps keep Tackbok free and independent. It genuinely means a lot.',
  'appInfo.thankYouForSupportingTackbokItGenuinelyMeansALot':
    'Thank you for supporting Tackbok. It genuinely means a lot.',
  'appInfo.yourPaymentIsPendingTheStoreWillFinishItWhen':
    'Your payment is pending. The store will finish it when approval or payment completes.',
  'appInfo.whereYourSupportHelps': 'Where your support helps',
  'appInfo.cloudflareWorkers': 'Cloudflare workers',
  'appInfo.expoEas': 'Expo EAS',
  'appInfo.appleDeveloperMembership': 'Apple developer membership',
  'appInfo.tackbokOrgDomain': 'tackbok.org domain',
  'appInfo.googlePlayRegistration': 'Google Play registration',
  'appInfo.monthlyBaseline': 'Monthly baseline',
  'appInfo.us5Month': 'US$5/month',
  'appInfo.us19Month': 'US$19/month',
  'appInfo.us99Year': 'US$99/year',
  'appInfo.us12Year': 'US$12/year',
  'appInfo.us25OneTime': 'US$25 one time',
  'appInfo.aboutUs3325': 'About US$33.25',
  'appInfo.rateTackbok': 'Rate Tackbok',
  'appInfo.leaveAnHonestRatingInTheAppStore': 'Leave an honest rating in the app store',
  'appInfo.unableToOpenTheStore': 'Unable to open the store',
  'appInfo.confirmTier': 'Confirm {tier}',
  'appInfo.theStoreWillChargePriceForThisVoluntaryOneTime':
    'The store will charge {price} for this voluntary, one-time support. It unlocks no features and can be purchased again.',
  'appInfo.privacyPolicy': 'Privacy policy',
  'appInfo.readOurPrivacyPolicy': "Read Tackbok's privacy policy",
  'appInfo.termsConditions': 'Terms & conditions',
  'appInfo.readOurTermsAndConditions': 'Read our terms & conditions',
  'appInfo.analytics': 'Analytics data collection',
  'appInfo.collectingAnonymizedAnalyticsToHelpDiagnoseProblems':
    'Tackbok is collecting anonymized analytics information to help diagnose problems and monitor trends',
  'appInfo.checkForUpdates': 'Check for updates',
  'appInfo.checkingForUpdates': 'Checking for updates…',
  'appInfo.lastCheckedTime': 'Last checked: {time}',
  'appInfo.never': 'Never',
  'appInfo.restart': 'Restart',
  'appInfo.restartToApply': 'Restart to apply',
  'appInfo.updateDownloadedRestartToApplyIt': 'Update downloaded. Restart to apply it.',
  'appInfo.youAlreadyHaveTheLatestVersion': 'You already have the latest version',
  'appInfo.unableToUpdate': 'Unable to update',
  'appInfo.version': 'Version number',

  // Settings - Danger Zone
  'dangerZone.dangerZone': 'Danger zone',
  'dangerZone.deleteAllData': 'Delete all data',
  'dangerZone.deleteAllData2': 'Delete all data?',
  'dangerZone.permanentlyDeleteAllYourAppData': 'Permanently delete all your app data',
  'dangerZone.thisActionCannotBeUndoneAllYourAppDataWill':
    'This action cannot be undone. All your app data will be permanently deleted.',
  'dangerZone.allDataDeleted': 'All data deleted',
  'dangerZone.allDataDeletedButSomeMediaFilesCouldNotBe':
    'All data deleted, but some media files could not be removed.',
  'dangerZone.deleteFailed': 'Delete failed',

  // Time Picker
  'time.selectTime': 'Select time',

  // Date Picker
  'calendar.today': 'Today',
  'calendar.yesterday': 'Yesterday',
  'calendar.previousMonth': 'Previous month',
  'calendar.nextMonth': 'Next month',
  'calendar.selectMonth': 'Select month',
  'calendar.selectYear': 'Select year',
  'calendar.random': 'Random',
  'calendar.openARandomEntry': 'Open a random entry',
  'calendar.sun': 'Sun',
  'calendar.mon': 'Mon',
  'calendar.tue': 'Tue',
  'calendar.wed': 'Wed',
  'calendar.thu': 'Thu',
  'calendar.fri': 'Fri',
  'calendar.sat': 'Sat',
  'calendar.sunday': 'Sunday',
  'calendar.monday': 'Monday',
  'calendar.tuesday': 'Tuesday',
  'calendar.wednesday': 'Wednesday',
  'calendar.thursday': 'Thursday',
  'calendar.friday': 'Friday',
  'calendar.saturday': 'Saturday',
  'calendar.january': 'January',
  'calendar.february': 'February',
  'calendar.march': 'March',
  'calendar.april': 'April',
  'calendar.may': 'May',
  'calendar.june': 'June',
  'calendar.july': 'July',
  'calendar.august': 'August',
  'calendar.september': 'September',
  'calendar.october': 'October',
  'calendar.november': 'November',
  'calendar.december': 'December',
  'calendar.jan': 'Jan',
  'calendar.feb': 'Feb',
  'calendar.mar': 'Mar',
  'calendar.apr': 'Apr',
  'calendar.may2': 'May',
  'calendar.jun': 'Jun',
  'calendar.jul': 'Jul',
  'calendar.aug': 'Aug',
  'calendar.sep': 'Sep',
  'calendar.oct': 'Oct',
  'calendar.nov': 'Nov',
  'calendar.dec': 'Dec',

  // Onboarding
  'onboarding.skip': 'Skip',
  'onboarding.continue': 'Continue',
  'onboarding.next': 'Next',
  'onboarding.stepCurrentOfTotal': 'Step {current} of {total}',
  'onboarding.getStarted': 'Get started',
  'onboarding.alreadyHaveAJournalImportIt': 'Already have a journal? Import it',
  'onboarding.aPrivatePlaceForYourGratitudeFreeOfflineYours':
    'A private place for your gratitude. Free, offline, yours.',
  'onboarding.importYourJournal': 'Import your journal',
  'onboarding.whereIsYourJournalComingFrom': 'Where is your journal coming from?',
  'onboarding.tackbokBackup': 'Tackbok backup',
  'onboarding.gratitudeApp': 'Gratitude app',
  'onboarding.presentlyApp': 'Presently app',
  'onboarding.whatShouldWeCallYou': 'What should we call you?',
  'onboarding.yourNameIsOnlyUsedToGreetYouInsideThe':
    'Your name is only used to greet you inside the app.',
  'onboarding.yourNameOptional': 'Your name (optional)',
  'onboarding.staysOnYourDevice': 'Stays on your device.',
  'onboarding.makeItYours': 'Make it yours',
  'onboarding.pickALookYouCanChangeEverythingLaterInSettings':
    'Pick a look. You can change everything later in Settings.',
  'onboarding.aWalkInTheMorningSun': 'A walk in the morning sun',
  'onboarding.gratefulForQuietStreetsWarmCoffeeAndASkyFull':
    'Grateful for quiet streets, warm coffee, and a sky full of color.',
  'onboarding.moreThemes': 'More themes…',
  'onboarding.whatDoYouWantToBeMoreGratefulFor':
    'What do you want to be more grateful for?',
  'onboarding.wellSuggestWritingPromptsFromTheAreasYouPick':
    'We’ll suggest writing prompts from the areas you pick.',
  'onboarding.pickAtLeastCount': 'Pick at least {count}',
  'onboarding.helpImproveTackbok': 'Help improve Tackbok?',
  'onboarding.tackbokIsFreeAndOpenSourceAnonymousStatsHelpUs':
    'Tackbok is free and open source. Anonymous stats help us find bugs and see which features matter.',
  'onboarding.anonymousUsageStatsOnlyIncludingWhichScreensAndFeaturesGet':
    'Anonymous usage stats only, including which screens and features get used.',
  'onboarding.neverYourJournalContentPhotosVoiceMemosOrAnythingYou':
    'Never your journal content, photos, voice notes, or anything you type.',
  'onboarding.openSourceTheExactEventListIsPublicInThe':
    'Open source. The exact event list is public in the repo.',
  'onboarding.seeExactlyWhatWeCollect': 'See exactly what we collect',
  'onboarding.shareAnonymousStats': 'Share anonymous stats',
  'onboarding.noThanks': 'No thanks',
  'onboarding.whatWeCollect': 'What we collect',
  'onboarding.withYourPermissionTackbokRecordsLimitedAnonymousUsageInformationThis':
    'With your permission, Tackbok records limited, anonymous usage information. This may include screens visited, features used, and whether optional operations succeed. It never includes your journal content or anything you type.',
  'onboarding.auditTheAnalyticsCodeOnGithub': 'Audit the analytics code on GitHub',
  'onboarding.neverCollected': 'Never collected',
  'onboarding.yourJournalTextTitlesPhotosVoiceMemosTagsNameEmail':
    'Your journal text, titles, photos, voice notes, tags, name, email, or anything you type. No ads, no selling data, no third-party tracking.',
  'onboarding.youreAllSetName': 'You’re all set, {name}!',
  'onboarding.youreAllSet': 'You’re all set!',
  'onboarding.twoLastThingsYouCanTurnOnBothAreOptional':
    'Two last things you can turn on. Both are optional.',
  'onboarding.addExampleEntries': 'Add example entries',
  'onboarding.aFewSampleEntriesShowHowPhotosVoiceMemosMoods':
    'A few sample entries show how photos, voice notes, moods and tags work. Remove them anytime with one tap.',
  'onboarding.remindMeDaily': 'Remind me daily',
  'onboarding.aGentleNudgeToWriteNeverYourJournalContent':
    'A gentle nudge to write. Never your journal content.',
  'onboarding.remindMeAtTime': 'Remind me at {time}',
  'onboarding.settingThingsUp': 'Setting things up…',
  'onboarding.startJournaling': 'Start journaling',
  'onboarding.showingExampleEntries': 'Showing example entries',
  'onboarding.removeAll': 'Remove all',
  'onboarding.hideThisBanner': 'Hide this banner',
  'onboarding.exampleEntriesRemoved': 'Example entries removed',
  'onboarding.failedToRemoveExampleEntries': 'Failed to remove example entries',
  'onboarding.addTodaysEntryHere': 'Add today’s entry here.',
  'onboarding.pressAndHoldThenDragToMoveTheseButtonsAlong':
    'Press and hold, then drag to move these buttons along the edge.',
  'onboarding.tapAnEntryToViewOrEditIt': 'Tap an entry to view or edit it.',
  'onboarding.findMemoriesByTextOrTag': 'Find memories by text or tag.',
  'onboarding.replayOnboarding': 'Replay onboarding',
  'onboarding.runTheWelcomeSetupAgain': 'Run the welcome setup again',
  'onboarding.replayOnboarding2': 'Replay onboarding?',
  'onboarding.theWelcomeSetupWillStartAgainYourJournalEntriesAnd':
    'The welcome setup will start again. Your journal entries and settings are kept.',
  'onboarding.replay': 'Replay',

  // Onboarding sample entries (seeded content)
  sample_tag_family: 'Family',
  sample_tag_littleThings: 'Little things',
  sample_entry_welcome_title: 'Welcome to Tackbok 👋',
  sample_entry_welcome_body:
    'This is your gratitude journal, a place for the good moments. Tap the + button to write one line or a whole page, once a day or whenever you like. Tap this card to see the full entry.',
  sample_entry_photos_title: 'Small moments',
  sample_entry_photos_body: 'You can attach photos to a memory. Tap one to zoom.',
  sample_entry_voice_title: 'In my own words',
  sample_entry_voice_body:
    'Sometimes it’s easier to say it out loud. Tap play to hear a short voice note.',
  sample_entry_tags_body:
    'This entry answers one of the writing prompts and carries two tags. Try the search at the top and filter by tag to find it again.',

  // Insights
  'insights.insights': 'Insights',
  'insights.overview': 'Overview',
  'insights.gratitudeScore': 'Gratitude score',
  'insights.currentStreak': 'Current streak',
  'insights.longestStreak': 'Longest streak',
  'insights.daysJournaled': 'Days journaled',
  'insights.consistency': 'Consistency',
  'insights.entries': 'Entries',
  'insights.less': 'Less',
  'insights.more': 'More',
  'insights.yourHappiestDayIsWeekday': 'Your happiest day is {weekday}',
  'insights.moodOverTime': 'Mood over time',
  'insights.writingHabits': 'Writing habits',
  'insights.morning': 'Morning',
  'insights.afternoon': 'Afternoon',
  'insights.evening': 'Evening',
  'insights.night': 'Night',
  'insights.youreAMorningWriter': 'You’re a morning writer',
  'insights.youreAnAfternoonWriter': 'You’re an afternoon writer',
  'insights.youreAnEveningWriter': 'You’re an evening writer',
  'insights.youreANightWriter': 'You’re a night writer',
  'insights.entriesPerMonth': 'Entries per month',
  'insights.topTags': 'Top tags',
  'insights.totals': 'Totals',
  'insights.words': 'Words',
  'insights.characters': 'Characters',
  'insights.photos': 'Photos',
  'insights.voiceMemos': 'Voice notes',
  'insights.yourMemories': 'Your memories',
  'insights.onThisDay': 'On this day',
  'insights.oneYearAgoToday': 'One year ago today',
  'insights.oneMonthAgoToday': 'One month ago today',
  'insights.countYearsAgoToday': '{count} years ago today',
  'insights.aMomentFromThisDay': 'A moment from this day',
  'insights.noInsightsYet': 'No insights yet',
  'insights.writeAFewEntriesAndYourStatsWillShowUp':
    'Write a few entries and your stats will show up here.',

  // Sharing and achievements
  'sharing.shareYourGratitude': 'Share your gratitude',
  'sharing.iWasGratefulFor': 'I was grateful for',
  'sharing.shareImage': 'Share image',
  'sharing.shareEntry': 'Share entry',
  'sharing.includeMood': 'Include mood',
  'sharing.moodIsHiddenUnlessYouIncludeIt': 'Mood is hidden unless you include it',
  'sharing.includePhotos': 'Include photos',
  'sharing.upToTheFirstFivePhotosWillBeShared':
    'Up to the first five photos will be shared',
  'sharing.chooseAStyle': 'Choose a style',
  'sharing.sharingIsNotAvailableOnThisDevice': 'Sharing is not available on this device',
  'sharing.couldNotShareImagePleaseTryAgain': 'Could not share image. Please try again.',
  'sharing.themeTheme': '{theme} theme',
  'sharing.themeThemeSelected': '{theme} theme, selected',
  'sharing.dayOneComplete': 'Day one complete!',
  'sharing.aBeautifulBeginningKeepNoticingTheGood':
    'A beautiful beginning. Keep noticing the good.',
  'sharing.countDaysOfGratitude': '{count} days of gratitude!',
  'sharing.congratulationsOnMakingGratitudePartOfYourJourney':
    'Congratulations on making gratitude part of your journey.',
  'sharing.shareAchievement': 'Share achievement',
  'sharing.openCountDayAchievement': 'Open {count} day achievement',

  // Date Format Patterns (placeholders: {weekday}, {month}, {day}, {year})
  'dateFormat.timeLabel': '{weekday} at {time}',

  // Cloud Backup & Sync
  'cloud.attentionNeeded': 'Attention needed',
  'cloud.backUpAndSyncYourJournalWithYourOwnGoogle':
    'Back up and sync your journal with your own Google Drive. No Tackbok account is created.',
  'cloud.backupFromDate': 'Backup from {date}',
  'cloud.beforeYouConnect': 'Before you connect',
  'cloud.checkingGoogleDriveForChanges': 'Checking Google Drive for changes',
  'cloud.chooseABackupToMergeWithThisJournalBothSides':
    'Choose a backup to merge with this journal. Both sides are preserved.',
  'cloud.chooseABackupToRestoreOnThisDevice':
    'Choose a backup to restore on this device.',
  'cloud.chooseWhichCopiesOfYourJournalToRemove':
    'Choose which copies of your journal to remove.',
  'cloud.cloudBackupSync': 'Cloud backup & sync',
  'cloud.cloudBackupConnected': 'Cloud backup connected',
  'cloud.cloudBackupCouldNotBeUpdated': 'Cloud backup could not be updated',
  'cloud.cloudBackupDeleted': 'Cloud backup deleted',
  'cloud.cloudBackupDeletionReceived': 'Cloud backup deletion received',
  'cloud.cloudBackupNumber': 'Cloud backup {number}',
  'cloud.backupsAreEncryptedInTransitAndAtRestByGoogle':
    'Backups are encrypted in transit and at rest by Google Drive, but are not end-to-end encrypted.',
  'cloud.cloudRestoreStarted': 'Cloud restore started',
  'cloud.cloudSyncAttentionNeeded': 'Cloud sync: attention needed',
  'cloud.cloudSyncChangesSafelyQueued': 'Cloud sync: changes safely queued',
  'cloud.cloudSyncPaused': 'Cloud sync: paused',
  'cloud.cloudSyncSyncing': 'Cloud sync: syncing',
  'cloud.cloudSyncUpToDate': 'Cloud sync: up to date',
  'cloud.connectGoogleDrive': 'Connect Google Drive',
  'cloud.connecting': 'Connecting…',
  'cloud.createCloudBackup': 'Create cloud backup',
  'cloud.deleteCloudAndLocalJournalData': 'Delete cloud and local journal data',
  'cloud.deleteCloudBackup': 'Delete cloud backup',
  'cloud.deleteCloudBackup2': 'Delete cloud backup?',
  'cloud.deleteJournalEverywhere': 'Delete journal everywhere',
  'cloud.deleteJournalEverywhere2': 'Delete journal everywhere?',
  'cloud.deleteOrResetData': 'Delete or reset data',
  'cloud.deletingJournalEverywhere': 'Deleting journal everywhere…',
  'cloud.removingTheCloudBackupAndJournalDataKeepTackbokOpen':
    'Removing the cloud backup and journal data. Keep Tackbok open.',
  'cloud.disconnect': 'Disconnect',
  'cloud.disconnectProvider': 'Disconnect {provider}',
  'cloud.disconnectProviderFromThisDevice': 'Disconnect {provider} from this device?',
  'cloud.disconnectThenDeleteLocalJournalDataOnly':
    'Disconnect, then delete local journal data only',
  'cloud.editsRemainSafelyQueuedOnThisDevice':
    'Edits remain safely queued on this device.',
  'cloud.entry': 'Entry',
  'cloud.googleDrive': 'Google Drive',
  'cloud.googleDriveAccessIsRequiredTryAgainAndSelectThe':
    'Google Drive access is required. Try again and select the Drive access checkbox.',
  'cloud.googleDriveConnected': 'Google Drive connected',
  'cloud.googleDriveConnectionWasNotCompleted':
    'Google Drive connection was not completed',
  'cloud.googleDriveCouldNotBeReachedYourChangesRemainSafely':
    'Google Drive could not be reached. Your changes remain safely queued.',
  'cloud.photosAndVoiceMemosAreWaitingForWiFiYour':
    'Photos and voice notes are waiting for Wi-Fi. Your changes remain safely queued.',
  'cloud.googleDriveDisconnectedOnThisDevice': 'Google Drive disconnected on this device',
  'cloud.googleDriveIsBusyTryAgainShortly': 'Google Drive is busy. Try again shortly.',
  'cloud.googleDriveNeedsToBeReconnected': 'Google Drive needs to be reconnected.',
  'cloud.googleDriveReconnected': 'Google Drive reconnected',
  'cloud.googleDriveStorageIsFull': 'Google Drive storage is full.',
  'cloud.googleDriveStatus': 'Google Drive — {status}',
  'cloud.ifGoogleShowsADriveAccessCheckboxSelectItBackup':
    'If Google shows a Drive access checkbox, select it. Backup cannot connect without this permission.',
  'cloud.journalDeletionReceived': 'Journal deletion received',
  'cloud.journalTextStillSyncsOnMobileData': 'Journal text still syncs on mobile data.',
  'cloud.keepLocalDataAndTheCloudCopy': 'Keep local data and the cloud copy',
  'cloud.keepLocalJournalData': 'Keep local journal data',
  'cloud.keepTheCloudCopyAndOtherDevices': 'Keep the cloud copy and other devices',
  'cloud.lastSuccessfulSyncDate': 'Last successful sync: {date}',
  'cloud.localDataAndTheCloudBackupWillBothRemainOther':
    'Local data and the cloud backup will both remain. Other devices stay connected.',
  'cloud.markAsReviewed': 'Mark as reviewed',
  'cloud.mergingChangesAndUpdatingGoogleDrive':
    'Merging changes and updating Google Drive',
  'cloud.noTackbokBackupFoundInThisGoogleAccount':
    'No Tackbok backup found in this Google account',
  'cloud.noInternetConnectionYourChangesRemainSafelyQueued':
    'No internet connection. Your changes remain safely queued.',
  'cloud.noExistingTackbokBackupWasFoundCreateOneForThis':
    'No existing Tackbok backup was found. Create one for this journal.',
  'cloud.optionalCloudBackup': 'Optional cloud backup',
  'cloud.pauseSync': 'Pause sync',
  'cloud.preparingJournalChanges': 'Preparing journal changes',
  'cloud.preparingRestoredJournalData': 'Preparing restored journal data',
  'cloud.profile': 'Profile',
  'cloud.prompt': 'Prompt',
  'cloud.reconnectGoogleDrive': 'Reconnect Google Drive',
  'cloud.recoveredConflicts': 'Recovered conflicts',
  'cloud.recoveredConflictsMarkedAsReviewed': 'Recovered conflicts marked as reviewed',
  'cloud.recoveredTypeConflictCountPreservedAlternatives':
    'Recovered {type} conflict — {count} preserved alternatives',
  'cloud.resetThisDeviceOnly': 'Reset this device only',
  'cloud.resetThisDeviceOnly2': 'Reset this device only?',
  'cloud.merge': 'Merge',
  'cloud.restoreCloudBackup': 'Restore cloud backup',
  'cloud.restoreFromYourCloudBackup': 'Restore from your cloud backup',
  'cloud.restoring': 'Restoring…',
  'cloud.safelyQueued': 'Safely queued',
  'cloud.savingSyncedJournalDataOnThisDevice':
    'Saving synced journal data on this device',
  'cloud.setupElapsedSeconds': 'Elapsed time: {seconds} s',
  'cloud.setupProgressHelp':
    'Tackbok is connecting this device and starting the first sync. Large backups, photos, and voice notes can take longer.',
  'cloud.setupTakingLonger':
    'This is taking longer than usual. Check your internet connection and keep Tackbok open to let it continue.',
  'cloud.settingUpCloudSync': 'Setting up cloud sync…',
  'cloud.stepCurrentOfTotalInThisBatch': 'Step {current} of {total} in this batch',
  'cloud.syncCompleted': 'Sync completed',
  'cloud.syncNow': 'Sync now',
  'cloud.syncPaused': 'Sync paused',
  'cloud.syncResumed': 'Sync resumed',
  'cloud.syncRunsInSafeBatchesYouCanKeepUsingTackbok':
    'Sync runs in safe batches. You can keep using Tackbok.',
  'cloud.syncMediaOnWiFiOnly': 'Sync media on Wi-Fi only',
  'cloud.syncing': 'Syncing…',
  'cloud.theCloudCopyAndThisDevicesJournalWillBePermanently':
    'The cloud copy and this device’s journal will be permanently deleted. Other devices will delete their local journal when they sync.',
  'cloud.theCloudCopyWillBePermanentlyDeletedAfterVerificationLocal':
    'The cloud copy will be permanently deleted after verification. Local journal data remains.',
  'cloud.thisCloudBackupWasDeletedLocalJournalDataRemainsOn':
    'This cloud backup was deleted. Local journal data remains on this device.',
  'cloud.thisCloudBackupContainsDataTackbokCannotRead':
    'This cloud backup contains data Tackbok cannot read.',
  'cloud.finishDeletingThisJournal': 'Finish deleting this journal?',
  'cloud.cloudDeletionIsAlreadyRecordedEraseTheRemainingJournalData':
    'Cloud deletion is already recorded. Erase the remaining journal data from this device.',
  'cloud.finishDeletion': 'Finish deletion',
  'cloud.yourGoogleEmailIsStoredSecurelyOnThisDeviceTo':
    'Your Google email is stored securely on this device to identify the connected account, and deleted on Disconnect. It is never included in backups, logs, diagnostics, or analytics.',
  'cloud.thisDeviceDisconnectsFirstThenDeletesItsLocalJournalThe':
    'This device disconnects first, then deletes its local journal. The cloud backup and other devices remain.',
  'cloud.thisDeviceWasReset': 'This device was reset',
  'cloud.thisJournalWasDeletedEverywhereThisDeviceIsDisconnected':
    'This journal was deleted everywhere. This device is disconnected.',
  'cloud.upToDate': 'Up to date',
  'cloud.verifyBackupHealth': 'Verify backup health',
  'cloud.waitingForTheFirstSuccessfulSync': 'Waiting for the first successful sync',
  'cloud.youCanLeaveThisScreenSyncingResumesWhenTackbokIs':
    'You can leave this screen; syncing resumes when Tackbok is active.',
  'cloud.yourJournalStaysOnYourDeviceCloudBackupIsOptional':
    'Your journal stays on your device. Cloud backup is optional.',
  'cloud.countChangesSafelyQueued': '{count} changes safely queued',
  'cloud.countChangesRemaining': '{count} changes remaining',
  'cloud.googleDriveAuthorizationNeedsAttention':
    'Google Drive authorization needs attention.',
  'cloud.thisBackupBelongsToADifferentConnectedGoogleAccount':
    'This backup belongs to a different connected Google account.',
  'cloud.googleDrivePermissionWasNotFullyGranted':
    'Google Drive permission was not fully granted.',
  'cloud.theConnectedCloudBackupDoesNotMatchThisJournal':
    'The connected cloud backup does not match this journal.',
  'cloud.thisBackupWasCreatedByANewerTackbokVersion':
    'This backup was created by a newer Tackbok version.',
  'cloud.aCloudSnapshotFailedItsSafetyChecks':
    'A saved cloud backup did not pass safety checks.',
  'cloud.aDeviceBackupPointsToAMissingSnapshot':
    'A device backup refers to a saved backup that is missing.',
  'cloud.twoDifferentBackupsClaimTheSameDeviceVersion':
    'Two different backups claim the same device version.',
  'cloud.tooManyIndependentDeviceBackupsNeedConsolidation':
    'Too many separate device backups need to be combined.',
  'cloud.aRecoveredItemConflictsWithAnExistingStableIdentifier':
    'A recovered item has the same internal ID as an existing item.',
  'cloud.tackbokCouldNotSafelyStageBackupDataOnThisDevice':
    'Tackbok could not safely prepare backup data on this device.',
  'cloud.googleDriveDoesNotHaveEnoughFreeStorage':
    'Google Drive does not have enough free storage.',
  'cloud.googleDriveDeniedAccessToTheAppBackupFolder':
    'Google Drive denied access to the app backup folder.',
  'cloud.aReferencedPhotoOrVoiceMemoIsUnavailable':
    'A photo or voice note needed by the backup is unavailable.',
  'cloud.aLocalPhotoOrVoiceMemoCouldNotBeVerified':
    'A photo or voice note on this device could not be verified.',
  'cloud.yourJournalIsNotReadyForCloudSyncYet':
    'Your journal is not ready for cloud sync yet.',
  'cloud.thisCloudBackupWasDeletedFromAnotherDevice':
    'This cloud backup was deleted from another device.',
  'cloud.thisJournalWasDeletedEverywhereFromAnotherDevice':
    'This journal was deleted everywhere from another device.',
  'cloud.cloudDeletionStoppedBeforeEveryBackupObjectWasRemoved':
    'Cloud deletion stopped before all backup data was removed.',
  'cloud.backupCleanupWasStoppedToProtectACurrentSnapshot':
    'Backup cleanup stopped to protect a backup still in use.',
  'cloud.chooseTheConnectedAccount': 'Choose the connected account',
  'cloud.chooseAGoogleAccountToReconnect': 'Choose a Google account to reconnect',
  'cloud.finishConnection': 'Finish connection',
  'cloud.reconnectToTheCorrectBackup': 'Reconnect to the correct backup',
  'cloud.updateTackbok': 'Update Tackbok',
  'cloud.retryAndVerifyBackup': 'Retry and verify backup',
  'cloud.repairFromVerifiedBackup': 'Repair from verified backup',
  'cloud.inspectAndRepairBackup': 'Inspect and repair backup',
  'cloud.consolidateBackups': 'Combine backups',
  'cloud.exportJournalAndRepairBackup': 'Export journal and repair backup',
  'cloud.freeDeviceStorageAndRetry': 'Free device storage and retry',
  'cloud.manageGoogleDriveStorage': 'Manage Google Drive storage',
  'cloud.retryMissingMedia': 'Retry missing media',
  'cloud.locateOrRetryAttachment': 'Locate or retry attachment',
  'cloud.retryJournalPreparation': 'Retry journal preparation',
  'cloud.acknowledgeAndDisconnect': 'Acknowledge and disconnect',
  'cloud.reviewDeletionAndEraseThisDevice': 'Review deletion and erase this device',
  'cloud.resumeDeletion': 'Resume deletion',
  'cloud.cloudDeletionCompleted': 'Cloud deletion completed',
  'cloud.exportOrRepairTheAffectedJournalDataThenReturnAnd':
    'Export or repair the affected journal data, then return and retry.',
  'cloud.cloudBackupRetryCompleted': 'Cloud backup retry completed',
  'cloud.cloudSyncCouldNotFinishYourChangesRemainSafelyQueued':
    'Cloud sync could not finish. Your changes remain safely queued.',
  'cloud.googleDriveRejectedABackupRequestUpdateTackbokAndRetry':
    'Google Drive rejected a backup request. Update Tackbok and retry.',
  'time.hours': 'Hours',
  'time.minutes': 'Minutes',
  'common.databaseUpdateFailed': 'Could not update the journal database: {message}',
} satisfies Record<string, string>;
