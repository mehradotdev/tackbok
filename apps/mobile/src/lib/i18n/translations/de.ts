import type { Translations } from '../types';

/**
 * German (de) translations
 * Contains translations for all UI strings used in the application
 */
export const de: Translations = {
  // Cold-start header greeting
  'greeting.welcomeBack': 'Willkommen zurück',
  'greeting.goodMorning': 'Guten Morgen',
  'greeting.goodAfternoon': 'Guten Tag',
  'greeting.goodEvening': 'Guten Abend',
  'greeting.goodNight': 'Gute Nacht',
  'greeting.happySunday': 'Schönen Sonntag',
  'greeting.happyMonday': 'Schönen Montag',
  'greeting.happyTuesday': 'Schönen Dienstag',
  'greeting.happyWednesday': 'Schönen Mittwoch',
  'greeting.happyThursday': 'Schönen Donnerstag',
  'greeting.happyFriday': 'Schönen Freitag',
  'greeting.happySaturday': 'Schönen Samstag',
  'greeting.withName': '{greeting}, {name}',

  // Common
  'common.tackbok': 'Tackbok',
  'common.cancel': 'Abbrechen',
  'common.done': 'Fertig',
  'common.save': 'Speichern',
  'common.back': 'Zurück',
  'common.create': 'Erstellen',
  'common.discard': 'Verwerfen',
  'common.delete': 'Löschen',
  'common.remove': 'Entfernen',
  'common.close': 'Schließen',
  'common.play': 'Abspielen',
  'common.pause': 'Pause',
  'common.settings': 'Einstellungen',
  'common.shareFeedback': 'Feedback teilen',
  'common.contactUs': 'Kontakt',
  'common.unknownError': 'Unbekannter Fehler',
  'common.retry': 'Erneut versuchen',

  // Header & Search
  'search.searchGratitudeLogs': 'Einträge durchsuchen …',
  'search.startTypingToSearchYourGratitudeLogs':
    'Tippe etwas ein, um deine Einträge zu durchsuchen',
  'search.searchFailed': 'Suche fehlgeschlagen',
  'search.noResults': 'Keine Ergebnisse',

  // Gratitude
  'gratitude.whatAreYouGratefulForToday': 'Wofür bist du heute dankbar?',
  'gratitude.whatWereYouGratefulForYesterday': 'Wofür warst du gestern dankbar?',
  'gratitude.whatAreYouGratefulFor': 'Wofür bist du dankbar?',
  'gratitude.whatWereYouGratefulFor': 'Wofür warst du dankbar?',
  'gratitude.failedToLoadEntries': 'Einträge konnten nicht geladen werden',
  'gratitude.writeNow': 'Jetzt schreiben',
  'gratitude.pickADate': 'Datum auswählen',
  'gratitude.playWithPet': 'Mit dem Haustier spielen',
  'gratitude.collapseGratitudeActions': 'Dankbarkeitsaktionen einklappen',
  'gratitude.expandGratitudeActions': 'Dankbarkeitsaktionen ausklappen',

  // Date Entries
  'dateEntries.loading': 'Wird geladen …',
  'dateEntries.noEntriesForThisDate': 'Keine Einträge für dieses Datum',
  'dateEntries.createEntry': 'Eintrag erstellen',
  'dateEntries.somethingWentWrongCreatingNewEntry':
    'Etwas ist schiefgelaufen. Ein neuer Eintrag wird erstellt.',

  // Gratitude Entry
  'entry.deleteEntry': 'Eintrag löschen?',
  'entry.thisEntryWillBePermanentlyDeleted': 'Dieser Eintrag wird dauerhaft gelöscht.',
  'entry.entryNotFound': 'Eintrag nicht gefunden',
  'entry.leaveWithoutSaving': 'Ohne Speichern verlassen?',
  'entry.discardChanges.message':
    'Deine Änderungen wurden nicht gespeichert. Weiter bearbeiten oder Änderungen verwerfen?',
  'entry.keepEditing': 'Weiter bearbeiten',

  'entry.pickAnyDate': 'Beliebiges Datum auswählen',
  'entry.mood': 'Stimmung',
  'entry.photo': 'Foto',
  'entry.addPhoto': 'Foto hinzufügen',
  'entry.takePhoto': 'Foto aufnehmen',
  'entry.chooseFromLibrary': 'Aus Mediathek auswählen',
  'entry.maximumCountPhotosPerEntry': 'Maximal {count} Fotos pro Eintrag',
  'entry.maximumCountVoiceMemosPerEntry': 'Maximal {count} Sprachnotizen pro Eintrag',
  'entry.cameraAccessRequired': 'Kamerazugriff erforderlich',
  'entry.photoLibraryAccessRequired': 'Zugriff auf die Fotomediathek erforderlich',
  'entry.pleaseEnableCameraAccessInYourDeviceSettingsToTake':
    'Aktiviere in den Geräteeinstellungen den Kamerazugriff, um Fotos aufzunehmen.',
  'entry.pleaseEnablePhotoLibraryAccessInYourDeviceSettingsTo':
    'Aktiviere in den Geräteeinstellungen den Zugriff auf die Fotomediathek, um Fotos auszuwählen.',
  'entry.openSettings': 'Einstellungen öffnen',
  'entry.voice': 'Sprachnotiz',
  'entry.microphoneAccessRequired': 'Mikrofonzugriff erforderlich',
  'entry.pleaseEnableMicrophoneAccessInYourDeviceSettingsToRecord':
    'Aktiviere in den Geräteeinstellungen den Mikrofonzugriff, um Sprachnotizen aufzunehmen.',
  'entry.recordVoiceNote': 'Sprachnotiz aufnehmen',
  'entry.tapTheButtonBelowWhenReady':
    'Tippe auf die Schaltfläche unten, wenn du bereit bist.',
  'entry.startRecording': 'Aufnahme starten',
  'entry.recordingVoiceNote': 'Sprachnotiz wird aufgenommen …',
  'entry.stopRecording': 'Aufnahme beenden',
  'entry.voiceNoteRecorded': 'Sprachnotiz aufgenommen',
  'entry.tapOnThePlayButtonToListen': 'Tippe zum Anhören auf die Wiedergabetaste.',
  'entry.saveRecording': 'Aufnahme speichern',
  'entry.discardRecording': 'Aufnahme verwerfen',
  'entry.voiceNotesSaveAutomaticallyAt3000':
    'Sprachnotizen werden nach 30 Minuten automatisch gespeichert.',
  'entry.titleOptional': 'Titel (optional)',
  'entry.usePrompt': 'Schreibimpuls verwenden',
  'entry.newPrompt': 'Neuer Schreibimpuls',
  'entry.addPrompt': 'Schreibimpuls hinzufügen',
  'entry.showAll': 'Alle anzeigen',
  'entry.promptText': 'Text des Schreibimpulses',
  'entry.promptAlreadyExists': 'Schreibimpuls ist bereits vorhanden',
  'entry.promptCreated': 'Schreibimpuls erstellt',
  'entry.failedToCreatePrompt': 'Schreibimpuls konnte nicht erstellt werden',
  'entry.promptUpdated': 'Schreibimpuls aktualisiert',
  'entry.failedToUpdatePrompt': 'Schreibimpuls konnte nicht aktualisiert werden',
  'entry.promptDeleted': 'Schreibimpuls gelöscht',
  'entry.failedToDeletePrompt': 'Schreibimpuls konnte nicht gelöscht werden',
  'entry.faith': 'Glaube',
  'entry.self': 'Ich',
  'entry.health': 'Gesundheit',
  'entry.friends': 'Freunde',
  'entry.family': 'Familie',
  'entry.littleThings': 'Kleine Dinge',
  'entry.createPrompt': 'Schreibimpuls erstellen',
  'entry.createAPrompt': 'Schreibimpuls erstellen',
  'entry.editPrompt': 'Schreibimpuls bearbeiten',
  'entry.deletePrompt': 'Schreibimpuls löschen',
  'entry.deletePrompt2': 'Schreibimpuls löschen?',
  'entry.areYouSureYouWantToDeleteThisPrompt':
    'Möchtest du diesen Schreibimpuls wirklich löschen?',
  'entry.noPromptsYet': 'Noch keine Schreibimpulse',
  'entry.createYourFirstPrompt': 'Erstelle deinen ersten Schreibimpuls',

  // Prompts - Faith
  prompt_faith_1:
    'Was ist deine früheste Erinnerung daran, Gottes Gegenwart gespürt zu haben?',
  prompt_faith_2: 'Wo hast du in letzter Zeit Gnade in deinem Leben erfahren?',
  prompt_faith_3: 'Welches Gebet hat dir durch eine schwierige Zeit geholfen?',
  prompt_faith_4: 'Wie hat dein Glaube deine Sicht auf Herausforderungen verändert?',
  prompt_faith_5:
    'Welche spirituelle Praxis oder Gewohnheit schenkt dir am meisten Frieden?',
  prompt_faith_6:
    'Schreibe über einen Moment, in dem du dich eindeutig von einer höheren Macht geführt gefühlt hast.',
  prompt_faith_7:
    'Welche konkrete Lehre oder welches Zitat inspiriert dich in deinem Alltag?',
  prompt_faith_8:
    'Wie findest du inmitten einer hektischen Woche spirituelle Verbundenheit?',
  prompt_faith_9:
    'Denke an einen Moment zurück, in dem dein Glaube dir in einer unsicheren Zeit Trost gespendet hat.',

  // Prompts - Self
  prompt_self_1: 'Wovon brauchst du mehr in deinem Leben?',
  prompt_self_2: 'Was fiel dir schwer, aber du hast es trotzdem getan?',
  prompt_self_3: 'Was würdest du deinem jüngeren Ich heute sagen?',
  prompt_self_4:
    'Welche deiner jüngsten Leistungen hast du noch nicht gebührend gefeiert?',
  prompt_self_5: 'Schreibe drei Dinge auf, die du an deiner Persönlichkeit liebst.',
  prompt_self_6: 'Wie bist du an einem Fehler gewachsen, den du kürzlich gemacht hast?',
  prompt_self_7: 'Welche Grenze musst du setzen, um deine Energie zu schützen?',
  prompt_self_8: 'In welchem Lebensbereich fühlst du dich am authentischsten?',
  prompt_self_9: 'Beschreibe deinen idealen Tag vom Morgen bis zur Nacht.',

  // Prompts - Health
  prompt_health_1: 'Für welchen Teil deines Körpers bist du heute besonders dankbar?',
  prompt_health_2: 'Wie hat dir Ruhe in letzter Zeit geholfen?',
  prompt_health_3: 'Auf welche gesunde Gewohnheit bist du stolz?',
  prompt_health_4: 'Welche nahrhafte Mahlzeit tut dir immer gut?',
  prompt_health_5:
    'Beschreibe eine körperliche Aktivität, die dir Freude bereitet, statt sich wie eine Pflicht anzufühlen.',
  prompt_health_6: 'Woran merkst du, dass dein Körper Ruhe oder eine Pause braucht?',
  prompt_health_7: 'Was tust du heute für dein seelisches Wohlbefinden?',
  prompt_health_8:
    'Schreibe über eine Situation, in der du eine körperliche Herausforderung oder Verletzung überwunden hast.',
  prompt_health_9:
    'Mit welcher kleinen Änderung kannst du deine Schlafqualität verbessern?',

  // Prompts - Friends
  prompt_friends_1:
    'Welcher Freund oder welche Freundin hat dein Leben zuletzt leichter gemacht?',
  prompt_friends_2:
    'Welche Erinnerung mit einem Freund oder einer Freundin bringt dich noch immer zum Lächeln?',
  prompt_friends_3: 'Wem möchtest du diese Woche Mut machen?',
  prompt_friends_4:
    'Welche Eigenschaft schätzt du an deinen engsten Freundschaften am meisten?',
  prompt_friends_5:
    'Schreibe über jemanden, der dir geholfen hat, die Dinge aus einer anderen Perspektive zu betrachten.',
  prompt_friends_6:
    'Wie zeigst du deinen Freunden am liebsten deine Wertschätzung und Zuneigung?',
  prompt_friends_7:
    'Mit wem hast du schon länger nicht mehr gesprochen, und was würdest du dieser Person sagen?',
  prompt_friends_8:
    'Beschreibe ein lustiges oder unerwartetes Abenteuer mit einem Freund oder einer Freundin.',
  prompt_friends_9: 'Was hast du aus einer deiner Freundschaften gelernt?',

  // Prompts - Family
  prompt_family_1: 'Für welche Familientradition bist du dankbar?',
  prompt_family_2: 'Wer in deiner Familie hat dir etwas Bleibendes beigebracht?',
  prompt_family_3:
    'An welchen kleinen Moment mit deiner Familie möchtest du dich erinnern?',
  prompt_family_4: 'Welche Geschichte aus deiner Familie inspiriert dich?',
  prompt_family_5:
    'Wie hat sich deine Beziehung zu einem Familienmitglied im Laufe der Zeit entwickelt?',
  prompt_family_6:
    'Schreibe über eine Fähigkeit oder ein Rezept, das in deiner Familie weitergegeben wurde.',
  prompt_family_7:
    'Welche bestimmte Charaktereigenschaft teilst du mit einem Elternteil oder Geschwisterteil?',
  prompt_family_8:
    'Beschreibe eine Kindheitserinnerung, die dir noch immer große Freude bereitet.',
  prompt_family_9: 'Wie unterstützt sich deine Familie in schwierigen Zeiten?',

  // Prompts - Little Things
  prompt_littleThings_1: 'Was hat dich heute zum Lächeln gebracht?',
  prompt_littleThings_2: 'Welcher kleine Moment hat dich heute innehalten lassen?',
  prompt_littleThings_3: 'Welchen alltäglichen Komfort würdest du am meisten vermissen?',
  prompt_littleThings_4:
    'Beschreibe ein kleines, alltägliches Detail in deiner Umgebung, das du schön findest.',
  prompt_littleThings_5: 'Welches Geräusch hörst du morgens beim Aufwachen am liebsten?',
  prompt_littleThings_6:
    'Schreibe über eine einfache Freude, auf die du dich jeden Tag freust.',
  prompt_littleThings_7: 'Was war heute der schönste Teil deiner Morgenroutine?',
  prompt_littleThings_8:
    'Beschreibe eine kurze Begegnung mit einer fremden Person, die dir Freude bereitet hat.',
  prompt_littleThings_9: 'Welcher günstige Gegenstand bereichert dein Leben besonders?',

  // Default Worksheet Template Keys
  'worksheet.whatIAmGratefulForToday': 'Wofür ich heute dankbar bin …',
  'worksheet.myAffirmationForToday': 'Meine Affirmation für heute …',
  'worksheet.oneLittleThingThatMadeMeSmileRecently':
    'Eine Kleinigkeit, die mich kürzlich zum Lächeln gebracht hat …',

  // Moods
  'mood.amazing': 'Großartig',
  'mood.happy': 'Glücklich',
  'mood.okay': 'Okay',
  'mood.sad': 'Traurig',
  'mood.awful': 'Schrecklich',
  'mood.howAreYouFeeling': 'Wie fühlst du dich?',
  'mood.feelingAmazing': 'Fühle mich großartig',
  'mood.feelingHappy': 'Fühle mich glücklich',
  'mood.feelingOkay': 'Fühle mich okay',
  'mood.feelingSad': 'Fühle mich traurig',
  'mood.feelingAwful': 'Fühle mich schrecklich',
  'mood.entrySavedSuccessfully': 'Eintrag erfolgreich gespeichert',
  'mood.failedToSaveEntry': 'Eintrag konnte nicht gespeichert werden',
  'mood.failedToSaveVoiceMemo': 'Sprachnotiz konnte nicht gespeichert werden',
  'mood.failedToAddPhotos': 'Fotos konnten nicht hinzugefügt werden',
  'mood.failedToDeleteEntry': 'Eintrag konnte nicht gelöscht werden',
  'mood.tagAlreadyExists': 'Tag ist bereits vorhanden',
  'mood.tagCreated': 'Tag erstellt',
  'mood.failedToCreateTag': 'Tag konnte nicht erstellt werden',
  'mood.tagUpdated': 'Tag aktualisiert',
  'mood.failedToUpdateTag': 'Tag konnte nicht aktualisiert werden',
  'mood.tagDeleted': 'Tag gelöscht',
  'mood.failedToDeleteTag': 'Tag konnte nicht gelöscht werden',

  // Tags
  'tags.tag': 'Tag',
  'tags.tagName': 'Tag-Name',
  'tags.addATag': 'Tag hinzufügen',
  'tags.createNewTag': 'Tag erstellen',
  'tags.editTag': 'Tag bearbeiten',
  'tags.deleteTag': 'Tag löschen',
  'tags.areYouSureYouWantToDeleteTheTagTitle':
    'Möchtest du den Tag „{title}“ wirklich löschen?',

  // Milestones
  'milestone.daysOfGratitude': 'Tage der Dankbarkeit',

  // Settings - Profile
  'profile.yourName': 'Dein Name',
  'profile.changePhoto': 'Foto ändern',
  'profile.profilePhoto': 'Profilfoto',
  'profile.wouldYouLikeToUpdateOrRemoveYourProfilePhoto':
    'Möchtest du dein Profilfoto aktualisieren oder entfernen?',
  'profile.updatePhoto': 'Foto aktualisieren',
  'profile.removePhoto': 'Foto entfernen',

  // Settings
  'settings.language': 'Sprache',
  'settings.selectLanguage': 'Sprache auswählen',
  'settings.deviceDefault': 'Gerätestandard',
  'settings.restartRequired': 'Neustart erforderlich',
  'settings.languageChangeRequiresAppRestartProceed':
    'Zum Ändern der Sprache muss Tackbok neu gestartet werden. Fortfahren?',
  'settings.proceed': 'Fortfahren',
  'settings.reloadApp': 'App neu laden',

  // Settings - Notifications
  'notifications.notifications': 'Benachrichtigungen',
  'notifications.dailyReminder': 'Tägliche Erinnerung',
  'notifications.dailyReminderNotificationsAreOn': 'Tägliche Erinnerungen sind aktiviert',
  'notifications.dailyReminderNotificationsAreOff':
    'Tägliche Erinnerungen sind deaktiviert',
  'notifications.adjustReminderTime': 'Erinnerungszeit anpassen',
  'notifications.changeYourDailyReminderTime':
    'Ändere die Uhrzeit deiner täglichen Erinnerung',
  'notifications.failedToUpdateReminder': 'Erinnerung konnte nicht aktualisiert werden',
  'notifications.notificationPermissionNeeded':
    'Berechtigung für Benachrichtigungen erforderlich',
  'notifications.toGetDailyRemindersAllowNotificationsForTackbokInYour':
    'Erlaube Tackbok in deinen Geräteeinstellungen Benachrichtigungen, um tägliche Erinnerungen zu erhalten.',

  // Settings - Appearance
  'appearance.appearance': 'Darstellung',
  'appearance.theme': 'Design',
  'appearance.selectATheme': 'Design auswählen',
  'appearance.countThemesAndColorSchemes': '{count} Designs und Farbschemata',
  'appearance.timelineEntryLength': 'Länge der Zeitleisteneinträge',
  'appearance.numberOfLinesShownInTheTimeline':
    'Anzahl der angezeigten Zeilen in der Zeitleiste. Tippe auf einen Eintrag, um den vollständigen Text zu lesen.',
  'appearance.showTimelineBorders': 'Rahmen in der Zeitleiste anzeigen',
  'appearance.showTheBordersInTheTimeline': 'Rahmen in der Zeitleiste anzeigen',
  'appearance.hideTheBordersInTheTimeline': 'Rahmen in der Zeitleiste ausblenden',
  'appearance.dateStyle': 'Datumsformat',
  'appearance.dateIncludesDayOfTheWeek': 'Datum enthält den Wochentag',
  'appearance.firstDayOfWeek': 'Erster Wochentag',
  'appearance.setTheFirstDayOfTheWeekInTheCalendar':
    'Lege den ersten Wochentag in der Kalenderansicht fest',

  // Settings - Typography
  'typography.typography': 'Typografie',
  'typography.titleFont': 'Titelschrift',
  'typography.chooseAFontForTitlesAndHeadings':
    'Wähle eine Schriftart für Titel und Überschriften',
  'typography.default': 'Standard',
  'typography.themeDefault': 'Designstandard',
  'typography.fontSize': 'Schriftgröße',
  'typography.adjustTheSizeOfBodyText': 'Passe die Größe des Fließtexts an',
  'typography.small': 'Klein',
  'typography.large': 'Groß',
  'typography.previewOfTheSelectedFont': 'Vorschau der ausgewählten Schriftart',
  'typography.gratitudeMakesTodayBrighter': 'Dankbarkeit macht den heutigen Tag heller',

  // Settings - Journaling
  'journaling.journaling': 'Tagebuch',
  'journaling.editWorksheetTemplate': 'Arbeitsblattvorlage bearbeiten',
  'journaling.resetToDefault': 'Auf Standard zurücksetzen',
  'journaling.journalingWorksheet': 'Tagebuch-Arbeitsblatt',
  'journaling.startWriting': 'Losschreiben',
  'journaling.journalFocusAreas': 'Themenschwerpunkte',
  'journaling.personalizeYourJournalPrompts': 'Personalisiere deine Schreibimpulse.',
  'journaling.pickTheTopicsYouWantToWriteAbout':
    'Wähle die Themen aus, über die du schreiben möchtest.',
  'journaling.selectAtLeast2FocusAreas': 'Wähle mindestens 2 Themenschwerpunkte aus',
  'journaling.journalPrompts': 'Schreibimpulse',
  'journaling.chooseWhichPromptsToShowWhenStartingANewJournal':
    'Wähle aus, welche Schreibimpulse beim Erstellen eines neuen Tagebucheintrags angezeigt werden.',
  'journaling.off': 'Aus',
  'journaling.allPrompts': 'Alle Schreibimpulse',
  'journaling.myPrompts': 'Meine Schreibimpulse',
  'journaling.builtInPrompts': 'Integrierte Schreibimpulse',
  'journaling.focusareaSelfDesc':
    'Denke über deine Hobbys, Interessen, Erfahrungen und dein Leben im Allgemeinen nach.',
  'journaling.focusareaLittlethingsDesc':
    'Schätze die kleinen, oft übersehenen Freuden des Alltags.',
  'journaling.focusareaHealthDesc':
    'Schätze die vielen Vorzüge deines Körpers und seiner Fähigkeiten.',
  'journaling.focusareaFamilyDesc':
    'Schätze deine Familienmitglieder und die gemeinsam verbrachten Momente.',
  'journaling.focusareaFriendsDesc':
    'Schätze deine liebevollen, unterstützenden und verständnisvollen Freunde.',
  'journaling.focusareaFaithDesc':
    'Konzentriere dich auf die Wertschätzung deines Glaubens, deiner Spiritualität und deines inneren Friedens.',

  // Settings - Security
  'security.security': 'Sicherheit',
  'security.lockAfter': 'Sperren nach',
  'security.timeAwayFromTheAppBeforeRequiringAnUnlock':
    'Zeit außerhalb der App, bevor ein Entsperren erforderlich ist.',
  'security.0Seconds': '0 Sekunden',
  'security.30Seconds': '30 Sekunden',
  'security.1Minute': '1 Minute',
  'security.2Minutes': '2 Minuten',
  'security.unlockTackbok': 'Tackbok entsperren',
  'security.lockWithYourDeviceScreenLock':
    'Tackbok kann mit der Displaysperre deines Geräts geschützt werden – Biometrie, PIN, Muster oder Code',
  'security.unlock': 'Entsperren',
  'security.appLockUnavailable': 'App-Sperre nicht verfügbar',
  'security.setUpAScreenLockPinPatternOrBiometricsIn':
    'Richte zuerst in deinen Geräteeinstellungen eine Displaysperre (PIN, Muster oder Biometrie) ein.',

  // Settings - Backup & Restore
  'backup.backupRestore': 'Sichern & Wiederherstellen',
  'backup.googleDriveBackup': 'Google-Drive-Sicherung',
  'backup.exportAsZip': 'Als ZIP exportieren',
  'backup.allOfYourDataInAFormatThatYouCan':
    'Alle deine Daten in einem Format, das du später in der App wiederherstellen kannst',
  'backup.importAsZip': 'Aus ZIP importieren',
  'backup.restoreYourDataFromAZipFile':
    'Stelle deine Daten aus einer .zip-Datei wieder her',
  'backup.importFromGratitudeApp': 'Aus der Gratitude App importieren',
  'backup.importingFromGratitudeApp': 'Import aus der Gratitude App',
  'backup.importDataFromAGratitudeAppZipBackup':
    'Daten aus einer .zip-Sicherung der Gratitude App importieren',
  'backup.chooseImportMode': 'Importmodus auswählen',
  'backup.howShouldThisImportHandleEntriesThatAlreadyExistIn':
    'Wie soll dieser Import mit Einträgen umgehen, die bereits in Tackbok vorhanden sind?',
  'backup.skipExistingEntries': 'Vorhandene Einträge überspringen',
  'backup.skipExistingEntriesRecommended': 'Vorhandene Einträge überspringen (empfohlen)',
  'backup.onlyImportEntriesWithNewNoteIds':
    'Nur Einträge mit neuen Notiz-IDs importieren',
  'backup.overwriteMatchingEntries': 'Übereinstimmende Einträge überschreiben',
  'backup.replaceExistingEntriesWhenNoteIdsMatch':
    'Vorhandene Einträge ersetzen, wenn die Notiz-IDs übereinstimmen',
  'backup.importFromPresentlyApp': 'Aus der Presently App importieren',
  'backup.restoreYourDataFromAPresentlyCsvFile':
    'Stelle deine Daten aus einer .csv-Datei von Presently wieder her',
  'backup.importFromPresently': 'Aus Presently importieren?',
  'backup.thisWillImportEntriesFromAPresentlyAppCsvFile':
    'Dadurch werden Einträge aus einer CSV-Datei der Presently App importiert. Doppelte Einträge werden übersprungen.',
  'backup.backupExportedSuccessfully': 'Sicherung erfolgreich exportiert',
  'backup.exportFailed': 'Export fehlgeschlagen',
  'backup.importFailed': 'Import fehlgeschlagen',
  'backup.restoringTackbokBackup': 'Tackbok-Sicherung wird wiederhergestellt',
  'backup.loadPresentlyExport': 'Presently-Export laden',
  'backup.importJournalEntries': 'Tagebucheinträge importieren',
  'backup.openBackupFile': 'Sicherungsdatei öffnen',
  'backup.validateBackupContents': 'Sicherungsinhalt überprüfen',
  'backup.restoreProfile': 'Profil wiederherstellen',
  'backup.importTagsAndPrompts': 'Tags und Schreibimpulse importieren',
  'backup.restoreEntriesAndMedia': 'Einträge und Medien wiederherstellen',
  'backup.refreshJournalData': 'Tagebuchdaten aktualisieren',
  'backup.loadingTheSelectedImportFile': 'Die ausgewählte Importdatei wird geladen.',
  'backup.checkingBackupContentsAndFileStructure':
    'Sicherungsinhalt und Dateistruktur werden überprüft.',
  'backup.restoringProfileDetailsAndProfilePhotoIfAvailable':
    'Profildetails und Profilfoto werden wiederhergestellt, sofern verfügbar.',
  'backup.addingTagsAndPromptsBeforeEntriesAreRestored':
    'Tags und Schreibimpulse werden hinzugefügt, bevor die Einträge wiederhergestellt werden.',
  'backup.processingProcessedOfTotalJournalEntriesAndAttachedMedia':
    '{processed} von {total} Tagebucheinträgen und angehängten Medien werden verarbeitet.',
  'backup.noJournalEntriesFoundInThisBackup':
    'In dieser Sicherung wurden keine Tagebucheinträge gefunden.',
  'backup.refreshingYourJournalSoImportedDataAppearsEverywhere':
    'Dein Tagebuch wird aktualisiert, damit die importierten Daten überall angezeigt werden.',
  'backup.entriesProcessed': 'Verarbeitete Einträge',
  'backup.entriesSkippedDueToErrors': 'Wegen Fehlern übersprungene Einträge',
  'backup.pleaseDoNotCloseOrMinimizeTheAppWhileThe':
    'Bitte schließe oder minimiere die App nicht, solange der Import läuft.',
  'backup.tagsAdded': 'Hinzugefügte Tags',
  'backup.promptsAdded': 'Hinzugefügte Schreibimpulse',
  'backup.photosRestored': 'Wiederhergestellte Fotos',
  'backup.voiceMemosRestored': 'Wiederhergestellte Sprachnotizen',
  'backup.mediaSkipped': 'Übersprungene Medien',
  'backup.tackbokBackupRestored': 'Tackbok-Sicherung wiederhergestellt',
  'backup.gratitudeImportComplete': 'Gratitude-Import abgeschlossen',
  'backup.presentlyImportComplete': 'Presently-Import abgeschlossen',
  'backup.yourJournalDataIsReadyToReviewButSomeItems':
    'Deine Tagebuchdaten können jetzt überprüft werden, einige Elemente konnten jedoch nicht wiederhergestellt werden.',
  'backup.yourJournalDataIsReadyToReview':
    'Deine Tagebuchdaten können jetzt überprüft werden.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe':
    'Dieser Import wurde mit Warnungen abgeschlossen. Einige Elemente konnten nicht wiederhergestellt werden und alles andere war bereits in Tackbok vorhanden.',
  'backup.thisImportFinishedButEverythingAlreadyExistedInTackbok':
    'Dieser Import ist abgeschlossen, aber alles war bereits in Tackbok vorhanden.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe2':
    'Dieser Import wurde mit Warnungen abgeschlossen. Einige Elemente konnten nicht wiederhergestellt werden.',
  'backup.thisImportFinishedSuccessfully':
    'Dieser Import wurde erfolgreich abgeschlossen.',
  'backup.importedFromTackbokBackup': 'Aus Tackbok-Sicherung importiert',
  'backup.importedFromGratitudeBackup': 'Aus Gratitude-Sicherung importiert',
  'backup.importedFromPresentlyExport': 'Aus Presently-Export importiert',
  'backup.newEntries': 'Neue Einträge',
  'backup.updatedEntries': 'Aktualisierte Einträge',
  'backup.skippedDuplicates': 'Übersprungene Duplikate',
  'backup.import': 'Importieren',

  // Settings - App Information
  'appInfo.appInformation': 'App-Informationen',
  'appInfo.faq': 'FAQ',
  'appInfo.readFrequentlyAskedQuestions': 'Häufig gestellte Fragen zu Tackbok lesen',
  'appInfo.shareTackbok': 'Tackbok teilen',
  'appInfo.shareTheAppWithFriendsAndFamily':
    'Gefällt dir Tackbok? Teile die App mit Freunden und Familie',
  'appInfo.practiceGratitudeWithTackbokASimpleFreeAndPrivateGratitude':
    'Übe Dankbarkeit mit Tackbok, einer einfachen, kostenlosen und privaten Dankbarkeitstagebuch-App',
  'appInfo.supportTackbok': 'Tackbok unterstützen',
  'appInfo.tackbokIsFreeToUseAndThatsNotChangingIf':
    'Tackbok ist kostenlos, und das wird sich nicht ändern. Wenn es etwas mehr Dankbarkeit in deinen Tag gebracht hat, kannst du es gerne unterstützen, auch wenn es nichts freizuschalten gibt. Alle bekommen dieselbe App.',
  'appInfo.keepingTackbokRunningCurrentlyCostsAboutUs3325Per':
    'Der Betrieb von Tackbok kostet derzeit etwa 33,25 US$ pro Monat, vor Steuern, Gebühren und nutzungsabhängigen Mehrkosten. Wenn Tackbok für dich wertvoll ist, hilft selbst ein kleiner Beitrag, die App für alle kostenlos zu halten.',
  'appInfo.waysToSupport': 'Möglichkeiten zur Unterstützung',
  'appInfo.free': 'Kostenlos',
  'appInfo.smallThanks': 'Kleines Dankeschön',
  'appInfo.helpsMeFinishWork10MinutesEarlier':
    'Hilft mir, den Arbeitstag 10 Minuten früher zu beenden',
  'appInfo.heartfeltThanks': 'Herzliches Dankeschön',
  'appInfo.helpsPayForHostingAndOnlineServices':
    'Hilft, Hosting und Online-Dienste zu bezahlen',
  'appInfo.bigThanks': 'Großes Dankeschön',
  'appInfo.helpsTestAndReleaseTackbokUpdates':
    'Hilft, Tackbok-Updates zu testen und zu veröffentlichen',
  'appInfo.deepestThanks': 'Allergrößtes Dankeschön',
  'appInfo.helpsCoverOneMonthOfTackboksRunningCostsAndOngoing':
    'Hilft, einen Monat der laufenden Kosten und Weiterentwicklung von Tackbok zu decken',
  'appInfo.unavailable': 'Nicht verfügbar',
  'appInfo.supportOptionsCouldNotBeLoadedPleaseTryAgain':
    'Die Unterstützungsoptionen konnten nicht geladen werden. Bitte versuche es erneut.',
  'appInfo.youAppearToBeOfflineCheckYourConnectionAndTry':
    'Du scheinst offline zu sein. Prüfe deine Verbindung und versuche es erneut.',
  'appInfo.thePurchaseCouldNotBeCompletedPleaseTryAgain':
    'Der Kauf konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
  'appInfo.paymentSuccessful': 'Zahlung erfolgreich',
  'appInfo.thankYou': 'Danke!',
  'appInfo.yourSupportHelpsKeepTackbokFreeAndIndependentItGenuinely':
    'Deine Unterstützung hilft, Tackbok kostenlos und unabhängig zu halten. Das bedeutet uns wirklich viel.',
  'appInfo.thankYouForSupportingTackbokItGenuinelyMeansALot':
    'Danke, dass du Tackbok unterstützt. Das bedeutet uns wirklich viel.',
  'appInfo.yourPaymentIsPendingTheStoreWillFinishItWhen':
    'Deine Zahlung steht aus. Der Store schließt sie ab, sobald die Genehmigung oder Zahlung erfolgt ist.',
  'appInfo.whereYourSupportHelps': 'Wobei deine Unterstützung hilft',
  'appInfo.cloudflareWorkers': 'Cloudflare Workers',
  'appInfo.expoEas': 'Expo EAS',
  'appInfo.appleDeveloperMembership': 'Apple-Developer-Mitgliedschaft',
  'appInfo.tackbokOrgDomain': 'tackbok.org-Domain',
  'appInfo.googlePlayRegistration': 'Google-Play-Registrierung',
  'appInfo.monthlyBaseline': 'Monatliche Grundkosten',
  'appInfo.us5Month': '5 US$/Monat',
  'appInfo.us19Month': '19 US$/Monat',
  'appInfo.us99Year': '99 US$/Jahr',
  'appInfo.us12Year': '12 US$/Jahr',
  'appInfo.us25OneTime': 'einmalig 25 US$',
  'appInfo.aboutUs3325': 'Etwa 33,25 US$',
  'appInfo.rateTackbok': 'Tackbok bewerten',
  'appInfo.leaveAnHonestRatingInTheAppStore':
    'Eine ehrliche Bewertung im App Store hinterlassen',
  'appInfo.unableToOpenTheStore': 'Store kann nicht geöffnet werden',
  'appInfo.confirmTier': '{tier} bestätigen',
  'appInfo.theStoreWillChargePriceForThisVoluntaryOneTime':
    'Der Store berechnet {price} für diese freiwillige, einmalige Unterstützung. Sie schaltet keine Funktionen frei und kann erneut gekauft werden.',
  'appInfo.privacyPolicy': 'Datenschutzerklärung',
  'appInfo.readOurPrivacyPolicy': 'Datenschutzerklärung von Tackbok lesen',
  'appInfo.termsConditions': 'Allgemeine Geschäftsbedingungen',
  'appInfo.readOurTermsAndConditions': 'Unsere allgemeinen Geschäftsbedingungen lesen',
  'appInfo.analytics': 'Erfassung von Analysedaten',
  'appInfo.collectingAnonymizedAnalyticsToHelpDiagnoseProblems':
    'Tackbok erfasst anonymisierte Analysedaten, um Probleme zu erkennen und Trends zu beobachten',
  'appInfo.checkForUpdates': 'Nach Updates suchen',
  'appInfo.checkingForUpdates': 'Updates werden gesucht …',
  'appInfo.lastCheckedTime': 'Zuletzt geprüft: {time}',
  'appInfo.never': 'Nie',
  'appInfo.restart': 'Neu starten',
  'appInfo.restartToApply': 'Zum Anwenden neu starten',
  'appInfo.updateDownloadedRestartToApplyIt':
    'Update heruntergeladen. Starte die App neu, um es anzuwenden.',
  'appInfo.youAlreadyHaveTheLatestVersion': 'Du hast bereits die neueste Version',
  'appInfo.unableToUpdate': 'Update nicht möglich',
  'appInfo.version': 'Versionsnummer',

  // Settings - Danger Zone
  'dangerZone.dangerZone': 'Gefahrenbereich',
  'dangerZone.deleteAllData': 'Alle Daten löschen',
  'dangerZone.deleteAllData2': 'Alle Daten löschen?',
  'dangerZone.permanentlyDeleteAllYourAppData': 'Alle deine App-Daten dauerhaft löschen',
  'dangerZone.thisActionCannotBeUndoneAllYourAppDataWill':
    'Diese Aktion kann nicht rückgängig gemacht werden. Alle deine App-Daten werden dauerhaft gelöscht.',
  'dangerZone.allDataDeleted': 'Alle Daten gelöscht',
  'dangerZone.allDataDeletedButSomeMediaFilesCouldNotBe':
    'Alle Daten wurden gelöscht, aber einige Mediendateien konnten nicht entfernt werden.',
  'dangerZone.deleteFailed': 'Löschen fehlgeschlagen',

  // Time Picker
  'time.selectTime': 'Uhrzeit auswählen',

  // Date Picker
  'calendar.today': 'Heute',
  'calendar.yesterday': 'Gestern',
  'calendar.previousMonth': 'Vorheriger Monat',
  'calendar.nextMonth': 'Nächster Monat',
  'calendar.selectMonth': 'Monat auswählen',
  'calendar.selectYear': 'Jahr auswählen',
  'calendar.random': 'Zufällig',
  'calendar.openARandomEntry': 'Einen zufälligen Eintrag öffnen',
  'calendar.sun': 'So',
  'calendar.mon': 'Mo',
  'calendar.tue': 'Di',
  'calendar.wed': 'Mi',
  'calendar.thu': 'Do',
  'calendar.fri': 'Fr',
  'calendar.sat': 'Sa',
  'calendar.sunday': 'Sonntag',
  'calendar.monday': 'Montag',
  'calendar.tuesday': 'Dienstag',
  'calendar.wednesday': 'Mittwoch',
  'calendar.thursday': 'Donnerstag',
  'calendar.friday': 'Freitag',
  'calendar.saturday': 'Samstag',
  'calendar.january': 'Januar',
  'calendar.february': 'Februar',
  'calendar.march': 'März',
  'calendar.april': 'April',
  'calendar.may': 'Mai',
  'calendar.june': 'Juni',
  'calendar.july': 'Juli',
  'calendar.august': 'August',
  'calendar.september': 'September',
  'calendar.october': 'Oktober',
  'calendar.november': 'November',
  'calendar.december': 'Dezember',
  'calendar.jan': 'Jan',
  'calendar.feb': 'Feb',
  'calendar.mar': 'Mär',
  'calendar.apr': 'Apr',
  'calendar.may2': 'Mai',
  'calendar.jun': 'Jun',
  'calendar.jul': 'Jul',
  'calendar.aug': 'Aug',
  'calendar.sep': 'Sep',
  'calendar.oct': 'Okt',
  'calendar.nov': 'Nov',
  'calendar.dec': 'Dez',

  // Onboarding
  'onboarding.skip': 'Überspringen',
  'onboarding.continue': 'Weiter',
  'onboarding.next': 'Weiter',
  'onboarding.stepCurrentOfTotal': 'Schritt {current} von {total}',
  'onboarding.getStarted': 'Loslegen',
  'onboarding.alreadyHaveAJournalImportIt': 'Du hast bereits ein Tagebuch? Importiere es',
  'onboarding.aPrivatePlaceForYourGratitudeFreeOfflineYours':
    'Ein privater Ort für deine Dankbarkeit. Kostenlos, offline und ganz für dich.',
  'onboarding.importYourJournal': 'Dein Tagebuch importieren',
  'onboarding.whereIsYourJournalComingFrom': 'Woher stammt dein Tagebuch?',
  'onboarding.tackbokBackup': 'Tackbok-Sicherung',
  'onboarding.gratitudeApp': 'Gratitude App',
  'onboarding.presentlyApp': 'Presently App',
  'onboarding.whatShouldWeCallYou': 'Wie dürfen wir dich nennen?',
  'onboarding.yourNameIsOnlyUsedToGreetYouInsideThe':
    'Dein Name wird nur verwendet, um dich in der App zu begrüßen.',
  'onboarding.yourNameOptional': 'Dein Name (optional)',
  'onboarding.staysOnYourDevice': 'Bleibt auf deinem Gerät.',
  'onboarding.makeItYours': 'Gestalte es nach deinen Wünschen',
  'onboarding.pickALookYouCanChangeEverythingLaterInSettings':
    'Wähle ein Aussehen – du kannst später in den Einstellungen alles ändern.',
  'onboarding.aWalkInTheMorningSun': 'Ein Spaziergang in der Morgensonne',
  'onboarding.gratefulForQuietStreetsWarmCoffeeAndASkyFull':
    'Dankbar für ruhige Straßen, warmen Kaffee und einen farbenfrohen Himmel.',
  'onboarding.moreThemes': 'Weitere Designs …',
  'onboarding.whatDoYouWantToBeMoreGratefulFor': 'Wofür möchtest du dankbarer sein?',
  'onboarding.wellSuggestWritingPromptsFromTheAreasYouPick':
    'Wir schlagen dir Schreibimpulse aus den ausgewählten Bereichen vor.',
  'onboarding.pickAtLeastCount': 'Wähle mindestens {count} aus',
  'onboarding.helpImproveTackbok': 'Tackbok verbessern helfen?',
  'onboarding.tackbokIsFreeAndOpenSourceAnonymousStatsHelpUs':
    'Tackbok ist kostenlos und Open Source. Anonyme Statistiken helfen uns, Fehler zu finden und zu erkennen, welche Funktionen wichtig sind.',
  'onboarding.anonymousUsageStatsOnlyIncludingWhichScreensAndFeaturesGet':
    'Nur anonyme Nutzungsstatistiken – welche Ansichten und Funktionen verwendet werden.',
  'onboarding.neverYourJournalContentPhotosVoiceMemosOrAnythingYou':
    'Niemals deine Tagebuchinhalte, Fotos, Sprachnotizen oder andere Eingaben.',
  'onboarding.openSourceTheExactEventListIsPublicInThe':
    'Open Source – die genaue Ereignisliste ist im Repository öffentlich.',
  'onboarding.seeExactlyWhatWeCollect': 'Genau ansehen, was wir erfassen',
  'onboarding.shareAnonymousStats': 'Anonyme Statistiken teilen',
  'onboarding.noThanks': 'Nein, danke',
  'onboarding.whatWeCollect': 'Was wir erfassen',
  'onboarding.withYourPermissionTackbokRecordsLimitedAnonymousUsageInformationThis':
    'Mit deiner Zustimmung erfasst Tackbok nur begrenzte, anonyme Nutzungsinformationen. Dazu können besuchte Bildschirme, verwendete Funktionen und der Erfolg optionaler Vorgänge gehören. Deine Tagebuchinhalte oder Eingaben werden niemals erfasst.',
  'onboarding.auditTheAnalyticsCodeOnGithub': 'Analysecode auf GitHub prüfen',
  'onboarding.neverCollected': 'Wird niemals erfasst',
  'onboarding.yourJournalTextTitlesPhotosVoiceMemosTagsNameEmail':
    'Deine Tagebuchtexte, Titel, Fotos, Sprachnotizen, Tags, dein Name, deine E-Mail-Adresse oder andere Eingaben. Keine Werbung, kein Datenverkauf und kein Tracking durch Dritte.',
  'onboarding.youreAllSetName': 'Alles ist bereit, {name}!',
  'onboarding.youreAllSet': 'Alles ist bereit!',
  'onboarding.twoLastThingsYouCanTurnOnBothAreOptional':
    'Du kannst noch zwei Dinge aktivieren – beide sind optional.',
  'onboarding.addExampleEntries': 'Beispieleinträge hinzufügen',
  'onboarding.aFewSampleEntriesShowHowPhotosVoiceMemosMoods':
    'Einige Beispieleinträge zeigen, wie Fotos, Sprachnotizen, Stimmungen und Tags funktionieren. Du kannst sie jederzeit mit einem Tippen entfernen.',
  'onboarding.remindMeDaily': 'Täglich erinnern',
  'onboarding.aGentleNudgeToWriteNeverYourJournalContent':
    'Ein sanfter Anstoß zum Schreiben – ohne deine Tagebuchinhalte.',
  'onboarding.remindMeAtTime': 'Um {time} erinnern',
  'onboarding.settingThingsUp': 'Alles wird eingerichtet …',
  'onboarding.startJournaling': 'Tagebuch starten',
  'onboarding.showingExampleEntries': 'Beispieleinträge werden angezeigt',
  'onboarding.removeAll': 'Alle entfernen',
  'onboarding.hideThisBanner': 'Diesen Hinweis ausblenden',
  'onboarding.exampleEntriesRemoved': 'Beispieleinträge entfernt',
  'onboarding.failedToRemoveExampleEntries':
    'Beispieleinträge konnten nicht entfernt werden',
  'onboarding.addTodaysEntryHere': 'Füge hier den heutigen Eintrag hinzu.',
  'onboarding.pressAndHoldThenDragToMoveTheseButtonsAlong':
    'Halte die Schaltflächen gedrückt und ziehe sie dann am Rand entlang, um sie zu verschieben.',
  'onboarding.tapAnEntryToViewOrEditIt':
    'Tippe auf einen Eintrag, um ihn anzusehen oder zu bearbeiten.',
  'onboarding.findMemoriesByTextOrTag': 'Finde Erinnerungen nach Text oder Tag.',
  'onboarding.replayOnboarding': 'Einführung wiederholen',
  'onboarding.runTheWelcomeSetupAgain': 'Willkommenseinrichtung erneut ausführen',
  'onboarding.replayOnboarding2': 'Einführung wiederholen?',
  'onboarding.theWelcomeSetupWillStartAgainYourJournalEntriesAnd':
    'Die Willkommenseinrichtung wird erneut gestartet. Deine Tagebucheinträge und Einstellungen bleiben erhalten.',
  'onboarding.replay': 'Wiederholen',

  // Onboarding sample entries (seeded content)
  sample_tag_family: 'Familie',
  sample_tag_littleThings: 'Kleine Dinge',
  sample_entry_welcome_title: 'Willkommen bei Tackbok 👋',
  sample_entry_welcome_body:
    'Dies ist dein Dankbarkeitstagebuch – ein Ort für die schönen Momente. Tippe auf die Schaltfläche +, um eine Zeile oder eine ganze Seite zu schreiben, einmal am Tag oder wann immer du möchtest. Tippe auf diese Karte, um den vollständigen Eintrag zu sehen.',
  sample_entry_photos_title: 'Kleine Momente',
  sample_entry_photos_body:
    'Du kannst Fotos an eine Erinnerung anhängen – tippe zum Vergrößern auf ein Foto.',
  sample_entry_voice_title: 'In meinen eigenen Worten',
  sample_entry_voice_body:
    'Manchmal ist es einfacher, etwas laut auszusprechen. Tippe auf „Abspielen“, um eine kurze Sprachnotiz anzuhören.',
  sample_entry_tags_body:
    'Dieser Eintrag beantwortet einen der Schreibimpulse und enthält zwei Tags. Nutze die Suche oben und filtere nach Tags, um ihn wiederzufinden.',

  // Insights
  'insights.insights': 'Einblicke',
  'insights.overview': 'Überblick',
  'insights.gratitudeScore': 'Dankbarkeits-Score',
  'insights.currentStreak': 'Aktuelle Serie',
  'insights.longestStreak': 'Längste Serie',
  'insights.daysJournaled': 'Tage mit Einträgen',
  'insights.consistency': 'Beständigkeit',
  'insights.entries': 'Einträge',
  'insights.less': 'Weniger',
  'insights.more': 'Mehr',
  'insights.yourHappiestDayIsWeekday': 'Dein glücklichster Tag ist {weekday}',
  'insights.moodOverTime': 'Stimmung im Zeitverlauf',
  'insights.writingHabits': 'Schreibgewohnheiten',
  'insights.morning': 'Morgens',
  'insights.afternoon': 'Nachmittags',
  'insights.evening': 'Abends',
  'insights.night': 'Nachts',
  'insights.youreAMorningWriter': 'Du schreibst am liebsten morgens',
  'insights.youreAnAfternoonWriter': 'Du schreibst am liebsten nachmittags',
  'insights.youreAnEveningWriter': 'Du schreibst am liebsten abends',
  'insights.youreANightWriter': 'Du schreibst am liebsten nachts',
  'insights.entriesPerMonth': 'Einträge pro Monat',
  'insights.topTags': 'Top-Tags',
  'insights.totals': 'Gesamt',
  'insights.words': 'Wörter',
  'insights.characters': 'Zeichen',
  'insights.photos': 'Fotos',
  'insights.voiceMemos': 'Sprachnotizen',
  'insights.yourMemories': 'Deine Erinnerungen',
  'insights.onThisDay': 'An diesem Tag',
  'insights.oneYearAgoToday': 'Heute vor einem Jahr',
  'insights.oneMonthAgoToday': 'Heute vor einem Monat',
  'insights.countYearsAgoToday': 'Heute vor {count} Jahren',
  'insights.aMomentFromThisDay': 'Ein Moment dieses Tages',
  'insights.noInsightsYet': 'Noch keine Einblicke',
  'insights.writeAFewEntriesAndYourStatsWillShowUp':
    'Schreibe ein paar Einträge und deine Statistiken erscheinen hier.',

  // Teilen und Erfolge
  'sharing.shareYourGratitude': 'Teile deine Dankbarkeit',
  'sharing.iWasGratefulFor': 'Ich war dankbar für',
  'sharing.shareImage': 'Bild teilen',
  'sharing.shareEntry': 'Eintrag teilen',
  'sharing.includeMood': 'Stimmung einbeziehen',
  'sharing.moodIsHiddenUnlessYouIncludeIt':
    'Die Stimmung bleibt verborgen, wenn du sie nicht einbeziehst',
  'sharing.includePhotos': 'Fotos einbeziehen',
  'sharing.upToTheFirstFivePhotosWillBeShared':
    'Bis zu den ersten fünf Fotos werden geteilt',
  'sharing.chooseAStyle': 'Stil auswählen',
  'sharing.sharingIsNotAvailableOnThisDevice':
    'Teilen ist auf diesem Gerät nicht verfügbar',
  'sharing.couldNotShareImagePleaseTryAgain':
    'Das Bild konnte nicht geteilt werden. Bitte versuche es erneut.',
  'sharing.themeTheme': 'Design {theme}',
  'sharing.themeThemeSelected': 'Design {theme}, ausgewählt',
  'sharing.dayOneComplete': 'Tag eins geschafft!',
  'sharing.aBeautifulBeginningKeepNoticingTheGood':
    'Ein schöner Anfang. Nimm weiterhin das Gute wahr.',
  'sharing.countDaysOfGratitude': '{count} Tage Dankbarkeit!',
  'sharing.congratulationsOnMakingGratitudePartOfYourJourney':
    'Glückwunsch, dass Dankbarkeit Teil deines Weges ist.',
  'sharing.shareAchievement': 'Erfolg teilen',
  'sharing.openCountDayAchievement': 'Erfolg für {count} Tage öffnen',

  // Date Format Patterns (placeholders: {weekday}, {month}, {day}, {year})
  'dateFormat.timeLabel': '{weekday} um {time}',

  // Cloud Backup & Sync
  'cloud.attentionNeeded': 'Aktion erforderlich',
  'cloud.backUpAndSyncYourJournalWithYourOwnGoogle':
    'Sichere und synchronisiere dein Tagebuch mit deinem eigenen Google Drive. Es wird kein Tackbok-Konto erstellt.',
  'cloud.backupFromDate': 'Sicherung vom {date}',
  'cloud.beforeYouConnect': 'Vor dem Verbinden',
  'cloud.checkingGoogleDriveForChanges': 'Google Drive wird auf Änderungen geprüft',
  'cloud.chooseABackupToMergeWithThisJournalBothSides':
    'Wähle eine Sicherung, die mit diesem Tagebuch zusammengeführt wird. Beide Seiten bleiben erhalten.',
  'cloud.chooseABackupToRestoreOnThisDevice':
    'Wähle eine Sicherung zur Wiederherstellung auf diesem Gerät.',
  'cloud.chooseWhichCopiesOfYourJournalToRemove':
    'Wähle aus, welche Kopien deines Tagebuchs entfernt werden sollen.',
  'cloud.cloudBackupSync': 'Cloud-Sicherung & Synchronisierung',
  'cloud.cloudBackupConnected': 'Cloud-Sicherung verbunden',
  'cloud.cloudBackupCouldNotBeUpdated':
    'Cloud-Sicherung konnte nicht aktualisiert werden',
  'cloud.cloudBackupDeleted': 'Cloud-Sicherung gelöscht',
  'cloud.cloudBackupDeletionReceived': 'Löschung der Cloud-Sicherung empfangen',
  'cloud.cloudBackupNumber': 'Cloud-Sicherung {number}',
  'cloud.backupsAreEncryptedInTransitAndAtRestByGoogle':
    'Backups werden bei der Übertragung und im Ruhezustand von Google Drive verschlüsselt, sind aber nicht Ende-zu-Ende verschlüsselt.',
  'cloud.cloudRestoreStarted': 'Cloud-Wiederherstellung gestartet',
  'cloud.cloudSyncAttentionNeeded': 'Cloud-Synchronisierung: Aktion erforderlich',
  'cloud.cloudSyncChangesSafelyQueued':
    'Cloud-Synchronisierung: Änderungen sicher vorgemerkt',
  'cloud.cloudSyncPaused': 'Cloud-Synchronisierung: pausiert',
  'cloud.cloudSyncSyncing': 'Cloud-Synchronisierung: läuft',
  'cloud.cloudSyncUpToDate': 'Cloud-Synchronisierung: aktuell',
  'cloud.connectGoogleDrive': 'Google Drive verbinden',
  'cloud.connecting': 'Verbindung wird hergestellt…',
  'cloud.createCloudBackup': 'Cloud-Sicherung erstellen',
  'cloud.deleteCloudAndLocalJournalData': 'Cloud- und lokale Tagebuchdaten löschen',
  'cloud.deleteCloudBackup': 'Cloud-Sicherung löschen',
  'cloud.deleteCloudBackup2': 'Cloud-Sicherung löschen?',
  'cloud.deleteJournalEverywhere': 'Tagebuch überall löschen',
  'cloud.deleteJournalEverywhere2': 'Tagebuch überall löschen?',
  'cloud.deleteOrResetData': 'Daten löschen oder zurücksetzen',
  'cloud.deletingJournalEverywhere': 'Tagebuch wird überall gelöscht…',
  'cloud.removingTheCloudBackupAndJournalDataKeepTackbokOpen':
    'Cloud-Sicherung und Tagebuchdaten werden gelöscht. Lass Tackbok geöffnet.',
  'cloud.disconnect': 'Trennen',
  'cloud.disconnectProvider': '{provider} trennen',
  'cloud.disconnectProviderFromThisDevice': '{provider} von diesem Gerät trennen?',
  'cloud.disconnectThenDeleteLocalJournalDataOnly':
    'Trennen und dann nur lokale Tagebuchdaten löschen',
  'cloud.editsRemainSafelyQueuedOnThisDevice':
    'Änderungen bleiben auf diesem Gerät sicher vorgemerkt.',
  'cloud.entry': 'Eintrag',
  'cloud.googleDrive': 'Google Drive',
  'cloud.googleDriveAccessIsRequiredTryAgainAndSelectThe':
    'Google-Drive-Zugriff ist erforderlich. Versuche es erneut und wähle das Kontrollkästchen für den Drive-Zugriff aus.',
  'cloud.googleDriveConnected': 'Google Drive verbunden',
  'cloud.googleDriveConnectionWasNotCompleted':
    'Google-Drive-Verbindung wurde nicht abgeschlossen',
  'cloud.googleDriveCouldNotBeReachedYourChangesRemainSafely':
    'Google Drive konnte nicht erreicht werden. Deine Änderungen bleiben sicher in der Warteschlange.',
  'cloud.photosAndVoiceMemosAreWaitingForWiFiYour':
    'Fotos und Sprachnotizen warten auf WLAN. Deine Änderungen bleiben sicher in der Warteschlange.',
  'cloud.googleDriveDisconnectedOnThisDevice': 'Google Drive auf diesem Gerät getrennt',
  'cloud.googleDriveIsBusyTryAgainShortly':
    'Google Drive ist ausgelastet. Versuche es gleich noch einmal.',
  'cloud.googleDriveNeedsToBeReconnected': 'Google Drive muss erneut verbunden werden.',
  'cloud.googleDriveReconnected': 'Google Drive erneut verbunden',
  'cloud.googleDriveStorageIsFull': 'Der Google-Drive-Speicher ist voll.',
  'cloud.googleDriveStatus': 'Google Drive — {status}',
  'cloud.ifGoogleShowsADriveAccessCheckboxSelectItBackup':
    'Wenn Google ein Kontrollkästchen für den Drive-Zugriff anzeigt, wähle es aus. Ohne diese Berechtigung kann das Backup nicht verbunden werden.',
  'cloud.journalDeletionReceived': 'Tagebuchlöschung empfangen',
  'cloud.journalTextStillSyncsOnMobileData':
    'Tagebuchtext wird weiterhin über mobile Daten synchronisiert.',
  'cloud.keepLocalDataAndTheCloudCopy': 'Lokale Daten und Cloud-Kopie behalten',
  'cloud.keepLocalJournalData': 'Lokale Tagebuchdaten behalten',
  'cloud.keepTheCloudCopyAndOtherDevices': 'Cloud-Kopie und andere Geräte behalten',
  'cloud.lastSuccessfulSyncDate': 'Letzte erfolgreiche Synchronisierung: {date}',
  'cloud.localDataAndTheCloudBackupWillBothRemainOther':
    'Lokale Daten und die Cloud-Sicherung bleiben erhalten. Andere Geräte bleiben verbunden.',
  'cloud.markAsReviewed': 'Als geprüft markieren',
  'cloud.mergingChangesAndUpdatingGoogleDrive':
    'Änderungen werden zusammengeführt und Google Drive wird aktualisiert',
  'cloud.noTackbokBackupFoundInThisGoogleAccount':
    'Keine Tackbok-Sicherung in diesem Google-Konto gefunden',
  'cloud.noInternetConnectionYourChangesRemainSafelyQueued':
    'Keine Internetverbindung. Deine Änderungen bleiben sicher in der Warteschlange.',
  'cloud.noExistingTackbokBackupWasFoundCreateOneForThis':
    'Keine bestehende Tackbok-Sicherung gefunden. Erstelle eine für dieses Tagebuch.',
  'cloud.optionalCloudBackup': 'Optionale Cloud-Sicherung',
  'cloud.pauseSync': 'Synchronisierung pausieren',
  'cloud.preparingJournalChanges': 'Journaländerungen werden vorbereitet',
  'cloud.preparingRestoredJournalData':
    'Wiederhergestellte Journaldaten werden vorbereitet',
  'cloud.profile': 'Profil',
  'cloud.prompt': 'Schreibimpuls',
  'cloud.reconnectGoogleDrive': 'Google Drive erneut verbinden',
  'cloud.recoveredConflicts': 'Wiederhergestellte Konflikte',
  'cloud.recoveredConflictsMarkedAsReviewed':
    'Wiederhergestellte Konflikte als geprüft markiert',
  'cloud.recoveredTypeConflictCountPreservedAlternatives':
    '{type}-Konflikt wiederhergestellt — {count} Alternativen erhalten',
  'cloud.resetThisDeviceOnly': 'Nur dieses Gerät zurücksetzen',
  'cloud.resetThisDeviceOnly2': 'Nur dieses Gerät zurücksetzen?',
  'cloud.merge': 'Zusammenführen',
  'cloud.restoreCloudBackup': 'Cloud-Sicherung wiederherstellen',
  'cloud.restoreFromYourCloudBackup': 'Aus deiner Cloud-Sicherung wiederherstellen',
  'cloud.restoring': 'Wiederherstellung läuft…',
  'cloud.safelyQueued': 'Sicher vorgemerkt',
  'cloud.savingSyncedJournalDataOnThisDevice':
    'Synchronisierte Journaldaten werden auf diesem Gerät gespeichert',
  'cloud.setupElapsedSeconds': 'Vergangene Zeit: {seconds} s',
  'cloud.setupProgressHelp':
    'Tackbok verbindet dieses Gerät und startet die erste Synchronisierung. Große Backups, Fotos und Sprachnotizen können länger dauern.',
  'cloud.setupTakingLonger':
    'Das dauert länger als üblich. Prüfe deine Internetverbindung und lass Tackbok geöffnet, damit der Vorgang fortgesetzt werden kann.',
  'cloud.settingUpCloudSync': 'Cloud-Synchronisierung wird eingerichtet…',
  'cloud.stepCurrentOfTotalInThisBatch':
    'Schritt {current} von {total} in diesem Durchlauf',
  'cloud.syncCompleted': 'Synchronisierung abgeschlossen',
  'cloud.syncNow': 'Jetzt synchronisieren',
  'cloud.syncPaused': 'Synchronisierung pausiert',
  'cloud.syncResumed': 'Synchronisierung fortgesetzt',
  'cloud.syncRunsInSafeBatchesYouCanKeepUsingTackbok':
    'Die Synchronisierung erfolgt in sicheren Durchläufen. Du kannst Tackbok weiterverwenden.',
  'cloud.syncMediaOnWiFiOnly': 'Medien nur über WLAN synchronisieren',
  'cloud.syncing': 'Synchronisierung läuft…',
  'cloud.theCloudCopyAndThisDevicesJournalWillBePermanently':
    'Die Cloud-Kopie und das Tagebuch dieses Geräts werden dauerhaft gelöscht. Andere Geräte löschen ihr lokales Tagebuch bei der Synchronisierung.',
  'cloud.theCloudCopyWillBePermanentlyDeletedAfterVerificationLocal':
    'Die Cloud-Kopie wird nach der Prüfung dauerhaft gelöscht. Lokale Tagebuchdaten bleiben erhalten.',
  'cloud.thisCloudBackupWasDeletedLocalJournalDataRemainsOn':
    'Diese Cloud-Sicherung wurde gelöscht. Lokale Tagebuchdaten bleiben auf diesem Gerät.',
  'cloud.thisCloudBackupContainsDataTackbokCannotRead':
    'Diese Cloud-Sicherung enthält Daten, die Tackbok nicht lesen kann.',
  'cloud.finishDeletingThisJournal': 'Löschen dieses Tagebuchs abschließen?',
  'cloud.cloudDeletionIsAlreadyRecordedEraseTheRemainingJournalData':
    'Die Cloud-Löschung wurde bereits gespeichert. Lösche die verbleibenden Tagebuchdaten von diesem Gerät.',
  'cloud.finishDeletion': 'Löschen abschließen',
  'cloud.yourGoogleEmailIsStoredSecurelyOnThisDeviceTo':
    'Deine Google-E-Mail-Adresse wird sicher auf diesem Gerät gespeichert, um das verbundene Konto zu identifizieren, und beim Trennen gelöscht. Sie wird niemals in Backups, Protokolle, Diagnosedaten oder Analysen aufgenommen.',
  'cloud.thisDeviceDisconnectsFirstThenDeletesItsLocalJournalThe':
    'Dieses Gerät wird zuerst getrennt und löscht dann sein lokales Tagebuch. Cloud-Sicherung und andere Geräte bleiben erhalten.',
  'cloud.thisDeviceWasReset': 'Dieses Gerät wurde zurückgesetzt',
  'cloud.thisJournalWasDeletedEverywhereThisDeviceIsDisconnected':
    'Dieses Tagebuch wurde überall gelöscht. Dieses Gerät ist getrennt.',
  'cloud.upToDate': 'Aktuell',
  'cloud.verifyBackupHealth': 'Sicherungsstatus prüfen',
  'cloud.waitingForTheFirstSuccessfulSync':
    'Warten auf die erste erfolgreiche Synchronisierung',
  'cloud.youCanLeaveThisScreenSyncingResumesWhenTackbokIs':
    'Du kannst diesen Bildschirm verlassen; die Synchronisierung wird fortgesetzt, wenn Tackbok aktiv ist.',
  'cloud.yourJournalStaysOnYourDeviceCloudBackupIsOptional':
    'Dein Tagebuch bleibt auf deinem Gerät — mit optionaler Cloud-Sicherung.',
  'cloud.countChangesSafelyQueued': '{count} Änderungen sicher vorgemerkt',
  'cloud.countChangesRemaining': '{count} Änderungen verbleiben',
  'cloud.googleDriveAuthorizationNeedsAttention':
    'Die Google-Drive-Autorisierung erfordert Aufmerksamkeit.',
  'cloud.thisBackupBelongsToADifferentConnectedGoogleAccount':
    'Diese Sicherung gehört zu einem anderen verbundenen Google-Konto.',
  'cloud.googleDrivePermissionWasNotFullyGranted':
    'Die Google-Drive-Berechtigung wurde nicht vollständig erteilt.',
  'cloud.theConnectedCloudBackupDoesNotMatchThisJournal':
    'Die verbundene Cloud-Sicherung passt nicht zu diesem Tagebuch.',
  'cloud.thisBackupWasCreatedByANewerTackbokVersion':
    'Diese Sicherung wurde mit einer neueren Tackbok-Version erstellt.',
  'cloud.aCloudSnapshotFailedItsSafetyChecks':
    'Eine gespeicherte Cloud-Sicherung hat die Sicherheitsprüfungen nicht bestanden.',
  'cloud.aDeviceBackupPointsToAMissingSnapshot':
    'Eine Gerätesicherung verweist auf eine gespeicherte Sicherung, die fehlt.',
  'cloud.twoDifferentBackupsClaimTheSameDeviceVersion':
    'Zwei verschiedene Sicherungen beanspruchen dieselbe Geräteversion.',
  'cloud.tooManyIndependentDeviceBackupsNeedConsolidation':
    'Zu viele getrennte Gerätesicherungen müssen zusammengeführt werden.',
  'cloud.aRecoveredItemConflictsWithAnExistingStableIdentifier':
    'Ein wiederhergestelltes Element hat dieselbe interne ID wie ein vorhandenes Element.',
  'cloud.tackbokCouldNotSafelyStageBackupDataOnThisDevice':
    'Tackbok konnte die Sicherungsdaten auf diesem Gerät nicht sicher vorbereiten.',
  'cloud.googleDriveDoesNotHaveEnoughFreeStorage':
    'Google Drive hat nicht genügend freien Speicherplatz.',
  'cloud.googleDriveDeniedAccessToTheAppBackupFolder':
    'Google Drive hat den Zugriff auf den Sicherungsordner der App verweigert.',
  'cloud.aReferencedPhotoOrVoiceMemoIsUnavailable':
    'Ein für die Sicherung benötigtes Foto oder eine Sprachnotiz ist nicht verfügbar.',
  'cloud.aLocalPhotoOrVoiceMemoCouldNotBeVerified':
    'Ein Foto oder eine Sprachnotiz auf diesem Gerät konnte nicht überprüft werden.',
  'cloud.yourJournalIsNotReadyForCloudSyncYet':
    'Dein Tagebuch ist noch nicht für die Cloud-Synchronisierung bereit.',
  'cloud.thisCloudBackupWasDeletedFromAnotherDevice':
    'Diese Cloud-Sicherung wurde von einem anderen Gerät gelöscht.',
  'cloud.thisJournalWasDeletedEverywhereFromAnotherDevice':
    'Dieses Tagebuch wurde von einem anderen Gerät überall gelöscht.',
  'cloud.cloudDeletionStoppedBeforeEveryBackupObjectWasRemoved':
    'Das Löschen in der Cloud wurde gestoppt, bevor alle Sicherungsdaten entfernt wurden.',
  'cloud.backupCleanupWasStoppedToProtectACurrentSnapshot':
    'Die Bereinigung wurde gestoppt, um eine noch verwendete Sicherung zu schützen.',
  'cloud.chooseTheConnectedAccount': 'Verbundenes Konto auswählen',
  'cloud.chooseAGoogleAccountToReconnect':
    'Google-Konto zum erneuten Verbinden auswählen',
  'cloud.finishConnection': 'Verbindung abschließen',
  'cloud.reconnectToTheCorrectBackup': 'Mit der richtigen Sicherung verbinden',
  'cloud.updateTackbok': 'Tackbok aktualisieren',
  'cloud.retryAndVerifyBackup': 'Erneut versuchen und Sicherung prüfen',
  'cloud.repairFromVerifiedBackup': 'Aus geprüfter Sicherung reparieren',
  'cloud.inspectAndRepairBackup': 'Sicherung prüfen und reparieren',
  'cloud.consolidateBackups': 'Sicherungen zusammenführen',
  'cloud.exportJournalAndRepairBackup': 'Tagebuch exportieren und Sicherung reparieren',
  'cloud.freeDeviceStorageAndRetry': 'Gerätespeicher freigeben und erneut versuchen',
  'cloud.manageGoogleDriveStorage': 'Google-Drive-Speicher verwalten',
  'cloud.retryMissingMedia': 'Fehlende Medien erneut versuchen',
  'cloud.locateOrRetryAttachment': 'Anhang suchen oder erneut versuchen',
  'cloud.retryJournalPreparation': 'Tagebuchvorbereitung erneut versuchen',
  'cloud.acknowledgeAndDisconnect': 'Bestätigen und trennen',
  'cloud.reviewDeletionAndEraseThisDevice': 'Löschung prüfen und dieses Gerät löschen',
  'cloud.resumeDeletion': 'Löschung fortsetzen',
  'cloud.cloudDeletionCompleted': 'Cloud-Löschung abgeschlossen',
  'cloud.exportOrRepairTheAffectedJournalDataThenReturnAnd':
    'Exportiere oder repariere die betroffenen Tagebuchdaten und versuche es danach erneut.',
  'cloud.cloudBackupRetryCompleted': 'Erneuter Sicherungsversuch abgeschlossen',
  'cloud.cloudSyncCouldNotFinishYourChangesRemainSafelyQueued':
    'Die Cloud-Synchronisierung konnte nicht abgeschlossen werden. Deine Änderungen bleiben sicher vorgemerkt.',
  'cloud.googleDriveRejectedABackupRequestUpdateTackbokAndRetry':
    'Google Drive hat eine Sicherungsanfrage abgelehnt. Aktualisiere Tackbok und versuche es erneut.',
  'time.hours': 'Stunden',
  'time.minutes': 'Minuten',
  'common.databaseUpdateFailed':
    'Die Tagebuchdatenbank konnte nicht aktualisiert werden: {message}',
};
