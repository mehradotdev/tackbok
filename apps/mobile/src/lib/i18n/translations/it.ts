import type { Translations } from '../types';

export const it = {
  'greeting.welcomeBack': 'Che bello rivederti',
  'greeting.goodMorning': 'Buongiorno',
  'greeting.goodAfternoon': 'Buon pomeriggio',
  'greeting.goodEvening': 'Buonasera',
  'greeting.goodNight': 'Buonanotte',
  'greeting.happySunday': 'Buona domenica',
  'greeting.happyMonday': 'Buon lunedì',
  'greeting.happyTuesday': 'Buon martedì',
  'greeting.happyWednesday': 'Buon mercoledì',
  'greeting.happyThursday': 'Buon giovedì',
  'greeting.happyFriday': 'Buon venerdì',
  'greeting.happySaturday': 'Buon sabato',
  'greeting.withName': '{greeting}, {name}',
  'greeting.christmasEve': 'Buona vigilia di Natale',
  'greeting.merryChristmas': 'Buon Natale',
  'greeting.newYearsEve': 'Buon San Silvestro',
  'greeting.happyNewYear': 'Buon anno',

  'common.tackbok': 'Tackbok',
  'common.cancel': 'Annulla',
  'common.done': 'Fine',
  'common.save': 'Salva',
  'common.back': 'Indietro',
  'common.create': 'Crea',
  'common.discard': 'Scarta',
  'common.delete': 'Elimina',
  'common.remove': 'Rimuovi',
  'common.close': 'Chiudi',
  'common.play': 'Riproduci',
  'common.pause': 'Pausa',
  'common.settings': 'Impostazioni',
  'common.shareFeedback': 'Invia un feedback',
  'common.contactUs': 'Contattaci',
  'common.unknownError': 'Errore sconosciuto',
  'common.retry': 'Riprova',

  'search.searchGratitudeLogs': 'Cerca nelle note…',
  'search.startTypingToSearchYourGratitudeLogs': 'Scrivi per cercare nelle tue note',
  'search.searchFailed': 'Ricerca non riuscita',
  'search.noResults': 'Nessun risultato',

  'gratitude.whatAreYouGratefulForToday': 'Per cosa sei riconoscente oggi?',
  'gratitude.whatWereYouGratefulForYesterday': 'Per cosa eri riconoscente ieri?',
  'gratitude.whatAreYouGratefulFor': 'Per cosa sei riconoscente?',
  'gratitude.whatWereYouGratefulFor': 'Per cosa eri riconoscente?',
  'gratitude.failedToLoadEntries': 'Impossibile caricare le note',
  'gratitude.writeNow': 'Scrivi ora',
  'gratitude.pickADate': 'Scegli una data',
  'gratitude.playWithPet': 'Gioca con il cucciolo',
  'gratitude.collapseGratitudeActions': 'Comprimi le azioni',
  'gratitude.expandGratitudeActions': 'Espandi le azioni',

  'dateEntries.loading': 'Caricamento…',
  'dateEntries.noEntriesForThisDate': 'Nessuna nota per questa data',
  'dateEntries.createEntry': 'Crea nota',
  'dateEntries.somethingWentWrongCreatingNewEntry':
    'Si è verificato un problema. Verrà creata una nuova nota.',

  'entry.otherVersion': 'Altra versione',
  'entry.otherVersionBanner': 'Questa nota ha un’altra versione.',
  'entry.compareVersions': 'Confronta',
  'entry.compareVersionsHint': 'Apre Altre versioni partendo da questa nota.',
  'entry.editEntry': 'Modifica nota',
  'entry.deleteEntryLabel': 'Elimina nota',
  'entry.deleteEntry': 'Eliminare la nota?',
  'entry.thisEntryWillBePermanentlyDeleted':
    'Questa nota verrà eliminata definitivamente.',
  'entry.entryNotFound': 'Nota non trovata',
  'entry.leaveWithoutSaving': 'Uscire senza salvare?',
  'entry.discardChanges.message':
    'Le modifiche non sono state salvate. Vuoi continuare a modificare o scartarle?',
  'entry.keepEditing': 'Continua a modificare',

  'entry.pickAnyDate': 'Scegli una data qualsiasi',
  'entry.mood': 'Umore',
  'entry.photo': 'Foto',
  'entry.addPhoto': 'Aggiungi foto',
  'entry.takePhoto': 'Scatta foto',
  'entry.chooseFromLibrary': 'Scegli dalla libreria',
  'entry.pasteFromClipboard': 'Incolla dagli appunti',
  'entry.clipboardHasNoImage': 'Negli appunti non c’è un’immagine',
  'entry.clipboardImageInvalid': 'Impossibile aggiungere l’immagine dagli appunti',
  'entry.receivedImageInvalid': 'Impossibile aggiungere questa immagine',
  'entry.receivedImageTooLarge': 'Questa immagine è troppo grande',
  'entry.maximumCountPhotosPerEntry': 'Fino a {count} foto per nota',
  'entry.maximumCountVoiceMemosPerEntry': 'Fino a {count} memo vocali per nota',
  'entry.cameraAccessRequired': 'Serve l’accesso alla fotocamera',
  'entry.photoLibraryAccessRequired': 'Serve l’accesso alle foto',
  'entry.pleaseEnableCameraAccessInYourDeviceSettingsToTake':
    'Per scattare foto, consenti l’accesso alla fotocamera nelle impostazioni del dispositivo.',
  'entry.pleaseEnablePhotoLibraryAccessInYourDeviceSettingsTo':
    'Per scegliere le foto, consenti l’accesso alle foto nelle impostazioni del dispositivo.',
  'entry.openSettings': 'Apri Impostazioni',
  'entry.voice': 'Voce',
  'entry.microphoneAccessRequired': 'Serve l’accesso al microfono',
  'entry.pleaseEnableMicrophoneAccessInYourDeviceSettingsToRecord':
    'Per registrare memo vocali, consenti l’accesso al microfono nelle impostazioni del dispositivo.',
  'entry.recordVoiceNote': 'Registra memo vocale',
  'entry.tapTheButtonBelowWhenReady': 'Quando vuoi, tocca il pulsante qui sotto.',
  'entry.startRecording': 'Avvia registrazione',
  'entry.recordingVoiceNote': 'Registrazione del memo vocale…',
  'entry.stopRecording': 'Interrompi registrazione',
  'entry.voiceNoteRecorded': 'Memo vocale registrato',
  'entry.tapOnThePlayButtonToListen': 'Tocca Riproduci per ascoltarlo.',
  'entry.saveRecording': 'Salva registrazione',
  'entry.discardRecording': 'Scarta registrazione',
  'entry.voiceNotesSaveAutomaticallyAt3000':
    'I memo vocali vengono salvati automaticamente dopo 30 minuti.',
  'entry.titleOptional': 'Titolo (facoltativo)',
  'entry.usePrompt': 'Usa lo spunto',
  'entry.newPrompt': 'Nuovo spunto',
  'entry.addPrompt': 'Aggiungi spunto',
  'entry.showAll': 'Mostra tutti',
  'entry.promptText': 'Testo dello spunto',
  'entry.promptAlreadyExists': 'Lo spunto esiste già',
  'entry.promptCreated': 'Spunto creato',
  'entry.failedToCreatePrompt': 'Impossibile creare lo spunto',
  'entry.promptUpdated': 'Spunto aggiornato',
  'entry.failedToUpdatePrompt': 'Impossibile aggiornare lo spunto',
  'entry.promptDeleted': 'Spunto eliminato',
  'entry.failedToDeletePrompt': 'Impossibile eliminare lo spunto',
  'entry.faith': 'Fede',
  'entry.self': 'Vita personale',
  'entry.health': 'Salute',
  'entry.friends': 'Amicizie',
  'entry.family': 'Famiglia',
  'entry.littleThings': 'Piccole cose',
  'entry.createPrompt': 'Crea spunto',
  'entry.createAPrompt': 'Crea spunto',
  'entry.editPrompt': 'Modifica spunto',
  'entry.deletePrompt': 'Elimina spunto',
  'entry.deletePrompt2': 'Eliminare lo spunto?',
  'entry.areYouSureYouWantToDeleteThisPrompt': 'Vuoi davvero eliminare questo spunto?',
  'entry.noPromptsYet': 'Ancora nessuno spunto',
  'entry.createYourFirstPrompt': 'Crea il tuo primo spunto',

  prompt_faith_1: 'Qual è il tuo primo ricordo in cui hai sentito la presenza di Dio?',
  prompt_faith_2: 'Dove hai visto la grazia nella tua vita di recente?',
  prompt_faith_3: 'Quale preghiera ti è stata d’aiuto in un momento difficile?',
  prompt_faith_4:
    'In che modo la tua fede ha cambiato il tuo modo di vedere le difficoltà?',
  prompt_faith_5: 'Quale pratica o abitudine spirituale ti dà più pace?',
  prompt_faith_6:
    'Scrivi di una volta in cui hai sentito chiaramente la guida di una forza superiore.',
  prompt_faith_7:
    'Quale insegnamento o citazione in particolare ispira la tua vita di ogni giorno?',
  prompt_faith_8:
    'Come trovi un legame spirituale nel pieno di una settimana impegnativa?',
  prompt_faith_9:
    'Ripensa a un momento in cui la tua fede ti ha dato conforto nell’incertezza.',

  prompt_self_1: 'Di cosa avresti bisogno di più nella tua vita?',
  prompt_self_2: 'Racconta una cosa difficile che hai fatto lo stesso.',
  prompt_self_3: 'Cosa diresti oggi alla versione più giovane di te?',
  prompt_self_4: 'Quale tuo traguardo recente non hai festeggiato abbastanza?',
  prompt_self_5: 'Scrivi tre cose che ami del tuo carattere.',
  prompt_self_6: 'In che modo ti ha fatto crescere un errore recente?',
  prompt_self_7: 'Quale limite devi porre per proteggere le tue energie?',
  prompt_self_8:
    'In quale ambito della tua vita ti senti più in sintonia con chi sei davvero?',
  prompt_self_9: 'Descrivi la tua giornata ideale, dalla mattina alla sera.',

  prompt_health_1: 'Per quale parte del tuo corpo sei più riconoscente oggi?',
  prompt_health_2: 'In che modo il riposo ti ha fatto bene ultimamente?',
  prompt_health_3: 'Quale abitudine sana mantieni con orgoglio?',
  prompt_health_4: 'Quale pasto nutriente ti fa sempre stare bene?',
  prompt_health_5:
    'Descrivi un’attività fisica che ti dà gioia invece di sembrarti un dovere.',
  prompt_health_6:
    'Come ti fa capire il tuo corpo che ha bisogno di rallentare o di riposare?',
  prompt_health_7: 'Cosa fai oggi per prenderti cura del tuo benessere mentale?',
  prompt_health_8:
    'Scrivi di una volta in cui hai superato una difficoltà fisica o un infortunio.',
  prompt_health_9:
    'Quale piccolo cambiamento puoi fare per migliorare la qualità del tuo sonno?',

  prompt_friends_1: 'Quale amico o amica ti ha reso la vita più leggera di recente?',
  prompt_friends_2: 'Quale ricordo con un amico o un’amica ti fa ancora sorridere?',
  prompt_friends_3: 'Chi vorresti incoraggiare questa settimana?',
  prompt_friends_4: 'Quale qualità apprezzi di più nelle tue amicizie più strette?',
  prompt_friends_5:
    'Scrivi di un amico o un’amica che ti ha fatto vedere le cose da un altro punto di vista.',
  prompt_friends_6:
    'Come preferisci mostrare il tuo affetto e la tua riconoscenza ai tuoi amici?',
  prompt_friends_7:
    'Con quale amico o amica non parli da un po’? Cosa vorresti dire a questa persona?',
  prompt_friends_8:
    'Descrivi un’avventura divertente o inaspettata che hai vissuto con un amico o un’amica.',
  prompt_friends_9: 'Quale lezione hai imparato da una delle tue amicizie?',

  prompt_family_1: 'Per quale tradizione di famiglia sei riconoscente?',
  prompt_family_2: 'Chi nella tua famiglia ti ha insegnato qualcosa di duraturo?',
  prompt_family_3: 'Quale piccolo momento in famiglia vuoi ricordare?',
  prompt_family_4: 'Quale storia della tua famiglia trovi d’ispirazione?',
  prompt_family_5:
    'Com’è cambiato nel tempo il tuo rapporto con un membro della tua famiglia?',
  prompt_family_6:
    'Scrivi di un’abilità o di una ricetta che si tramanda nella tua famiglia.',
  prompt_family_7:
    'Quale tratto del carattere hai in comune con un genitore, un fratello o una sorella?',
  prompt_family_8: 'Descrivi un ricordo d’infanzia che ti dà ancora una gioia immensa.',
  prompt_family_9: 'Come vi sostenete a vicenda in famiglia nei momenti difficili?',

  prompt_littleThings_1: 'Cosa ti ha fatto sorridere oggi?',
  prompt_littleThings_2: 'Quale piccolo momento ti ha fatto fermare oggi?',
  prompt_littleThings_3: 'Quale piccola comodità quotidiana ti mancherebbe di più?',
  prompt_littleThings_4:
    'Descrivi un piccolo dettaglio quotidiano intorno a te che trovi bello.',
  prompt_littleThings_5: 'Qual è il suono che preferisci sentire quando ti svegli?',
  prompt_littleThings_6: 'Scrivi di un piacere semplice che aspetti ogni giorno.',
  prompt_littleThings_7: 'Qual è stato il momento migliore della tua mattina oggi?',
  prompt_littleThings_8:
    'Descrivi un breve incontro con una persona sconosciuta che ti ha dato gioia.',
  prompt_littleThings_9: 'Quale oggetto che costa poco ti migliora davvero la vita?',

  'worksheet.whatIAmGratefulForToday': 'Oggi sono riconoscente per…',
  'worksheet.myAffirmationForToday': 'La mia affermazione positiva di oggi…',
  'worksheet.oneLittleThingThatMadeMeSmileRecently':
    'Una piccola cosa che mi ha fatto sorridere di recente…',

  'mood.amazing': 'Alla grande',
  'mood.happy': 'Felice',
  'mood.okay': 'Così così',
  'mood.sad': 'Triste',
  'mood.awful': 'Malissimo',
  'mood.howAreYouFeeling': 'Come ti senti?',
  'mood.feelingAmazing': 'Mi sento alla grande',
  'mood.feelingHappy': 'Mi sento felice',
  'mood.feelingOkay': 'Mi sento così così',
  'mood.feelingSad': 'Mi sento triste',
  'mood.feelingAwful': 'Mi sento malissimo',
  'mood.entrySavedSuccessfully': 'Nota salvata',
  'mood.failedToSaveEntry': 'Impossibile salvare la nota',
  'mood.failedToSaveVoiceMemo': 'Impossibile salvare il memo vocale',
  'mood.failedToAddPhotos': 'Impossibile aggiungere le foto',
  'mood.failedToDeleteEntry': 'Impossibile eliminare la nota',
  'mood.tagAlreadyExists': 'Il tag esiste già',
  'mood.tagCreated': 'Tag creato',
  'mood.failedToCreateTag': 'Impossibile creare il tag',
  'mood.tagUpdated': 'Tag aggiornato',
  'mood.failedToUpdateTag': 'Impossibile aggiornare il tag',
  'mood.tagDeleted': 'Tag eliminato',
  'mood.failedToDeleteTag': 'Impossibile eliminare il tag',

  'tags.tag': 'Tag',
  'tags.tagName': 'Nome del tag',
  'tags.addATag': 'Aggiungi tag',
  'tags.createNewTag': 'Crea tag',
  'tags.editTag': 'Modifica tag',
  'tags.deleteTag': 'Elimina tag',
  'tags.areYouSureYouWantToDeleteTheTagTitle': 'Vuoi davvero eliminare il tag “{title}”?',

  'milestone.daysOfGratitude': 'giorni di gratitudine',

  'profile.yourName': 'Il tuo nome',
  'profile.changePhoto': 'Cambia foto',
  'profile.profilePhoto': 'Foto profilo',
  'profile.wouldYouLikeToUpdateOrRemoveYourProfilePhoto':
    'Vuoi cambiare o rimuovere la foto profilo?',
  'profile.updatePhoto': 'Cambia foto',
  'profile.removePhoto': 'Rimuovi foto',

  'settings.language': 'Lingua',
  'settings.selectLanguage': 'Scegli la lingua',
  'settings.deviceDefault': 'Lingua del dispositivo',
  'settings.restartRequired': 'Riavvio necessario',
  'settings.languageChangeRequiresAppRestartProceed':
    'Per cambiare lingua bisogna riavviare Tackbok. Continuare?',
  'settings.proceed': 'Continua',
  'settings.reloadApp': 'Riavvia l’app',

  'notifications.notifications': 'Notifiche',
  'notifications.dailyReminder': 'Promemoria giornaliero',
  'notifications.dailyReminderNotificationsAreOn':
    'Le notifiche del promemoria giornaliero sono attive',
  'notifications.dailyReminderNotificationsAreOff':
    'Le notifiche del promemoria giornaliero sono disattivate',
  'notifications.adjustReminderTime': 'Orario del promemoria',
  'notifications.changeYourDailyReminderTime':
    'Cambia l’orario del promemoria giornaliero',
  'notifications.failedToUpdateReminder': 'Impossibile aggiornare il promemoria',
  'notifications.notificationPermissionNeeded': 'Serve il permesso per le notifiche',
  'notifications.toGetDailyRemindersAllowNotificationsForTackbokInYour':
    'Per ricevere i promemoria giornalieri, consenti le notifiche di Tackbok nelle impostazioni del dispositivo.',

  'appearance.appearance': 'Aspetto',
  'appearance.theme': 'Tema',
  'appearance.selectATheme': 'Scegli un tema',
  'appearance.countThemesAndColorSchemes': '{count} temi e combinazioni di colori',
  'appearance.timelineEntryLength': 'Lunghezza note in cronologia',
  'appearance.numberOfLinesShownInTheTimeline':
    'Numero di righe mostrate nella cronologia. Tocca una nota per leggerla tutta.',
  'appearance.timelineAndCalendar': 'Cronologia e calendario',
  'appearance.showTimelineBorders': 'Mostra i bordi nella cronologia',
  'appearance.showTheBordersInTheTimeline': 'Mostra i bordi nella cronologia',
  'appearance.hideTheBordersInTheTimeline': 'Nascondi i bordi nella cronologia',
  'appearance.dateStyle': 'Stile della data',
  'appearance.dateIncludesDayOfTheWeek': 'La data include il giorno della settimana',
  'appearance.firstDayOfWeek': 'Primo giorno della settimana',
  'appearance.firstDayOfWeekDescription':
    'Scegli il giorno da cui iniziano le settimane del calendario',
  'appearance.appIcon': 'Icona dell’app',
  'appearance.festiveTouches': 'Dettagli festivi',
  'appearance.festiveTouchesDescription': 'Auguri e suggerimenti per le feste',
  'appearance.changeAppIconTitle': 'Cambiare l’icona dell’app?',
  'appearance.changeAppIconMessage': 'Tackbok si chiuderà per applicare la nuova icona.',
  'appearance.changeIcon': 'Cambia icona',
  'festive.promptTitle': 'Voglia di festa?',
  'festive.promptMessage': 'Tackbok ha un’icona e un tema per le feste.',
  'festive.takeALook': 'Dai un’occhiata',
  'festive.notNow': 'Non ora',
  'festive.switchBackTitle': 'Tornare al solito aspetto?',
  'festive.switchBackMessage': 'Torna al tema e all’icona che avevi prima delle feste.',
  'festive.switchBack': 'Torna indietro',
  'festive.keepIt': 'Mantieni',

  'typography.typography': 'Tipografia',
  'typography.titleFont': 'Font dei titoli',
  'typography.chooseAFontForTitlesAndHeadings':
    'Scegli un font per titoli e intestazioni',
  'typography.default': 'Predefinito',
  'typography.themeDefault': 'Come il tema',
  'typography.fontSize': 'Dimensione del testo',
  'typography.adjustTheSizeOfBodyText': 'Regola la dimensione del testo',
  'typography.small': 'Piccolo',
  'typography.large': 'Grande',
  'typography.previewOfTheSelectedFont': 'Anteprima del font selezionato',
  'typography.gratitudeMakesTodayBrighter':
    'La gratitudine rende la giornata più luminosa',

  'journaling.journaling': 'Scrittura',
  'journaling.editWorksheetTemplate': 'Modifica il modello',
  'journaling.resetToDefault': 'Ripristina predefinito',
  'journaling.journalingWorksheet': 'Modello di scrittura',
  'journaling.startWriting': 'Inizia a scrivere',
  'journaling.journalFocusAreas': 'Temi del diario',
  'journaling.personalizeYourJournalPrompts': 'Personalizza gli spunti del tuo diario.',
  'journaling.pickTheTopicsYouWantToWriteAbout': 'Scegli i temi di cui vuoi scrivere.',
  'journaling.selectAtLeast2FocusAreas': 'Scegli almeno 2 temi',
  'journaling.journalPrompts': 'Spunti di scrittura',
  'journaling.chooseWhichPromptsToShowWhenStartingANewJournal':
    'Scegli quali spunti mostrare quando inizi una nuova nota.',
  'journaling.off': 'Disattivato',
  'journaling.allPrompts': 'Tutti gli spunti',
  'journaling.myPrompts': 'I miei spunti',
  'journaling.builtInPrompts': 'Spunti predefiniti',
  'journaling.focusareaSelfDesc':
    'Rifletti su hobby, interessi, esperienze e sulla vita in generale.',
  'journaling.focusareaLittlethingsDesc':
    'Apprezza le piccole benedizioni di ogni giorno, che spesso passano inosservate.',
  'journaling.focusareaHealthDesc':
    'Apprezza i tanti doni del tuo corpo e di ciò che sa fare.',
  'journaling.focusareaFamilyDesc':
    'Apprezza i tuoi familiari e i momenti condivisi con loro.',
  'journaling.focusareaFriendsDesc':
    'Apprezza gli amici che ti vogliono bene, ti sostengono e ti capiscono.',
  'journaling.focusareaFaithDesc':
    'Concentrati sulla gratitudine per la tua fede, la spiritualità e la pace interiore.',

  'security.security': 'Sicurezza',
  'security.lockAfter': 'Blocca dopo',
  'security.timeAwayFromTheAppBeforeRequiringAnUnlock':
    'Tempo fuori dall’app prima che serva sbloccarla.',
  'security.0Seconds': '0 secondi',
  'security.30Seconds': '30 secondi',
  'security.1Minute': '1 minuto',
  'security.2Minutes': '2 minuti',
  'security.unlockTackbok': 'Sblocca Tackbok',
  'security.lockWithYourDeviceScreenLock':
    'Tackbok può bloccarsi con il blocco schermo del dispositivo: biometria, PIN, sequenza o codice',
  'security.unlock': 'Sblocca',
  'security.appLockUnavailable': 'Blocco dell’app non disponibile',
  'security.setUpAScreenLockPinPatternOrBiometricsIn':
    'Prima imposta un blocco schermo (PIN, sequenza o biometria) nelle impostazioni del dispositivo.',

  'backup.backupRestore': 'Backup e ripristino',
  'backup.googleDriveBackup': 'Backup su Google Drive',
  'backup.exportAsZip': 'Esporta come ZIP',
  'backup.movingPhonesAndroid':
    'Passi a un nuovo telefono? Prima attiva il backup sul cloud e attendi che finisca, oppure esporta un file ZIP. Android non trasferisce il tuo diario da solo.',
  'backup.allOfYourDataInAFormatThatYouCan':
    'Tutti i tuoi dati in un formato che potrai ripristinare nell’app in seguito',
  'backup.importAsZip': 'Importa da ZIP',
  'backup.restoreYourDataFromAZipFile': 'Ripristina i tuoi dati da un file .zip',
  'backup.importFromGratitudeApp': 'Importa dall’app Gratitude',
  'backup.importingFromGratitudeApp': 'Importazione dall’app Gratitude',
  'backup.importDataFromAGratitudeAppZipBackup':
    'Importa i dati da un backup .zip dell’app Gratitude',
  'backup.chooseImportMode': 'Scegli come importare',
  'backup.howShouldThisImportHandleEntriesThatAlreadyExistIn':
    'Come gestire le note che esistono già in Tackbok?',
  'backup.skipExistingEntries': 'Salta le note esistenti',
  'backup.skipExistingEntriesRecommended': 'Salta le note esistenti (consigliato)',
  'backup.onlyImportEntriesWithNewNoteIds': 'Importa solo le note con ID nuovi',
  'backup.overwriteMatchingEntries': 'Sovrascrivi le note corrispondenti',
  'backup.replaceExistingEntriesWhenNoteIdsMatch':
    'Sostituisci le note esistenti quando gli ID coincidono',
  'backup.importFromPresentlyApp': 'Importa dall’app Presently',
  'backup.restoreYourDataFromAPresentlyCsvFile':
    'Ripristina i tuoi dati da un file .csv di Presently',
  'backup.importFromPresently': 'Importare da Presently?',
  'backup.thisWillImportEntriesFromAPresentlyAppCsvFile':
    'Verranno importate le note da un file CSV dell’app Presently. Le note duplicate verranno saltate.',
  'backup.backupExportedSuccessfully': 'Backup esportato',
  'backup.exportFailed': 'Esportazione non riuscita',
  'backup.preparingBackup': 'Preparazione del backup…',
  'backup.nothingToExport': 'Non c’è ancora niente da esportare.',
  'backup.importFailed': 'Importazione non riuscita',
  'backup.importDataTooLarge': 'Questo backup è troppo grande per essere importato.',
  'backup.restoringTackbokBackup': 'Ripristino del backup di Tackbok',
  'backup.loadPresentlyExport': 'Carica l’esportazione di Presently',
  'backup.importJournalEntries': 'Importa le note del diario',
  'backup.openBackupFile': 'Apri il file di backup',
  'backup.validateBackupContents': 'Verifica il contenuto del backup',
  'backup.restoreProfile': 'Ripristina il profilo',
  'backup.importTagsAndPrompts': 'Importa tag e spunti',
  'backup.restoreEntriesAndMedia': 'Ripristina note e contenuti multimediali',
  'backup.refreshJournalData': 'Aggiorna i dati del diario',
  'backup.loadingTheSelectedImportFile': 'Caricamento del file selezionato.',
  'backup.checkingBackupContentsAndFileStructure':
    'Verifica del contenuto e della struttura del backup.',
  'backup.restoringProfileDetailsAndProfilePhotoIfAvailable':
    'Ripristino dei dati del profilo e della foto profilo, se presente.',
  'backup.addingTagsAndPromptsBeforeEntriesAreRestored':
    'Aggiunta di tag e spunti prima del ripristino delle note.',
  'backup.processingProcessedOfTotalJournalEntriesAndAttachedMedia':
    'Elaborazione di {processed} note su {total} e dei contenuti allegati.',
  'backup.noJournalEntriesFoundInThisBackup': 'Nessuna nota trovata in questo backup.',
  'backup.refreshingYourJournalSoImportedDataAppearsEverywhere':
    'Aggiornamento del diario, così i dati importati compaiono ovunque.',
  'backup.entriesProcessed': 'Note elaborate',
  'backup.entriesSkippedDueToErrors': 'Note saltate per errori',
  'backup.pleaseDoNotCloseOrMinimizeTheAppWhileThe':
    'Non chiudere e non ridurre a icona l’app durante l’importazione.',
  'backup.tagsAdded': 'Tag aggiunti',
  'backup.promptsAdded': 'Spunti aggiunti',
  'backup.photosRestored': 'Foto ripristinate',
  'backup.voiceMemosRestored': 'Memo vocali ripristinati',
  'backup.mediaSkipped': 'File multimediali saltati',
  'backup.tackbokBackupRestored': 'Backup di Tackbok ripristinato',
  'backup.gratitudeImportComplete': 'Importazione da Gratitude completata',
  'backup.presentlyImportComplete': 'Importazione da Presently completata',
  'backup.yourJournalDataIsReadyToReviewButSomeItems':
    'I dati del diario sono pronti da controllare, ma alcuni elementi non sono stati ripristinati.',
  'backup.yourJournalDataIsReadyToReview':
    'I dati del diario sono pronti da controllare.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe':
    'Importazione completata con avvisi. Alcuni elementi non sono stati ripristinati e tutto il resto era già in Tackbok.',
  'backup.thisImportFinishedButEverythingAlreadyExistedInTackbok':
    'Importazione completata, ma era già tutto in Tackbok.',
  'backup.thisImportFinishedWithWarningsSomeItemsCouldNotBe2':
    'Importazione completata con avvisi. Alcuni elementi non sono stati ripristinati.',
  'backup.thisImportFinishedSuccessfully': 'Importazione completata.',
  'backup.importedFromTackbokBackup': 'Importato dal backup di Tackbok',
  'backup.importedFromGratitudeBackup': 'Importato dal backup di Gratitude',
  'backup.importedFromPresentlyExport': 'Importato dall’esportazione di Presently',
  'backup.newEntries': 'Nuove note',
  'backup.updatedEntries': 'Note aggiornate',
  'backup.skippedDuplicates': 'Duplicati saltati',
  'backup.import': 'Importa',

  'appInfo.appInformation': 'Informazioni sull’app',
  'appInfo.faq': 'Domande frequenti',
  'appInfo.readFrequentlyAskedQuestions': 'Leggi le domande frequenti su Tackbok',
  'appInfo.shareTackbok': 'Condividi Tackbok',
  'appInfo.shareTheAppWithFriendsAndFamily':
    'Ti piace Tackbok? Condividi l’app con amici e familiari',
  'appInfo.practiceGratitudeWithTackbokASimpleFreeAndPrivateGratitude':
    'Coltiva la gratitudine con Tackbok, un diario della gratitudine semplice, gratuito e privato',
  'appInfo.supportTackbok': 'Sostieni Tackbok',
  'appInfo.tackbokIsFreeToUseAndThatsNotChangingIf':
    'Tackbok è gratuito e lo resterà. Se ha portato un po’ più di gratitudine nelle tue giornate, puoi sostenerlo, ma non c’è niente da sbloccare. L’app è uguale per tutti.',
  'appInfo.keepingTackbokRunningCurrentlyCostsAboutUs3325Per':
    'Al momento mantenere attivo Tackbok costa circa 33,25 US$ al mese, prima di tasse, commissioni e costi per l’uso in eccesso. Se pensi che ne valga la pena, anche un piccolo contributo aiuta a mantenerlo gratuito per tutti.',
  'appInfo.waysToSupport': 'Come contribuire',
  'appInfo.free': 'Gratis',
  'appInfo.smallThanks': 'Un piccolo grazie',
  'appInfo.helpsMeFinishWork10MinutesEarlier':
    'Mi aiuta a finire di lavorare 10 minuti prima',
  'appInfo.heartfeltThanks': 'Un grazie di cuore',
  'appInfo.helpsPayForHostingAndOnlineServices':
    'Aiuta a pagare hosting e servizi online',
  'appInfo.bigThanks': 'Un grande grazie',
  'appInfo.helpsTestAndReleaseTackbokUpdates':
    'Aiuta a testare e pubblicare gli aggiornamenti di Tackbok',
  'appInfo.deepestThanks': 'Un grazie immenso',
  'appInfo.helpsCoverOneMonthOfTackboksRunningCostsAndOngoing':
    'Aiuta a coprire un mese di costi di gestione e lo sviluppo di Tackbok',
  'appInfo.unavailable': 'Non disponibile',
  'appInfo.supportOptionsCouldNotBeLoadedPleaseTryAgain':
    'Impossibile caricare le opzioni di sostegno. Riprova.',
  'appInfo.youAppearToBeOfflineCheckYourConnectionAndTry':
    'Sembra che tu sia offline. Controlla la connessione e riprova.',
  'appInfo.thePurchaseCouldNotBeCompletedPleaseTryAgain':
    'Impossibile completare l’acquisto. Riprova.',
  'appInfo.paymentSuccessful': 'Pagamento riuscito',
  'appInfo.thankYou': 'Grazie!',
  'appInfo.yourSupportHelpsKeepTackbokFreeAndIndependentItGenuinely':
    'Il tuo sostegno aiuta Tackbok a restare gratuito e indipendente. Significa davvero molto.',
  'appInfo.thankYouForSupportingTackbokItGenuinelyMeansALot':
    'Grazie per aver sostenuto Tackbok. Significa davvero molto.',
  'appInfo.yourPaymentIsPendingTheStoreWillFinishItWhen':
    'Il pagamento è in sospeso. Lo store lo completerà dopo l’approvazione o il pagamento.',
  'appInfo.whereYourSupportHelps': 'A cosa serve il tuo sostegno',
  'appInfo.cloudflareWorkers': 'Cloudflare Workers',
  'appInfo.expoEas': 'Expo EAS',
  'appInfo.appleDeveloperMembership': 'Iscrizione all’Apple Developer Program',
  'appInfo.tackbokOrgDomain': 'Dominio tackbok.org',
  'appInfo.googlePlayRegistration': 'Registrazione su Google Play',
  'appInfo.monthlyBaseline': 'Costo mensile di base',
  'appInfo.us5Month': '5 US$ al mese',
  'appInfo.us19Month': '19 US$ al mese',
  'appInfo.us99Year': '99 US$ all’anno',
  'appInfo.us12Year': '12 US$ all’anno',
  'appInfo.us25OneTime': '25 US$ una tantum',
  'appInfo.aboutUs3325': 'Circa 33,25 US$',
  'appInfo.rateTackbok': 'Valuta Tackbok',
  'appInfo.leaveAnHonestRatingInTheAppStore':
    'Lascia una valutazione sincera nello store',
  'appInfo.unableToOpenTheStore': 'Impossibile aprire lo store',
  'appInfo.confirmTier': 'Conferma “{tier}”',
  'appInfo.theStoreWillChargePriceForThisVoluntaryOneTime':
    'Lo store addebiterà {price} per questo sostegno volontario una tantum. Non sblocca funzioni e puoi acquistarlo di nuovo.',
  'appInfo.privacyPolicy': 'Informativa sulla privacy',
  'appInfo.readOurPrivacyPolicy': 'Leggi l’informativa sulla privacy di Tackbok',
  'appInfo.termsConditions': 'Termini e condizioni',
  'appInfo.readOurTermsAndConditions': 'Leggi i nostri termini e condizioni',
  'appInfo.analytics': 'Raccolta dati di utilizzo',
  'appInfo.analyticsDescription':
    'Condividi dati di utilizzo anonimi per aiutare a trovare bug e migliorare Tackbok',
  'appInfo.checkForUpdates': 'Cerca aggiornamenti',
  'appInfo.checkingForUpdates': 'Ricerca di aggiornamenti…',
  'appInfo.lastCheckedTime': 'Ultimo controllo: {time}',
  'appInfo.never': 'Mai',
  'appInfo.restart': 'Riavvia',
  'appInfo.restartToApply': 'Riavvia per applicare',
  'appInfo.updateDownloadedRestartToApplyIt':
    'Aggiornamento scaricato. Riavvia per applicarlo.',
  'appInfo.youAlreadyHaveTheLatestVersion': 'Hai già la versione più recente',
  'appInfo.unableToUpdate': 'Impossibile aggiornare',
  'appInfo.version': 'Numero di versione',

  'dangerZone.dangerZone': 'Zona pericolosa',
  'dangerZone.deleteAllData': 'Elimina tutti i dati',
  'dangerZone.deleteAllData2': 'Eliminare tutti i dati?',
  'dangerZone.permanentlyDeleteAllYourAppData':
    'Elimina definitivamente tutti i dati dell’app',
  'dangerZone.thisActionCannotBeUndoneAllYourAppDataWill':
    'Questa azione non può essere annullata. Tutti i dati dell’app verranno eliminati definitivamente.',
  'dangerZone.allDataDeleted': 'Tutti i dati sono stati eliminati',
  'dangerZone.allDataDeletedButSomeMediaFilesCouldNotBe':
    'Tutti i dati sono stati eliminati, ma non è stato possibile rimuovere alcuni file multimediali.',
  'dangerZone.deleteFailed': 'Eliminazione non riuscita',

  'time.selectTime': 'Scegli l’orario',

  'calendar.today': 'Oggi',
  'calendar.yesterday': 'Ieri',
  'calendar.previousMonth': 'Mese precedente',
  'calendar.nextMonth': 'Mese successivo',
  'calendar.selectMonth': 'Scegli il mese',
  'calendar.selectYear': 'Scegli l’anno',
  'calendar.random': 'A caso',
  'calendar.openARandomEntry': 'Apri una nota a caso',
  'calendar.sun': 'Dom',
  'calendar.mon': 'Lun',
  'calendar.tue': 'Mar',
  'calendar.wed': 'Mer',
  'calendar.thu': 'Gio',
  'calendar.fri': 'Ven',
  'calendar.sat': 'Sab',
  'calendar.sunday': 'Domenica',
  'calendar.monday': 'Lunedì',
  'calendar.tuesday': 'Martedì',
  'calendar.wednesday': 'Mercoledì',
  'calendar.thursday': 'Giovedì',
  'calendar.friday': 'Venerdì',
  'calendar.saturday': 'Sabato',
  'calendar.january': 'Gennaio',
  'calendar.february': 'Febbraio',
  'calendar.march': 'Marzo',
  'calendar.april': 'Aprile',
  'calendar.may': 'Maggio',
  'calendar.june': 'Giugno',
  'calendar.july': 'Luglio',
  'calendar.august': 'Agosto',
  'calendar.september': 'Settembre',
  'calendar.october': 'Ottobre',
  'calendar.november': 'Novembre',
  'calendar.december': 'Dicembre',
  'calendar.jan': 'Gen',
  'calendar.feb': 'Feb',
  'calendar.mar': 'Mar',
  'calendar.apr': 'Apr',
  'calendar.may2': 'Mag',
  'calendar.jun': 'Giu',
  'calendar.jul': 'Lug',
  'calendar.aug': 'Ago',
  'calendar.sep': 'Set',
  'calendar.oct': 'Ott',
  'calendar.nov': 'Nov',
  'calendar.dec': 'Dic',

  'onboarding.skip': 'Salta',
  'onboarding.continue': 'Continua',
  'onboarding.next': 'Avanti',
  'onboarding.stepCurrentOfTotal': 'Passaggio {current} di {total}',
  'onboarding.getStarted': 'Inizia',
  'onboarding.alreadyHaveAJournalImportIt': 'Hai già un diario? Importalo',
  'onboarding.aPrivatePlaceForYourGratitudeFreeOfflineYours':
    'Uno spazio privato per la tua gratitudine. Gratuito, offline, tuo.',
  'onboarding.importYourJournal': 'Importa il tuo diario',
  'onboarding.whereIsYourJournalComingFrom': 'Da dove arriva il tuo diario?',
  'onboarding.tackbokBackup': 'Backup di Tackbok',
  'onboarding.gratitudeApp': 'App Gratitude',
  'onboarding.presentlyApp': 'App Presently',
  'onboarding.whatShouldWeCallYou': 'Come vuoi che ti chiamiamo?',
  'onboarding.yourNameIsOnlyUsedToGreetYouInsideThe':
    'Il tuo nome serve solo per salutarti nell’app.',
  'onboarding.yourNameOptional': 'Il tuo nome (facoltativo)',
  'onboarding.staysOnYourDevice': 'Resta sul tuo dispositivo.',
  'onboarding.makeItYours': 'Rendila tua',
  'onboarding.pickALookYouCanChangeEverythingLaterInSettings':
    'Scegli uno stile. Potrai cambiare tutto più tardi nelle Impostazioni.',
  'onboarding.aWalkInTheMorningSun': 'Una passeggiata al sole del mattino',
  'onboarding.gratefulForQuietStreetsWarmCoffeeAndASkyFull':
    'Riconoscente per le strade tranquille, il caffè caldo e un cielo pieno di colori.',
  'onboarding.moreThemes': 'Altri temi…',
  'onboarding.whatDoYouWantToBeMoreGratefulFor':
    'Per cosa vorresti provare più gratitudine?',
  'onboarding.wellSuggestWritingPromptsFromTheAreasYouPick':
    'Ti suggeriremo spunti di scrittura sui temi che scegli.',
  'onboarding.pickAtLeastCount': 'Scegline almeno {count}',
  'onboarding.helpImproveTackbok': 'Vuoi aiutare a migliorare Tackbok?',
  'onboarding.tackbokIsFreeAndOpenSourceAnonymousStatsHelpUs':
    'Tackbok è gratuito e open source. Le statistiche anonime ci aiutano a trovare bug e a capire quali funzioni contano.',
  'onboarding.anonymousUsageStatsOnlyIncludingWhichScreensAndFeaturesGet':
    'Solo statistiche di utilizzo anonime, ad esempio quali schermate e funzioni vengono usate.',
  'onboarding.neverYourJournalContentPhotosVoiceMemosOrAnythingYou':
    'Mai il contenuto del diario, le foto, i memo vocali o qualsiasi cosa tu scriva.',
  'onboarding.openSourceTheExactEventListIsPublicInThe':
    'Open source. L’elenco esatto degli eventi è pubblico nel repository.',
  'onboarding.seeExactlyWhatWeCollect': 'Vedi esattamente cosa raccogliamo',
  'onboarding.shareAnonymousStats': 'Condividi statistiche anonime',
  'onboarding.noThanks': 'No, grazie',
  'onboarding.whatWeCollect': 'Cosa raccogliamo',
  'onboarding.withYourPermissionTackbokRecordsLimitedAnonymousUsageInformationThis':
    'Con il tuo permesso, Tackbok registra informazioni di utilizzo limitate e anonime. Possono includere le schermate visitate, le funzioni usate e la riuscita delle operazioni facoltative. Non includono mai il contenuto del diario o ciò che scrivi.',
  'onboarding.auditTheAnalyticsCodeOnGithub':
    'Controlla il codice delle statistiche su GitHub',
  'onboarding.neverCollected': 'Cosa non raccogliamo mai',
  'onboarding.yourJournalTextTitlesPhotosVoiceMemosTagsNameEmail':
    'Testo del diario, titoli, foto, memo vocali, tag, nome, email o qualsiasi cosa tu scriva. Niente pubblicità, nessuna vendita di dati, nessun tracciamento di terze parti.',
  'onboarding.youreAllSetName': 'Tutto pronto, {name}!',
  'onboarding.youreAllSet': 'Tutto pronto!',
  'onboarding.twoLastThingsYouCanTurnOnBothAreOptional':
    'Ultime due cose che puoi attivare. Sono entrambe facoltative.',
  'onboarding.addExampleEntries': 'Aggiungi note di esempio',
  'onboarding.aFewSampleEntriesShowHowPhotosVoiceMemosMoods':
    'Alcune note di esempio mostrano come funzionano foto, memo vocali, umore e tag. Puoi rimuoverle quando vuoi con un tocco.',
  'onboarding.remindMeDaily': 'Ricordamelo ogni giorno',
  'onboarding.aGentleNudgeToWriteNeverYourJournalContent':
    'Un piccolo invito a scrivere. Mai il contenuto del tuo diario.',
  'onboarding.remindMeAtTime': 'Ricordamelo alle {time}',
  'onboarding.settingThingsUp': 'Preparazione in corso…',
  'onboarding.startJournaling': 'Inizia a scrivere',
  'onboarding.showingExampleEntries': 'Note di esempio visibili',
  'onboarding.removeAll': 'Rimuovi tutte',
  'onboarding.hideThisBanner': 'Nascondi questo banner',
  'onboarding.exampleEntriesRemoved': 'Note di esempio rimosse',
  'onboarding.failedToRemoveExampleEntries': 'Impossibile rimuovere le note di esempio',
  'onboarding.addTodaysEntryHere': 'Aggiungi qui la nota di oggi.',
  'onboarding.pressAndHoldThenDragToMoveTheseButtonsAlong':
    'Tieni premuto e trascina per spostare questi pulsanti lungo il bordo.',
  'onboarding.tapAnEntryToViewOrEditIt': 'Tocca una nota per vederla o modificarla.',
  'onboarding.findMemoriesByTextOrTag': 'Trova i ricordi per testo o tag.',
  'onboarding.replayOnboarding': 'Rivedi l’introduzione',
  'onboarding.runTheWelcomeSetupAgain': 'Ripeti l’introduzione di benvenuto',
  'onboarding.replayOnboarding2': 'Rivedere l’introduzione?',
  'onboarding.theWelcomeSetupWillStartAgainYourJournalEntriesAnd':
    'L’introduzione di benvenuto ripartirà. Le note del diario e le impostazioni restano.',
  'onboarding.replay': 'Rivedi',

  sample_tag_family: 'Famiglia',
  sample_tag_littleThings: 'Piccole cose',
  sample_entry_welcome_title: 'Ti diamo il benvenuto in Tackbok 👋',
  sample_entry_welcome_body:
    'Questo è il tuo diario della gratitudine, un posto per i momenti belli. Tocca il pulsante + per scrivere una riga o una pagina intera, una volta al giorno o quando vuoi. Tocca questa scheda per vedere la nota completa.',
  sample_entry_photos_title: 'Piccoli momenti',
  sample_entry_photos_body:
    'Puoi allegare foto a un ricordo. Toccane una per ingrandirla.',
  sample_entry_voice_title: 'Con parole mie',
  sample_entry_voice_body:
    'A volte è più facile dirlo ad alta voce. Tocca Riproduci per ascoltare un breve memo vocale.',
  sample_entry_tags_body:
    'Questa nota risponde a uno degli spunti di scrittura e ha due tag. Prova la ricerca in alto e filtra per tag per ritrovarla.',

  'insights.insights': 'Statistiche',
  'insights.overview': 'Panoramica',
  'insights.gratitudeScore': 'Punteggio di gratitudine',
  'insights.currentStreak': 'Serie attuale',
  'insights.longestStreak': 'Serie più lunga',
  'insights.daysJournaled': 'Giorni con una nota',
  'insights.consistency': 'Costanza',
  'insights.entries': 'Note',
  'insights.less': 'Meno',
  'insights.more': 'Più',
  'insights.yourHappiestDayIsWeekday': 'Il tuo giorno più felice: {weekday}',
  'insights.moodOverTime': 'Umore nel tempo',
  'insights.writingHabits': 'Abitudini di scrittura',
  'insights.morning': 'Mattina',
  'insights.afternoon': 'Pomeriggio',
  'insights.evening': 'Sera',
  'insights.night': 'Notte',
  'insights.youreAMorningWriter': 'Scrivi soprattutto di mattina',
  'insights.youreAnAfternoonWriter': 'Scrivi soprattutto di pomeriggio',
  'insights.youreAnEveningWriter': 'Scrivi soprattutto di sera',
  'insights.youreANightWriter': 'Scrivi soprattutto di notte',
  'insights.entriesPerMonth': 'Note al mese',
  'insights.topTags': 'Tag più usati',
  'insights.totals': 'Totali',
  'insights.words': 'Parole',
  'insights.characters': 'Caratteri',
  'insights.photos': 'Foto',
  'insights.voiceMemos': 'Memo vocali',
  'insights.yourMemories': 'I tuoi ricordi',
  'insights.onThisDay': 'In questo giorno',
  'insights.oneYearAgoToday': 'Un anno fa oggi',
  'insights.oneMonthAgoToday': 'Un mese fa oggi',
  'insights.countYearsAgoToday': '{count} anni fa oggi',
  'insights.aMomentFromThisDay': 'Un momento di questo giorno',
  'insights.noInsightsYet': 'Ancora nessuna statistica',
  'insights.writeAFewEntriesAndYourStatsWillShowUp':
    'Scrivi qualche nota e qui compariranno le tue statistiche.',

  'sharing.shareYourGratitude': 'Condividi la tua gratitudine',
  'sharing.iWasGratefulFor': 'Ero riconoscente per',
  'sharing.shareImage': 'Condividi immagine',
  'sharing.shareEntry': 'Condividi nota',
  'sharing.includeMood': 'Includi l’umore',
  'sharing.moodIsHiddenUnlessYouIncludeIt': 'L’umore resta nascosto se non lo includi',
  'sharing.includePhotos': 'Includi le foto',
  'sharing.upToTheFirstFivePhotosWillBeShared':
    'Verranno condivise al massimo le prime cinque foto',
  'sharing.chooseAStyle': 'Scegli uno stile',
  'sharing.sharingIsNotAvailableOnThisDevice':
    'La condivisione non è disponibile su questo dispositivo',
  'sharing.couldNotShareImagePleaseTryAgain':
    'Impossibile condividere l’immagine. Riprova.',
  'sharing.shareVoiceNote': 'Condividi memo vocale',
  'sharing.couldNotShareVoiceNotePleaseTryAgain':
    'Impossibile condividere il memo vocale. Riprova.',
  'sharing.saveImage': 'Salva immagine',
  'sharing.saveVoiceNote': 'Salva memo vocale',
  'sharing.couldNotSavePleaseTryAgain': 'Impossibile salvare. Riprova.',
  'sharing.saved': 'Salvato',
  'sharing.themeTheme': 'Tema {theme}',
  'sharing.themeThemeSelected': 'Tema {theme}, selezionato',
  'sharing.dayOneComplete': 'Primo giorno completato!',
  'sharing.aBeautifulBeginningKeepNoticingTheGood':
    'Un bellissimo inizio. Continua a cogliere il bello.',
  'sharing.countDaysOfGratitude': '{count} giorni di gratitudine!',
  'sharing.congratulationsOnMakingGratitudePartOfYourJourney':
    'Complimenti per aver reso la gratitudine parte del tuo percorso.',
  'sharing.shareAchievement': 'Condividi il traguardo',
  'sharing.openCountDayAchievement': 'Apri il traguardo di {count} giorni',

  'dateFormat.timeLabel': '{weekday} alle {time}',

  'cloud.attentionNeeded': 'Serve la tua attenzione',
  'cloud.backUpAndSyncYourJournalWithYourOwnGoogle':
    'Esegui il backup e sincronizza il diario con il tuo Google Drive. I dati vanno direttamente dal telefono al tuo Drive. Lo sviluppatore di Tackbok non li vede mai.',
  'cloud.lastUpdatedDateTime': 'Ultimo aggiornamento: {date}, {time}',
  'cloud.beforeYouConnect': 'Prima di collegarti',
  'cloud.checkingGoogleDriveForChanges': 'Ricerca di modifiche su Google Drive…',
  'cloud.chooseABackupToMergeWithThisJournalBothSides':
    'Scegli un backup da unire a questo diario. Vengono conservati entrambi.',
  'cloud.chooseABackupToRestoreOnThisDevice':
    'Scegli un backup da ripristinare su questo dispositivo.',
  'cloud.chooseWhichCopiesOfYourJournalToRemove':
    'Scegli quali copie del diario rimuovere.',
  'cloud.cloudBackupSync': 'Backup e sincronizzazione',
  'cloud.cloudBackupConnected': 'Backup su cloud collegato',
  'cloud.cloudBackupCouldNotBeUpdated': 'Impossibile aggiornare il backup su cloud',
  'cloud.cloudBackupDeleted': 'Backup su cloud eliminato',
  'cloud.cloudBackupDeletionReceived': 'Eliminazione del backup su cloud ricevuta',
  'cloud.cloudBackupNumber': 'Backup su cloud {number}',
  'cloud.backupsAreEncryptedInTransitAndAtRestByGoogle':
    'Il backup va direttamente da questo telefono a una cartella nascosta di Tackbok nel tuo Google Drive. Non viene mai inviato allo sviluppatore di Tackbok e Tackbok non può vedere gli altri file del tuo Drive. Google lo protegge come gli altri tuoi file, ma non è crittografato end-to-end.',
  'cloud.restoreComplete': 'Ripristino completato',
  'cloud.restoreNeedsAttention': 'Il ripristino richiede la tua attenzione',
  'cloud.restorePausedItContinuesWhenTackbokIsOpenAndOnline':
    'Ripristino in pausa. Riprende quando Tackbok è aperto e online.',
  'cloud.youCanKeepUsingTackbokWhileItRestores':
    'Puoi continuare a usare Tackbok durante il ripristino.',
  'cloud.restoreMayTakeAMoment': 'Potrebbe volerci qualche istante.',
  'cloud.yourJournalIsReadyDownloadingPhotosAndVoiceNotesProgress':
    'Il diario è pronto. Foto e memo vocali su questo dispositivo: {downloaded} di {total}.',
  'cloud.photosAndVoiceNotesWaitingForWiFiCount':
    'Foto e memo vocali in attesa del Wi-Fi: {number}',
  'cloud.viewCloudBackup': 'Vedi il backup su cloud',
  'cloud.cloudSyncPhotosAndVoiceNotesToDownload':
    'Sincronizzazione: foto e memo vocali da scaricare',
  'cloud.cloudSyncAttentionNeeded': 'Sincronizzazione: serve la tua attenzione',
  'cloud.cloudSyncChangesSafelyQueued': 'Sincronizzazione: modifiche salvate in coda',
  'cloud.cloudSyncPaused': 'Sincronizzazione: in pausa',
  'cloud.cloudSyncSyncing': 'Sincronizzazione: in corso',
  'cloud.cloudSyncUpToDate': 'Sincronizzazione: tutto aggiornato',
  'cloud.connectGoogleDrive': 'Collega Google Drive',
  'cloud.connecting': 'Collegamento…',
  'cloud.createCloudBackup': 'Crea backup su cloud',
  'cloud.deleteCloudAndLocalJournalData':
    'Elimina i dati del diario sul cloud e in locale',
  'cloud.deleteCloudBackup': 'Elimina backup su cloud',
  'cloud.deleteCloudBackup2': 'Eliminare il backup su cloud?',
  'cloud.deleteJournalEverywhere': 'Elimina il diario ovunque',
  'cloud.deleteJournalEverywhere2': 'Eliminare il diario ovunque?',
  'cloud.deleteOrResetData': 'Elimina o reimposta i dati',
  'cloud.deletingJournalEverywhere': 'Eliminazione del diario ovunque…',
  'cloud.removingTheCloudBackupAndJournalData':
    'Rimozione del backup su cloud e dei dati del diario. Se esci da Tackbok, potrai riprendere l’eliminazione al ritorno.',
  'cloud.disconnect': 'Scollega',
  'cloud.disconnecting': 'Scollegamento…',
  'cloud.disconnectedYourJournalStaysOnThisPhone':
    'Scollegato. Il diario resta su questo telefono e il backup resta nel tuo Google Drive.',
  'cloud.couldNotDisconnectTryAgain': 'Impossibile scollegare. Riprova.',
  'cloud.pausing': 'Messa in pausa…',
  'cloud.disconnectProvider': 'Scollega {provider}',
  'cloud.disconnectProviderFromThisDevice':
    'Scollegare {provider} da questo dispositivo?',
  'cloud.disconnectThenDeleteLocalJournalDataOnly':
    'Scollega, poi elimina solo i dati del diario in locale',
  'cloud.editsRemainSafelyQueuedOnThisDevice':
    'Le modifiche restano al sicuro in coda su questo dispositivo.',
  'cloud.googleDrive': 'Google Drive',
  'cloud.googleDriveAccessIsRequiredTryAgainAndSelectThe':
    'Serve l’accesso a Google Drive. Riprova e seleziona la casella di accesso a Drive.',
  'cloud.googleDriveConnected': 'Google Drive collegato',
  'cloud.googleDriveConnectionWasNotCompleted':
    'Il collegamento a Google Drive non è stato completato',
  'cloud.googleDriveCouldNotBeReachedYourChangesRemainSafely':
    'Impossibile raggiungere Google Drive. Le modifiche restano al sicuro in coda.',
  'cloud.photosAndVoiceMemosAreWaitingForWiFiYour':
    'Foto e memo vocali sono in attesa del Wi-Fi. Le modifiche restano al sicuro in coda.',
  'cloud.aPhotoOrVoiceNoteOnThisDeviceCouldNotBeRead':
    'Impossibile leggere una foto o un memo vocale su questo dispositivo. Le modifiche restano al sicuro in coda.',
  'cloud.googleDriveDisconnectedOnThisDevice':
    'Google Drive scollegato su questo dispositivo',
  'cloud.googleDriveIsBusyTryAgainShortly': 'Google Drive è occupato. Riprova tra poco.',
  'cloud.googleDriveNeedsToBeReconnected': 'Devi ricollegare Google Drive.',
  'cloud.googleDriveReconnected': 'Google Drive ricollegato',
  'cloud.googleDriveStorageIsFull': 'Lo spazio di Google Drive è pieno.',
  'cloud.googleDriveStatus': 'Google Drive: {status}',
  'cloud.ifGoogleShowsADriveAccessCheckboxSelectItBackup':
    'Se Google chiede di consentire a Tackbok di usare una propria cartella nel tuo Drive, accetta per collegare il backup.',
  'cloud.journalDeletionReceived': 'Eliminazione del diario ricevuta',
  'cloud.photosAndVoiceNotesSyncOnlyOnWiFi':
    'Foto e memo vocali vengono caricati e scaricati solo con il Wi-Fi. Il resto del diario continua a essere salvato anche con i dati mobili, a meno che una nuova foto profilo non sia in attesa del Wi-Fi.',
  'cloud.keepLocalDataAndTheCloudCopy': 'Tieni i dati locali e la copia su cloud',
  'cloud.keepLocalJournalData': 'Tieni i dati del diario in locale',
  'cloud.keepTheCloudCopyAndOtherDevices':
    'Tieni la copia su cloud e gli altri dispositivi',
  'cloud.lastSuccessfulSyncDate': 'Ultima sincronizzazione riuscita: {date}',
  'cloud.localDataAndTheCloudBackupWillBothRemainOther':
    'Restano sia i dati locali sia il backup su cloud. Gli altri dispositivi restano collegati.',
  'cloud.savingYourChangesToGoogleDrive': 'Salvataggio delle modifiche su Google Drive…',
  'cloud.noTackbokBackupFoundInThisGoogleAccount':
    'Nessun backup di Tackbok trovato in questo account Google',
  'cloud.noInternetConnectionYourChangesRemainSafelyQueued':
    'Nessuna connessione a Internet. Le modifiche restano al sicuro in coda.',
  'cloud.noExistingTackbokBackupWasFoundCreateOneForThis':
    'Non è stato trovato nessun backup di Tackbok. Creane uno per questo diario.',
  'cloud.optionalCloudBackup': 'Backup su cloud facoltativo',
  'cloud.pauseSync': 'Sospendi sincronizzazione',
  'cloud.preparingYourChanges': 'Preparazione delle modifiche…',
  'cloud.restoringYourJournalFromGoogleDrive': 'Ripristino del diario da Google Drive…',
  'cloud.profile': 'Profilo',
  'cloud.reconnectGoogleDrive': 'Ricollega Google Drive',
  'cloud.conflicts.title': 'Modifiche su due dispositivi',
  'cloud.conflicts.nameChanged':
    'Il tuo nome è stato modificato su due dispositivi. Attuale: “{current}”. Altra versione: “{other}”.',
  'cloud.conflicts.nameChangedNoCurrent':
    'Il tuo nome è stato modificato su due dispositivi. Attuale: nessun nome. Altra versione: “{other}”.',
  'cloud.conflicts.nameRemoved':
    'Il tuo nome è stato modificato su due dispositivi. Attuale: “{current}”. Altra versione: nessun nome.',
  'cloud.conflicts.useName': 'Usa “{name}”',
  'cloud.conflicts.removeName': 'Lascia senza nome',
  'cloud.conflicts.keepCurrent': 'Tieni l’attuale',
  'cloud.conflicts.photoChanged':
    'La tua foto profilo è stata cambiata su un altro dispositivo.',
  'cloud.conflicts.otherPhoto': 'Foto profilo dall’altro dispositivo',
  'cloud.conflicts.usePhoto': 'Usa questa foto',
  'cloud.conflicts.photoRemoved':
    'La tua foto profilo è stata rimossa su un altro dispositivo.',
  'cloud.conflicts.removePhoto': 'Lascia senza foto',
  'cloud.conflicts.entriesEdited':
    '{count} note sono state modificate su due dispositivi contemporaneamente. Entrambe le versioni sono nel tuo diario.',
  'cloud.conflicts.showThem': 'Mostrale',
  'cloud.conflicts.otherVersionsTitle': 'Altre versioni',
  'cloud.conflicts.otherVersionsDescription':
    'Queste note sono state modificate su due dispositivi contemporaneamente, quindi sono state conservate entrambe le versioni. Scegli quella da tenere o tienile entrambe come note separate.',
  'cloud.conflicts.noOtherVersions': 'Nessuna nota ha un’altra versione.',
  'cloud.conflicts.homeNotice':
    'Alcune modifiche sono state fatte su due dispositivi contemporaneamente. Vedi cosa è stato mantenuto.',
  'cloud.conflicts.homeNoticeEntries':
    '{count} note sono state modificate su due dispositivi contemporaneamente. Non si è perso nulla: tutte le versioni sono nel tuo diario.',
  'cloud.conflicts.compareVersions': 'Confronta le versioni',
  'cloud.conflicts.hideNotice': 'Nascondi questo avviso',
  'cloud.conflicts.hideNoticeHint':
    'Lo nasconde su tutti i tuoi dispositivi. Ricompare se altre modifiche vengono fatte su due dispositivi contemporaneamente.',
  'cloud.conflicts.otherVersionsRow': 'Note conservate in due versioni',
  'cloud.conflicts.loadFailed': 'Impossibile caricare queste scelte.',
  'cloud.conflicts.otherVersionsLoadFailed': 'Impossibile caricare le altre versioni.',
  'cloud.conflicts.versionsOf': 'Versioni di una nota del {date}',
  'cloud.conflicts.original': 'Originale',
  'cloud.conflicts.keepThisOne': 'Tieni questa',
  'cloud.conflicts.keepOriginal': 'Tieni l’originale',
  'cloud.conflicts.keepOtherVersion': 'Tieni quest’altra versione',
  'cloud.conflicts.keepThisOneTitle': 'Tenere questa versione?',
  'cloud.conflicts.keepThisOneMessage':
    'Questa versione verrà mantenuta su tutti i tuoi dispositivi al posto delle altre ({count}).',
  'cloud.conflicts.keepConfirm': 'Tieni questa versione',
  'cloud.conflicts.keepBoth': 'Tienile entrambe',
  'cloud.conflicts.keepBothHint':
    'Salva questa versione come nuova nota con la stessa data, lo stesso umore e gli stessi tag. Gli allegati restano nella nota originale.',
  'cloud.conflicts.keptBoth': 'Salvata come nuova nota.',
  'cloud.conflicts.attachmentCount': 'Allegati: {count}',
  'cloud.conflicts.entryReturned':
    'Hai eliminato questa nota su un dispositivo mentre veniva modificata su un altro, quindi è stata mantenuta la versione modificata.',
  'cloud.conflicts.entriesReturned':
    '{count} note che avevi eliminate su un dispositivo sono state modificate su un altro, quindi sono state mantenute le versioni modificate.',
  'cloud.conflicts.openEntry': 'Apri la nota',
  'cloud.conflicts.gotIt': 'Ho capito',
  'cloud.conflicts.versionsChanged':
    'Le versioni sono cambiate mentre sceglievi, quindi non è stato salvato nulla. Controllale e scegli di nuovo.',
  'cloud.conflicts.allDone': 'Fatto. Ora ogni nota ha una sola versione.',
  'cloud.conflicts.titleDiffers': 'Titolo diverso',
  'cloud.conflicts.textDiffers': 'Testo diverso',
  'cloud.conflicts.moodDiffers': 'Umore diverso',
  'cloud.conflicts.dateDiffers': 'Data diversa',
  'cloud.conflicts.timeDiffers': 'Orario diverso',
  'cloud.resetThisDeviceOnly': 'Reimposta solo questo dispositivo',
  'cloud.resetThisDeviceOnly2': 'Reimpostare solo questo dispositivo?',
  'cloud.merge': 'Unisci',
  'cloud.restoreCloudBackup': 'Ripristina backup su cloud',
  'cloud.restoreFromYourCloudBackup': 'Ripristina dal backup su Google Drive',
  'cloud.restoring': 'Ripristino…',
  'cloud.safelyQueued': 'Al sicuro in coda',
  'cloud.gettingChangesFromYourOtherDevices':
    'Recupero delle modifiche dagli altri dispositivi…',
  'cloud.setupElapsedSeconds': 'Tempo trascorso: {seconds} s',
  'cloud.setupProgressHelp':
    'Tackbok sta collegando questo dispositivo e avviando la prima sincronizzazione. Backup grandi, foto e memo vocali possono richiedere più tempo.',
  'cloud.setupTakingLonger':
    'Ci vuole più del solito. Controlla la connessione a Internet. Se esci da Tackbok, riprenderà da dove si era interrotto.',
  'cloud.settingUpCloudSync': 'Configurazione della sincronizzazione…',
  'cloud.downloadingPhotosAndVoiceNotes': 'Download di foto e memo vocali…',
  'cloud.syncCompleted': 'Sincronizzazione completata',
  'cloud.syncNow': 'Sincronizza ora',
  'cloud.resumeSyncToSyncNow': 'Riprendi la sincronizzazione per sincronizzare ora.',
  'cloud.fixTheProblemAboveToSyncNow':
    'Risolvi il problema qui sopra per sincronizzare ora.',
  'cloud.syncPaused': 'Sincronizzazione in pausa',
  'cloud.syncResumed': 'Sincronizzazione ripresa',
  'cloud.syncIsFasterWithTackbokOpen':
    'La sincronizzazione è più veloce con Tackbok aperto. Se esci, riprende da dove si era fermata.',
  'cloud.progress.combiningChanges': 'Unione delle modifiche…',
  'cloud.progress.checkingDownload': 'Verifica del download…',
  'cloud.progress.confirmingUpload': 'Conferma del caricamento…',
  'cloud.progress.checkingPhotosAndVoiceNotes':
    'Verifica di foto e memo vocali caricati…',
  'cloud.progress.uploadingPhotosAndVoiceNotes': 'Caricamento di foto e memo vocali…',
  'cloud.progress.devicesChecked': 'Dispositivi controllati: {done} di {count}',
  'cloud.progress.filesDownloaded': 'File scaricati: {done} di {count}',
  'cloud.progress.doneOfTotal': '{done} di {total}',
  'cloud.progress.doneOfTotalWithAmount':
    '{done} di {total} ({doneAmount} di {totalAmount})',
  'cloud.progress.stepOfTotal': 'Passaggio {step} di {total}',
  'cloud.progress.stepOfTotalWithTimeLeft': 'Passaggio {step} di {total} · {timeLeft}',
  'cloud.progress.aboutMinutesLeft': 'ancora circa {minutes} min',
  'cloud.progress.lessThanAMinuteLeft': 'ancora meno di un minuto',
  'cloud.progress.rateLimitedRetryingInSeconds':
    'Google ci ha chiesto di rallentare. Nuovo tentativo tra {seconds} s',
  'cloud.progress.connectionProblemRetryingInSeconds':
    'Problema di connessione. Nuovo tentativo tra {seconds} s',
  'cloud.progress.waitingForInternet': 'In attesa di Internet…',
  'cloud.progress.waitingForWifi':
    'In attesa del Wi-Fi per sincronizzare foto e memo vocali',
  'cloud.syncMediaOnWiFiOnly': 'Foto e memo vocali solo con Wi-Fi',
  'cloud.syncing': 'Sincronizzazione…',
  'cloud.theCloudCopyAndThisDevicesJournalWillBePermanently':
    'La copia su cloud e il diario di questo dispositivo verranno eliminati definitivamente. Gli altri dispositivi elimineranno il proprio diario locale alla sincronizzazione.',
  'cloud.theCloudCopyWillBePermanentlyDeletedAfterVerificationLocal':
    'La copia su cloud verrà eliminata definitivamente dopo una verifica. I dati del diario in locale restano.',
  'cloud.thisCloudBackupWasDeletedLocalJournalDataRemainsOn':
    'Questo backup su cloud è stato eliminato. I dati del diario restano su questo dispositivo.',
  'cloud.thisCloudBackupContainsDataTackbokCannotRead':
    'Questo backup su cloud contiene dati che Tackbok non riesce a leggere.',
  'cloud.finishDeletingThisJournal': 'Completare l’eliminazione del diario?',
  'cloud.cloudDeletionIsAlreadyRecordedEraseTheRemainingJournalData':
    'L’eliminazione sul cloud è già registrata. Cancella i dati del diario rimasti su questo dispositivo.',
  'cloud.finishDeletion': 'Completa l’eliminazione',
  'cloud.yourGoogleEmailIsStoredSecurelyOnThisDeviceTo':
    'La tua email Google resta su questo telefono per mostrare quale account è collegato e viene rimossa quando ti scolleghi.',
  'cloud.thisDeviceDisconnectsFirstThenDeletesItsLocalJournalThe':
    'Questo dispositivo prima si scollega, poi elimina il proprio diario locale. Il backup su cloud e gli altri dispositivi restano.',
  'cloud.thisDeviceWasReset': 'Questo dispositivo è stato reimpostato',
  'cloud.thisJournalWasDeletedEverywhereThisDeviceIsDisconnected':
    'Questo diario è stato eliminato ovunque. Questo dispositivo è scollegato.',
  'cloud.upToDate': 'Aggiornato',
  'cloud.waitingForTheFirstSuccessfulSync':
    'In attesa della prima sincronizzazione riuscita',
  'cloud.youCanLeaveThisScreenSyncingResumesWhenTackbokIs':
    'Puoi lasciare questa schermata: la sincronizzazione riprende quando Tackbok è attivo.',
  'cloud.yourJournalStaysOnYourDeviceCloudBackupIsOptional':
    'Il diario resta sul tuo telefono. Se attivi il backup, una copia va solo nel tuo Google Drive.',
  'cloud.countChangesSafelyQueued':
    '{count} modifiche salvate, in attesa di sincronizzazione',
  'cloud.countChangesRemaining': '{count} modifiche rimanenti',
  'cloud.photosAndVoiceNotesToDownloadCount': 'Foto e memo vocali da scaricare: {number}',
  'cloud.googleDriveAuthorizationNeedsAttention':
    'Google Drive ti chiede di accedere di nuovo. La sincronizzazione si è interrotta.',
  'cloud.thisBackupBelongsToADifferentConnectedGoogleAccount':
    'Questo backup appartiene a un altro account Google. La sincronizzazione si è interrotta.',
  'cloud.googleDrivePermissionWasNotFullyGranted':
    'Tackbok non ha ricevuto l’accesso completo a Google Drive. La sincronizzazione si è interrotta.',
  'cloud.theConnectedCloudBackupDoesNotMatchThisJournal':
    'Il backup collegato appartiene a un altro diario. La sincronizzazione si è interrotta.',
  'cloud.thisBackupWasCreatedByANewerTackbokVersion':
    'Questo backup è stato creato da una versione più recente di Tackbok. La sincronizzazione si è interrotta.',
  'cloud.aCloudSnapshotFailedItsSafetyChecks':
    'Impossibile leggere una parte del backup su Google Drive. La sincronizzazione si è interrotta.',
  'cloud.aDeviceBackupPointsToAMissingSnapshot':
    'Una parte del backup manca da Google Drive. La sincronizzazione si è interrotta.',
  'cloud.anotherPhoneBacksUpAsThisDevice':
    'Un altro telefono sta facendo il backup come se fosse questo dispositivo, ad esempio dopo il ripristino di un backup del telefono. La sincronizzazione si è interrotta su questo telefono. Continua come nuovo dispositivo per sincronizzare di nuovo. Nel tuo diario non si perde nulla.',
  'cloud.thisDeviceClockWasFarAhead':
    'La data e l’ora di questo dispositivo erano impostate molto avanti nel futuro, quindi gli altri dispositivi non possono accettarne le modifiche. Continua come nuovo dispositivo per risolvere. Nel tuo diario non si perde nulla.',
  'cloud.continueAsNewDevice': 'Continua come nuovo dispositivo',
  'cloud.continuedAsNewDevice': 'Ora questo dispositivo si sincronizza come nuovo.',
  'cloud.massDeletion.message':
    'Le modifiche da un altro dispositivo eliminerebbero gran parte del diario su questo dispositivo. Non è stato eliminato nulla. Tieni le tue note oppure eliminale anche qui, se era quello che volevi.',
  'cloud.massDeletion.keep': 'Tieni le mie note',
  'cloud.massDeletion.apply': 'Eliminale anche qui',
  'cloud.massDeletion.applyTitle': 'Eliminare queste note anche qui?',
  'cloud.massDeletion.applyDescription':
    'Le note eliminate sull’altro dispositivo vengono eliminate anche su questo. Tackbok non potrà recuperarle.',
  'cloud.massDeletion.kept':
    'Le tue note sono state mantenute. Torneranno anche sugli altri dispositivi.',
  'cloud.massDeletion.applied': 'Le note sono state eliminate anche qui.',
  'cloud.changesFromAnotherDeviceCouldNotBeCombined':
    'Tackbok non è riuscito a unire le modifiche di un altro dispositivo con questo. Su questo dispositivo non è cambiato nulla. La sincronizzazione si è interrotta. Aggiornare Tackbok sui tuoi dispositivi potrebbe aiutare. Puoi esportare una copia del diario dalle Impostazioni.',
  'cloud.tackbokCouldNotSafelyStageBackupDataOnThisDevice':
    'Tackbok non è riuscito a salvare i dati di sincronizzazione su questo dispositivo. Lo spazio potrebbe essere quasi esaurito. La sincronizzazione si è interrotta.',
  'cloud.googleDriveDoesNotHaveEnoughFreeStorage':
    'Lo spazio di Google Drive è pieno. La sincronizzazione si è interrotta.',
  'cloud.googleDriveDeniedAccessToTheAppBackupFolder':
    'Google Drive impedisce a Tackbok di accedere al backup. La sincronizzazione si è interrotta.',
  'cloud.aReferencedPhotoOrVoiceMemoIsUnavailable':
    'Impossibile trovare una foto o un memo vocale. La sincronizzazione si è interrotta.',
  'cloud.aLocalPhotoOrVoiceMemoCouldNotBeVerified':
    'Impossibile leggere una foto o un memo vocale su questo dispositivo. La sincronizzazione si è interrotta.',
  'cloud.yourJournalIsNotReadyForCloudSyncYet':
    'Tackbok non è riuscito a preparare il diario per il backup. La sincronizzazione si è interrotta.',
  'cloud.thisCloudBackupWasDeletedFromAnotherDevice':
    'Questo backup è stato eliminato. Le note già presenti su questo dispositivo non sono state rimosse.',
  'cloud.thisJournalWasDeletedEverywhereFromAnotherDevice':
    'Il diario e il suo backup sono stati eliminati ovunque. Cancella questo dispositivo per completare.',
  'cloud.cloudDeletionStoppedBeforeEveryBackupObjectWasRemoved':
    'L’eliminazione del backup non è stata completata. Una parte potrebbe essere ancora su Google Drive. Tocca “Riprendi l’eliminazione” per riprovare. Se si interrompe di nuovo, scollega Google Drive in Tackbok su tutti i tuoi dispositivi, poi apri Google Drive dal web e vai su Impostazioni › Gestisci app › Tackbok › Opzioni ed elimina i dati nascosti dell’app.',
  'cloud.skippedHeads.unreadable':
    'Tackbok non riesce a leggere il backup di uno o più dei tuoi dispositivi, quindi le loro modifiche non sono incluse. La sincronizzazione continua con gli altri dispositivi.',
  'cloud.skippedHeads.clockAhead':
    'Le modifiche di uno o più dei tuoi dispositivi sono in attesa perché la loro data e ora sono impostate molto avanti nel futuro. Su quei dispositivi imposta data e ora automatiche, poi apri Tackbok.',
  'cloud.replaceBackup.action':
    'Sostituisci questo backup con il diario di questo dispositivo',
  'cloud.replaceBackup.title': 'Sostituire questo backup?',
  'cloud.replaceBackup.confirm': 'Sostituisci backup',
  'cloud.replaceBackup.description':
    'I backup dei dispositivi che Tackbok non riesce a leggere vengono rimossi da Google Drive e al loro posto viene salvato il diario di questo dispositivo. I backup leggibili degli altri dispositivi vengono mantenuti e uniti come al solito. Ciò che si trovava solo nei backup illeggibili non potrà essere recuperato.',
  'cloud.replaceBackup.done': 'I backup illeggibili sono stati rimossi.',
  'cloud.history.title': 'Cronologia dei backup',
  'cloud.history.row': "Esporta o ripristina il diario com'era in un giorno precedente",
  'cloud.history.description':
    "Google Drive conserva un backup per ciascuno degli ultimi 30 giorni. Esportane uno come file ZIP, o ripristinalo per riavere le note com'erano quel giorno.",
  'cloud.history.empty': 'Ancora nessun backup precedente.',
  'cloud.history.loadFailed':
    'Impossibile caricare la cronologia dei backup. Controlla la connessione e riprova.',
  'cloud.history.savedAt': 'Salvato alle {time}',
  'cloud.history.export': 'Esporta',
  'cloud.history.restore': 'Ripristina',
  'cloud.history.exportLabel': 'Esporta il backup del {date}',
  'cloud.history.restoreLabel': 'Ripristina il backup del {date}',
  'cloud.history.exported': 'Backup esportato',
  'cloud.history.missingMedia':
    'Alcune foto o memo vocali di questo backup non sono più salvati da nessuna parte, quindi sono stati esclusi.',
  'cloud.history.restoreTitle': 'Ripristinare il backup del {date}?',
  'cloud.history.restoreDescription':
    "Le note di questo backup tornano, comprese quelle eliminate in seguito, e le note che hai scritto dopo restano. Poi scegli cosa succede alle note presenti in entrambi: lasciarle come sono o sostituirle con la versione del backup, foto e tag compresi. Il nome e la foto del profilo vengono compilati solo se sono vuoti. Per conservare una copia del diario com'è adesso, esportalo prima in Impostazioni.",
  'cloud.history.restoreConfirm': 'Continua',
  'cloud.history.gone': 'Questo backup non è più su Google Drive. Scegline un altro.',
  'cloud.history.unreadable': 'Impossibile leggere questo backup. Scegline un altro.',
  'cloud.history.failed':
    'Impossibile preparare questo backup. Controlla la connessione e riprova.',
  'cloud.chooseAGoogleAccountToReconnect': 'Scegli un account Google da ricollegare',
  'cloud.updateTackbok': 'Aggiorna Tackbok',
  'cloud.manageGoogleDriveStorage': 'Gestisci lo spazio di Google Drive',
  'cloud.reviewDeletionAndEraseThisDevice': 'Rivedi e cancella questo dispositivo',
  'cloud.resumeDeletion': 'Riprendi l’eliminazione',
  'cloud.syncAgain': 'Sincronizza di nuovo',
  'cloud.disconnectAndSetUpAgain': 'Scollega e configura di nuovo',
  'cloud.openSettingsToExport': 'Apri Impostazioni per esportare',
  'cloud.openDeviceSettings': 'Apri le impostazioni del dispositivo',
  'cloud.toKeepACopyUseExportInSettings':
    'Per tenere una copia del diario, tocca {action} in {section}.',
  'cloud.backupFoundButCouldNotBeRead':
    'Tackbok ha trovato un backup in questo account Google, ma non è riuscito a leggerlo. Aggiornare Tackbok potrebbe aiutare.',
  'cloud.backupFoundButCouldNotBeReadCreateNew':
    'Tackbok ha trovato un backup in questo account Google, ma non è riuscito a leggerlo. Aggiornare Tackbok potrebbe aiutare. Puoi anche creare un nuovo backup per questo diario.',
  'cloud.someBackupsInThisAccountCouldNotBeRead':
    'Impossibile leggere alcuni backup in questo account. Aggiornare Tackbok potrebbe aiutare.',
  'cloud.updateToUseThisBackup': 'Aggiorna Tackbok per usare questo backup.',
  'cloud.cloudDeletionCompleted': 'Eliminazione sul cloud completata',
  'cloud.cloudBackupRetryCompleted': 'Nuovo tentativo di backup su cloud completato',
  'cloud.cloudSyncCouldNotFinishYourChangesRemainSafelyQueued':
    'La sincronizzazione non è stata completata. Le modifiche restano al sicuro in coda.',
  'cloud.googleDriveRejectedABackupRequestUpdateTackbokAndRetry':
    'Google Drive non ha accettato una richiesta di Tackbok. Aggiornare Tackbok potrebbe aiutare. La sincronizzazione si è interrotta.',
  'time.hours': 'Ore',
  'time.minutes': 'Minuti',
  'common.databaseUpdateFailed':
    'Impossibile aggiornare il database del diario: {message}',
} satisfies Translations;
