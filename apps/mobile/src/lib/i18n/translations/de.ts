import type { Translations } from '../types';

/**
 * German (de) translations
 * Contains translations for all UI strings used in the application
 */
export const de: Translations = {
  // Common
  Tackbok: 'Tackbok',
  Cancel: 'Abbrechen',
  Done: 'Fertig',
  Save: 'Speichern',
  Edit: 'Bearbeiten',
  Add: 'Hinzufügen',
  Back: 'Zurück',
  Create: 'Erstellen',
  Discard: 'Verwerfen',
  Delete: 'Löschen',
  Remove: 'Entfernen',
  Close: 'Schließen',
  Play: 'Abspielen',
  Pause: 'Pause',
  Settings: 'Einstellungen',
  'Share Feedback': 'Feedback teilen',
  'Contact Us': 'Kontakt',
  'Unknown error': 'Unbekannter Fehler',
  Retry: 'Erneut versuchen',

  // Header & Search
  'Search gratitude logs...': 'Dankbarkeitseinträge durchsuchen …',
  'Start typing to search your gratitude logs':
    'Tippe etwas ein, um deine Dankbarkeitseinträge zu durchsuchen',
  'Search failed': 'Suche fehlgeschlagen',
  'No results': 'Keine Ergebnisse',

  // Gratitude
  'What are you grateful for today?': 'Wofür bist du heute dankbar?',
  'What were you grateful for yesterday?': 'Wofür warst du gestern dankbar?',
  'What are you grateful for?': 'Wofür bist du dankbar?',
  'What were you grateful for?': 'Wofür warst du dankbar?',
  'Failed to load entries': 'Einträge konnten nicht geladen werden',
  'Write now': 'Jetzt schreiben',
  'Pick a date': 'Datum auswählen',
  'Collapse gratitude actions': 'Dankbarkeitsaktionen einklappen',
  'Expand gratitude actions': 'Dankbarkeitsaktionen ausklappen',

  // Date Entries
  'Loading...': 'Wird geladen …',
  'No entries for this date': 'Keine Einträge für dieses Datum',
  'Create Entry': 'Eintrag erstellen',
  'Something went wrong. Creating new entry.':
    'Etwas ist schiefgelaufen. Ein neuer Eintrag wird erstellt.',

  // Gratitude Entry
  'Delete Entry?': 'Eintrag löschen?',
  'This entry will be permanently deleted.': 'Dieser Eintrag wird dauerhaft gelöscht.',
  'Entry not found': 'Eintrag nicht gefunden',
  'Leave without saving?': 'Ohne Speichern verlassen?',
  'Your entry is unsaved. Would you like to keep editing or discard them?':
    'Dein Eintrag ist nicht gespeichert. Möchtest du ihn weiter bearbeiten oder verwerfen?',
  'Keep Editing': 'Weiter bearbeiten',

  'Pick any date': 'Beliebiges Datum auswählen',
  Mood: 'Stimmung',
  Photo: 'Foto',
  'Add Photo': 'Foto hinzufügen',
  'Take Photo': 'Foto aufnehmen',
  'Choose from Library': 'Aus Mediathek auswählen',
  'Maximum {count} photos per entry': 'Maximal {count} Fotos pro Eintrag',
  'Maximum {count} voice memos per entry': 'Maximal {count} Sprachnotizen pro Eintrag',
  'Camera Access Required': 'Kamerazugriff erforderlich',
  'Photo Library Access Required': 'Zugriff auf die Fotomediathek erforderlich',
  'Please enable camera access in your device settings to take photos.':
    'Aktiviere in den Geräteeinstellungen den Kamerazugriff, um Fotos aufzunehmen.',
  'Please enable photo library access in your device settings to select photos.':
    'Aktiviere in den Geräteeinstellungen den Zugriff auf die Fotomediathek, um Fotos auszuwählen.',
  'Open Settings': 'Einstellungen öffnen',
  Voice: 'Stimme',
  'Microphone Access Required': 'Mikrofonzugriff erforderlich',
  'Please enable microphone access in your device settings to record voice memos.':
    'Aktiviere in den Geräteeinstellungen den Mikrofonzugriff, um Sprachnotizen aufzunehmen.',
  'Record Voice Note': 'Sprachnotiz aufnehmen',
  'Tap the button below when ready.':
    'Tippe auf die Schaltfläche unten, wenn du bereit bist.',
  'Start Recording': 'Aufnahme starten',
  'Recording Voice Note...': 'Sprachnotiz wird aufgenommen …',
  'Stop Recording': 'Aufnahme beenden',
  'Voice Note Recorded': 'Sprachnotiz aufgenommen',
  'Tap on the play button to listen.': 'Tippe zum Anhören auf die Wiedergabetaste.',
  'Save Recording': 'Aufnahme speichern',
  'Discard Recording': 'Aufnahme verwerfen',
  'Voice notes save automatically at 30:00.':
    'Sprachnotizen werden bei 30:00 automatisch gespeichert.',
  'Title (optional)': 'Titel (optional)',
  'Use Prompt': 'Schreibimpuls verwenden',
  'New Prompt': 'Neuer Schreibimpuls',
  'Add Prompt': 'Schreibimpuls hinzufügen',
  'Show All': 'Alle anzeigen',
  'Prompt text': 'Text des Schreibimpulses',
  'Prompt already exists': 'Schreibimpuls ist bereits vorhanden',
  'Prompt created': 'Schreibimpuls erstellt',
  'Failed to create prompt': 'Schreibimpuls konnte nicht erstellt werden',
  'Prompt updated': 'Schreibimpuls aktualisiert',
  'Failed to update prompt': 'Schreibimpuls konnte nicht aktualisiert werden',
  'Prompt deleted': 'Schreibimpuls gelöscht',
  'Failed to delete prompt': 'Schreibimpuls konnte nicht gelöscht werden',
  Faith: 'Glaube',
  Self: 'Ich',
  Health: 'Gesundheit',
  Friends: 'Freunde',
  Family: 'Familie',
  'Little things': 'Kleine Dinge',
  'Create Prompt': 'Schreibimpuls erstellen',
  'Create a Prompt': 'Einen Schreibimpuls erstellen',
  'Edit Prompt': 'Schreibimpuls bearbeiten',
  'Delete Prompt': 'Schreibimpuls löschen',
  'Delete Prompt?': 'Schreibimpuls löschen?',
  'Are you sure you want to delete this prompt?':
    'Möchtest du diesen Schreibimpuls wirklich löschen?',
  'No prompts yet': 'Noch keine Schreibimpulse',
  'Create your first prompt': 'Erstelle deinen ersten Schreibimpuls',

  // Prompts - Faith
  prompt_faith_1:
    'Was ist deine früheste Erinnerung daran, Gottes Gegenwart gespürt zu haben?',
  prompt_faith_2: 'Wo hast du in letzter Zeit Gnade in deinem Leben erfahren?',
  prompt_faith_3: 'Welches Gebet hat dich durch eine schwere Zeit getragen?',
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
  prompt_self_9: 'Beschreibe deinen idealen, perfekten Tag vom Morgen bis zum Abend.',

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
    'Beschreibe ein kleines, alltägliches Detail in deiner Umgebung, das schön ist.',
  prompt_littleThings_5: 'Welches Geräusch hörst du morgens beim Aufwachen am liebsten?',
  prompt_littleThings_6:
    'Schreibe über eine einfache Freude, auf die du dich jeden Tag freust.',
  prompt_littleThings_7: 'Was war heute der schönste Teil deiner Morgenroutine?',
  prompt_littleThings_8:
    'Erzähle von einer kurzen Begegnung mit einer fremden Person, die dein Herz erwärmt hat.',
  prompt_littleThings_9: 'Welcher günstige Gegenstand bereichert dein Leben besonders?',

  // Default Worksheet Template Keys
  'What I am grateful for today...': 'Wofür ich heute dankbar bin …',
  'My affirmation for today...': 'Meine Affirmation für heute …',
  'One little thing that made me smile recently...':
    'Eine Kleinigkeit, die mich kürzlich zum Lächeln gebracht hat …',

  // Moods
  Amazing: 'Großartig',
  Happy: 'Glücklich',
  Okay: 'Okay',
  Sad: 'Traurig',
  Awful: 'Schrecklich',
  'How are you feeling?': 'Wie fühlst du dich?',
  'Feeling Amazing': 'Fühle mich großartig',
  'Feeling Happy': 'Fühle mich glücklich',
  'Feeling Okay': 'Fühle mich okay',
  'Feeling Sad': 'Fühle mich traurig',
  'Feeling Awful': 'Fühle mich schrecklich',
  'Entry saved successfully': 'Eintrag erfolgreich gespeichert',
  'Failed to save entry': 'Eintrag konnte nicht gespeichert werden',
  'Failed to save voice memo': 'Sprachnotiz konnte nicht gespeichert werden',
  'Failed to add photos': 'Fotos konnten nicht hinzugefügt werden',
  'Failed to delete entry': 'Eintrag konnte nicht gelöscht werden',
  'Tag already exists': 'Tag ist bereits vorhanden',
  'Tag created': 'Tag erstellt',
  'Failed to create tag': 'Tag konnte nicht erstellt werden',
  'Tag updated': 'Tag aktualisiert',
  'Failed to update tag': 'Tag konnte nicht aktualisiert werden',
  'Tag deleted': 'Tag gelöscht',
  'Failed to delete tag': 'Tag konnte nicht gelöscht werden',

  // Tags
  Tag: 'Tag',
  Tags: 'Tags',
  'Tag name': 'Tag-Name',
  'Add a Tag': 'Tag hinzufügen',
  'Create New Tag': 'Neuen Tag erstellen',
  'Edit Tag': 'Tag bearbeiten',
  'Delete Tag': 'Tag löschen',
  'Are you sure you want to delete the tag "{title}"?':
    'Möchtest du den Tag „{title}“ wirklich löschen?',

  // Milestones
  'days of gratitude': 'Tage der Dankbarkeit',

  // Settings - Profile
  'Your Name': 'Dein Name',
  'Change Photo': 'Foto ändern',
  'Profile Photo': 'Profilfoto',
  'Would you like to update or remove your profile photo?':
    'Möchtest du dein Profilfoto aktualisieren oder entfernen?',
  'Update Photo': 'Foto aktualisieren',
  'Remove Photo': 'Foto entfernen',

  // Settings
  Language: 'Sprache',
  'Select Language': 'Sprache auswählen',
  'Device Default': 'Gerätestandard',
  'Restart Required': 'Neustart erforderlich',
  'Language change requires app restart. Proceed?':
    'Zum Ändern der Sprache muss die App neu gestartet werden. Fortfahren?',
  Proceed: 'Fortfahren',
  'Reload App': 'App neu laden',

  // Settings - Notifications
  Notifications: 'Benachrichtigungen',
  'Daily Reminder': 'Tägliche Erinnerung',
  'Daily reminder notifications are on': 'Tägliche Erinnerungen sind aktiviert',
  'Daily reminder notifications are off': 'Tägliche Erinnerungen sind deaktiviert',
  'Adjust Reminder Time': 'Erinnerungszeit anpassen',
  'Change your daily reminder time': 'Ändere die Uhrzeit deiner täglichen Erinnerung',
  'Failed to update reminder': 'Erinnerung konnte nicht aktualisiert werden',
  'Notification permission needed': 'Berechtigung für Benachrichtigungen erforderlich',
  'To get daily reminders, allow notifications for Tackbok in your device settings.':
    'Erlaube Tackbok in deinen Geräteeinstellungen Benachrichtigungen, um tägliche Erinnerungen zu erhalten.',

  // Settings - Appearance
  Appearance: 'Darstellung',
  Theme: 'Design',
  'Select a theme': 'Design auswählen',
  'Choose from over 10 different themes and color schemes':
    'Wähle aus über 10 verschiedenen Designs und Farbschemata',
  'Timeline Entry Length': 'Länge der Zeitleisteneinträge',
  'Number of lines shown in the timeline':
    'Anzahl der in der Zeitleiste angezeigten Zeilen. Der vollständige Text wird sichtbar, wenn du den Eintrag öffnest',
  'Show Timeline Borders': 'Rahmen in der Zeitleiste anzeigen',
  'Show the borders in the timeline': 'Rahmen in der Zeitleiste anzeigen',
  'Hide the borders in the timeline': 'Rahmen in der Zeitleiste ausblenden',
  'Date Style': 'Datumsformat',
  'Date includes day of the week': 'Datum enthält den Wochentag',
  'First Day of Week': 'Erster Wochentag',
  'Set the first day of the week in the calendar view':
    'Lege den ersten Wochentag in der Kalenderansicht fest',

  // Settings - Typography
  Typography: 'Typografie',
  'Title Font': 'Titelschrift',
  'Choose a font for titles and headings':
    'Wähle eine Schriftart für Titel und Überschriften',
  Default: 'Standard',
  'Theme Default': 'Designstandard',
  'Font Size': 'Schriftgröße',
  'Adjust the size of body text': 'Passe die Größe des Fließtexts an',
  Small: 'Klein',
  Large: 'Groß',
  'Preview of the selected font': 'Vorschau der ausgewählten Schriftart',
  'Gratitude makes today brighter': 'Dankbarkeit macht den heutigen Tag heller',

  // Settings - Journaling
  Journaling: 'Tagebuch',
  'Worksheet Template': 'Arbeitsblattvorlage',
  'Edit Worksheet Template': 'Arbeitsblattvorlage bearbeiten',
  'Use this template to pre-fill the body of new gratitude entries':
    'Verwende diese Vorlage, um den Text neuer Dankbarkeitseinträge vorab auszufüllen',
  'Reset to Default': 'Auf Standard zurücksetzen',
  'Journaling Worksheet': 'Tagebuch-Arbeitsblatt',
  'Start Writing': 'Losschreiben',
  'Journal Focus Areas': 'Themenschwerpunkte',
  'Personalize your journal prompts.': 'Personalisiere deine Schreibimpulse.',
  'Pick the topics you want to write about.':
    'Wähle die Themen aus, über die du schreiben möchtest.',
  'Select at least 2 focus areas': 'Wähle mindestens 2 Themenschwerpunkte aus',
  'Journal Prompts': 'Schreibimpulse',
  'Choose which prompts to show when starting a new journal entry.':
    'Wähle aus, welche Schreibimpulse beim Erstellen eines neuen Tagebucheintrags angezeigt werden.',
  Off: 'Aus',
  'All Prompts': 'Alle Schreibimpulse',
  'My Prompts': 'Meine Schreibimpulse',
  'Built In Prompts': 'Integrierte Schreibimpulse',
  focusArea_self_desc:
    'Denke über deine Hobbys, Interessen, Erfahrungen und dein Leben im Allgemeinen nach.',
  focusArea_littleThings_desc:
    'Schätze die kleinen, oft übersehenen Freuden des Alltags.',
  focusArea_health_desc:
    'Schätze die vielen Vorzüge deines Körpers und seiner Fähigkeiten.',
  focusArea_family_desc:
    'Schätze deine Familienmitglieder und die gemeinsam verbrachten Momente.',
  focusArea_friends_desc:
    'Schätze deine liebevollen, unterstützenden und verständnisvollen Freunde.',
  focusArea_faith_desc:
    'Konzentriere dich auf die Wertschätzung deines Glaubens, deiner Spiritualität und deines inneren Friedens.',

  // Settings - Security
  Security: 'Sicherheit',
  'Unlock Tackbok': 'Tackbok entsperren',
  'Lock with your device screen lock':
    'Tackbok kann mit der Displaysperre deines Geräts geschützt werden – Biometrie, PIN, Muster oder Code',
  Unlock: 'Entsperren',
  'App lock unavailable': 'App-Sperre nicht verfügbar',
  'Set up a screen lock (PIN, pattern, or biometrics) in your device settings first.':
    'Richte zuerst in deinen Geräteeinstellungen eine Displaysperre (PIN, Muster oder Biometrie) ein.',

  // Settings - Backup & Restore
  'Backup & Restore': 'Sichern & Wiederherstellen',
  'Google Drive Backup': 'Google-Drive-Sicherung',
  Daily: 'Täglich',
  Weekly: 'Wöchentlich',
  'Export as .ZIP': 'Als .ZIP exportieren',
  'All of your data in a format that you can restore in the app later':
    'Alle deine Daten in einem Format, das du später in der App wiederherstellen kannst',
  'Import as .ZIP': 'Als .ZIP importieren',
  'Restore your data from a .zip file':
    'Stelle deine Daten aus einer .zip-Datei wieder her',
  'Import from Gratitude App': 'Aus der Gratitude App importieren',
  'Importing from Gratitude App': 'Import aus der Gratitude App',
  'Import data from a Gratitude App .zip backup':
    'Daten aus einer .zip-Sicherung der Gratitude App importieren',
  'Choose Import Mode': 'Importmodus auswählen',
  'How should this import handle entries that already exist in Tackbok?':
    'Wie soll dieser Import mit Einträgen umgehen, die bereits in Tackbok vorhanden sind?',
  'Skip Existing Entries': 'Vorhandene Einträge überspringen',
  'Skip Existing Entries (Recommended)': 'Vorhandene Einträge überspringen (empfohlen)',
  'Only import entries with new note IDs': 'Nur Einträge mit neuen Notiz-IDs importieren',
  'Overwrite Matching Entries': 'Übereinstimmende Einträge überschreiben',
  'Replace existing entries when note IDs match':
    'Vorhandene Einträge ersetzen, wenn die Notiz-IDs übereinstimmen',
  'Import from Presently App': 'Aus der Presently App importieren',
  'Restore your data from a Presently .csv file':
    'Stelle deine Daten aus einer .csv-Datei von Presently wieder her',
  'Import from Presently?': 'Aus Presently importieren?',
  'This will import entries from a Presently app CSV file. Duplicate entries will be skipped.':
    'Dadurch werden Einträge aus einer CSV-Datei der Presently App importiert. Doppelte Einträge werden übersprungen.',
  'Backup exported successfully': 'Sicherung erfolgreich exportiert',
  'Export failed': 'Export fehlgeschlagen',
  importedCount: '{count} Einträge importiert',
  'Import failed': 'Import fehlgeschlagen',
  'Restoring Tackbok backup': 'Tackbok-Sicherung wird wiederhergestellt',
  'Load Presently export': 'Presently-Export laden',
  'Import journal entries': 'Tagebucheinträge importieren',
  'Open backup file': 'Sicherungsdatei öffnen',
  'Validate backup contents': 'Sicherungsinhalt überprüfen',
  'Restore profile': 'Profil wiederherstellen',
  'Import tags and prompts': 'Tags und Schreibimpulse importieren',
  'Restore entries and media': 'Einträge und Medien wiederherstellen',
  'Refresh journal data': 'Tagebuchdaten aktualisieren',
  'Loading the selected import file.': 'Die ausgewählte Importdatei wird geladen.',
  'Checking backup contents and file structure.':
    'Sicherungsinhalt und Dateistruktur werden überprüft.',
  'Restoring profile details and profile photo if available.':
    'Profildetails und Profilfoto werden wiederhergestellt, sofern verfügbar.',
  'Adding tags and prompts before entries are restored.':
    'Tags und Schreibimpulse werden hinzugefügt, bevor die Einträge wiederhergestellt werden.',
  'Processing {processed} of {total} journal entries and attached media.':
    '{processed} von {total} Tagebucheinträgen und angehängten Medien werden verarbeitet.',
  'No journal entries found in this backup.':
    'In dieser Sicherung wurden keine Tagebucheinträge gefunden.',
  'Refreshing your journal so imported data appears everywhere.':
    'Dein Tagebuch wird aktualisiert, damit die importierten Daten überall angezeigt werden.',
  'Entries processed': 'Verarbeitete Einträge',
  'Entries skipped due to errors': 'Wegen Fehlern übersprungene Einträge',
  'Please do not close or minimize the app while the import is in progress.':
    'Bitte schließe oder minimiere die App nicht, solange der Import läuft.',
  'Tags added': 'Hinzugefügte Tags',
  'Prompts added': 'Hinzugefügte Schreibimpulse',
  'Photos restored': 'Wiederhergestellte Fotos',
  'Voice memos restored': 'Wiederhergestellte Sprachnotizen',
  'Media skipped': 'Übersprungene Medien',
  'Tackbok backup restored': 'Tackbok-Sicherung wiederhergestellt',
  'Gratitude import complete': 'Gratitude-Import abgeschlossen',
  'Presently import complete': 'Presently-Import abgeschlossen',
  'Your journal data is ready to review, but some items could not be restored.':
    'Deine Tagebuchdaten können jetzt überprüft werden, einige Elemente konnten jedoch nicht wiederhergestellt werden.',
  'Your journal data is ready to review.':
    'Deine Tagebuchdaten können jetzt überprüft werden.',
  'This import finished with warnings. Some items could not be restored, and everything else already existed in Tackbok.':
    'Dieser Import wurde mit Warnungen abgeschlossen. Einige Elemente konnten nicht wiederhergestellt werden und alles andere war bereits in Tackbok vorhanden.',
  'This import finished, but everything already existed in Tackbok.':
    'Dieser Import ist abgeschlossen, aber alles war bereits in Tackbok vorhanden.',
  'This import finished with warnings. Some items could not be restored.':
    'Dieser Import wurde mit Warnungen abgeschlossen. Einige Elemente konnten nicht wiederhergestellt werden.',
  'This import finished successfully.': 'Dieser Import wurde erfolgreich abgeschlossen.',
  'Imported from Tackbok backup': 'Aus Tackbok-Sicherung importiert',
  'Imported from Gratitude backup': 'Aus Gratitude-Sicherung importiert',
  'Imported from Presently export': 'Aus Presently-Export importiert',
  'New entries': 'Neue Einträge',
  'Updated entries': 'Aktualisierte Einträge',
  'Skipped duplicates': 'Übersprungene Duplikate',
  Import: 'Importieren',

  // Settings - App Information
  'App Information': 'App-Informationen',
  FAQ: 'FAQ',
  'Read frequently asked questions': 'Häufig gestellte Fragen zu Tackbok lesen',
  'Share Tackbok': 'Tackbok teilen',
  'Share the app with friends and family':
    'Gefällt dir Tackbok? Teile die App mit Freunden und Familie',
  'Practice gratitude with Tackbok, a simple, free, and private gratitude journaling app':
    'Übe Dankbarkeit mit Tackbok, einer einfachen, kostenlosen und privaten Dankbarkeitstagebuch-App',
  'Support Tackbok': 'Tackbok unterstützen',
  "Tackbok is free to use, and that's not changing. If it has brought a little more gratitude into your day, you’re welcome to support it, though there’s nothing to unlock. Everyone gets the same app.":
    'Tackbok ist kostenlos, und das wird sich nicht ändern. Wenn es etwas mehr Dankbarkeit in deinen Tag gebracht hat, kannst du es gerne unterstützen, auch wenn es nichts freizuschalten gibt. Alle bekommen dieselbe App.',
  'Keeping Tackbok running currently costs about US$33.25 per month, before taxes, fees, and usage overages. If you’ve found it worthwhile, even a small contribution helps keep it free for everyone.':
    'Der Betrieb von Tackbok kostet derzeit etwa 33,25 US$ pro Monat, vor Steuern, Gebühren und nutzungsabhängigen Mehrkosten. Wenn Tackbok für dich wertvoll ist, hilft selbst ein kleiner Beitrag, die App für alle kostenlos zu halten.',
  'Ways to support': 'Möglichkeiten zur Unterstützung',
  Free: 'Kostenlos',
  'Small thanks': 'Kleines Dankeschön',
  'Helps me finish work 10 minutes earlier':
    'Hilft mir, den Arbeitstag 10 Minuten früher zu beenden',
  'Heartfelt thanks': 'Herzliches Dankeschön',
  'Helps pay for hosting and online services':
    'Hilft, Hosting und Online-Dienste zu bezahlen',
  'Big thanks': 'Großes Dankeschön',
  'Helps test and release Tackbok updates':
    'Hilft, Tackbok-Updates zu testen und zu veröffentlichen',
  'Deepest thanks': 'Allergrößtes Dankeschön',
  'Helps cover one month of Tackbok’s running costs and ongoing development':
    'Hilft, einen Monat der laufenden Kosten und Weiterentwicklung von Tackbok zu decken',
  Unavailable: 'Nicht verfügbar',
  'Support options could not be loaded. Please try again.':
    'Die Unterstützungsoptionen konnten nicht geladen werden. Bitte versuche es erneut.',
  'You appear to be offline. Check your connection and try again.':
    'Du scheinst offline zu sein. Prüfe deine Verbindung und versuche es erneut.',
  'The purchase could not be completed. Please try again.':
    'Der Kauf konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
  'Payment successful': 'Zahlung erfolgreich',
  'Thank you!': 'Danke!',
  'Your support helps keep Tackbok free and independent. It genuinely means a lot.':
    'Deine Unterstützung hilft, Tackbok kostenlos und unabhängig zu halten. Das bedeutet uns wirklich viel.',
  'Thank you for supporting Tackbok. It genuinely means a lot.':
    'Danke, dass du Tackbok unterstützt. Das bedeutet uns wirklich viel.',
  'Your payment is pending. The store will finish it when approval or payment completes.':
    'Deine Zahlung steht aus. Der Store schließt sie ab, sobald die Genehmigung oder Zahlung erfolgt ist.',
  'Where your support helps': 'Wobei deine Unterstützung hilft',
  'Cloudflare Workers': 'Cloudflare Workers',
  'Expo EAS': 'Expo EAS',
  'Apple Developer membership': 'Apple-Developer-Mitgliedschaft',
  'tackbok.org domain': 'tackbok.org-Domain',
  'Google Play registration': 'Google-Play-Registrierung',
  'Monthly baseline': 'Monatliche Grundkosten',
  'US$5/month': '5 US$/Monat',
  'US$19/month': '19 US$/Monat',
  'US$99/year': '99 US$/Jahr',
  'US$12/year': '12 US$/Jahr',
  'US$25 one time': 'einmalig 25 US$',
  'About US$33.25': 'Etwa 33,25 US$',
  'Rate Tackbok': 'Tackbok bewerten',
  'Leave an honest rating in the app store':
    'Eine ehrliche Bewertung im App Store hinterlassen',
  'Unable to open the store': 'Store kann nicht geöffnet werden',
  'Confirm {tier}': '{tier} bestätigen',
  'The store will charge {price} for this voluntary, one-time support. It unlocks no features and can be purchased again.':
    'Der Store berechnet {price} für diese freiwillige, einmalige Unterstützung. Sie schaltet keine Funktionen frei und kann erneut gekauft werden.',
  'Privacy Policy': 'Datenschutzerklärung',
  'Read our privacy policy': 'Datenschutzerklärung von Tackbok lesen',
  'Terms & Conditions': 'Allgemeine Geschäftsbedingungen',
  'Read our terms and conditions': 'Unsere allgemeinen Geschäftsbedingungen lesen',
  Analytics: 'Erfassung von Analysedaten',
  'Collecting anonymized analytics to help diagnose problems':
    'Tackbok erfasst anonymisierte Analysedaten, um Probleme zu erkennen und Trends zu beobachten',
  'Check for updates': 'Nach Updates suchen',
  'Checking for updates…': 'Updates werden gesucht …',
  'Last checked: {time}': 'Zuletzt geprüft: {time}',
  Never: 'Nie',
  Restart: 'Neu starten',
  'Restart to apply': 'Zum Anwenden neu starten',
  'Update downloaded. Restart to apply it.':
    'Update heruntergeladen. Starte die App neu, um es anzuwenden.',
  'You already have the latest version': 'Du hast bereits die neueste Version',
  'Unable to update': 'Update nicht möglich',
  Version: 'Versionsnummer',

  // Settings - Danger Zone
  'Danger Zone': 'Gefahrenbereich',
  'Delete All Data': 'Alle Daten löschen',
  'Delete all data?': 'Alle Daten löschen?',
  'Permanently delete all your app data': 'Alle deine App-Daten dauerhaft löschen',
  'This action cannot be undone. All your app data will be permanently deleted.':
    'Diese Aktion kann nicht rückgängig gemacht werden. Alle deine App-Daten werden dauerhaft gelöscht.',
  'All data deleted': 'Alle Daten gelöscht',
  'All data deleted, but some media files could not be removed.':
    'Alle Daten wurden gelöscht, aber einige Mediendateien konnten nicht entfernt werden.',
  'Delete failed': 'Löschen fehlgeschlagen',

  // Time Picker
  'Select Time': 'Uhrzeit auswählen',

  // Date Picker
  Today: 'Heute',
  Yesterday: 'Gestern',
  Selected: 'Ausgewählt',
  'Previous month': 'Vorheriger Monat',
  'Next month': 'Nächster Monat',
  'Select month': 'Monat auswählen',
  'Select year': 'Jahr auswählen',
  Random: 'Zufällig',
  'Open a random entry': 'Einen zufälligen Eintrag öffnen',
  Sun: 'So',
  Mon: 'Mo',
  Tue: 'Di',
  Wed: 'Mi',
  Thu: 'Do',
  Fri: 'Fr',
  Sat: 'Sa',
  Sunday: 'Sonntag',
  Monday: 'Montag',
  Tuesday: 'Dienstag',
  Wednesday: 'Mittwoch',
  Thursday: 'Donnerstag',
  Friday: 'Freitag',
  Saturday: 'Samstag',
  January: 'Januar',
  February: 'Februar',
  March: 'März',
  April: 'April',
  May: 'Mai',
  June: 'Juni',
  July: 'Juli',
  August: 'August',
  September: 'September',
  October: 'Oktober',
  November: 'November',
  December: 'Dezember',
  JAN: 'Jan',
  FEB: 'Feb',
  MAR: 'Mär',
  APR: 'Apr',
  MAY: 'Mai',
  JUN: 'Jun',
  JUL: 'Jul',
  AUG: 'Aug',
  SEP: 'Sep',
  OCT: 'Okt',
  NOV: 'Nov',
  DEC: 'Dez',

  // Onboarding
  Skip: 'Überspringen',
  Continue: 'Weiter',
  Next: 'Weiter',
  'Step {current} of {total}': 'Schritt {current} von {total}',
  'Get started': 'Loslegen',
  'Already have a journal? Import it': 'Du hast bereits ein Tagebuch? Importiere es',
  'A private place for your gratitude. Free, offline, yours.':
    'Ein privater Ort für deine Dankbarkeit. Kostenlos, offline und ganz für dich.',
  'Import your journal': 'Dein Tagebuch importieren',
  'Where is your journal coming from?': 'Woher stammt dein Tagebuch?',
  'Tackbok Backup': 'Tackbok-Sicherung',
  'Gratitude App': 'Gratitude App',
  'Presently App': 'Presently App',
  'What should we call you?': 'Wie dürfen wir dich nennen?',
  'Your name is only used to greet you inside the app.':
    'Dein Name wird nur verwendet, um dich in der App zu begrüßen.',
  'Your name (optional)': 'Dein Name (optional)',
  'Stays on your device.': 'Bleibt auf deinem Gerät.',
  'Make it yours': 'Gestalte es nach deinen Wünschen',
  'Pick a look — you can change everything later in Settings.':
    'Wähle ein Aussehen – du kannst später in den Einstellungen alles ändern.',
  'A walk in the morning sun': 'Ein Spaziergang in der Morgensonne',
  'Grateful for quiet streets, warm coffee, and a sky full of color.':
    'Dankbar für ruhige Straßen, warmen Kaffee und einen farbenfrohen Himmel.',
  'More themes…': 'Weitere Designs …',
  'What do you want to be more grateful for?': 'Wofür möchtest du dankbarer sein?',
  'We’ll suggest writing prompts from the areas you pick.':
    'Wir schlagen dir Schreibimpulse aus den ausgewählten Bereichen vor.',
  'Pick at least {count}': 'Wähle mindestens {count} aus',
  'Help improve Tackbok?': 'Tackbok verbessern helfen?',
  'Tackbok is free and open source. Anonymous stats help us find bugs and see which features matter.':
    'Tackbok ist kostenlos und Open Source. Anonyme Statistiken helfen uns, Fehler zu finden und zu erkennen, welche Funktionen wichtig sind.',
  'Anonymous usage stats only — which screens and features get used.':
    'Nur anonyme Nutzungsstatistiken – welche Ansichten und Funktionen verwendet werden.',
  'Never your journal content, photos, voice memos, or anything you type.':
    'Niemals deine Tagebuchinhalte, Fotos, Sprachnotizen oder andere Eingaben.',
  'Open source — the exact event list is public in the repo.':
    'Open Source – die genaue Ereignisliste ist im Repository öffentlich.',
  'See exactly what we collect': 'Genau ansehen, was wir erfassen',
  'Share anonymous stats': 'Anonyme Statistiken teilen',
  'No thanks': 'Nein, danke',
  'What we collect': 'Was wir erfassen',
  'With your permission, Tackbok records limited, anonymous usage information. This may include screens visited, features used, and whether optional operations succeed. It never includes your journal content or anything you type.':
    'Mit deiner Zustimmung erfasst Tackbok nur begrenzte, anonyme Nutzungsinformationen. Dazu können besuchte Bildschirme, verwendete Funktionen und der Erfolg optionaler Vorgänge gehören. Deine Tagebuchinhalte oder Eingaben werden niemals erfasst.',
  'Audit the analytics code on GitHub': 'Analysecode auf GitHub prüfen',
  'Never collected': 'Wird niemals erfasst',
  'Your journal text, titles, photos, voice memos, tags, name, email, or anything you type. No ads, no selling data, no third-party tracking.':
    'Deine Tagebuchtexte, Titel, Fotos, Sprachnotizen, Tags, dein Name, deine E-Mail-Adresse oder andere Eingaben. Keine Werbung, kein Datenverkauf und kein Tracking durch Dritte.',
  'You’re all set, {name}!': 'Alles ist bereit, {name}!',
  'You’re all set!': 'Alles ist bereit!',
  'Two last things you can turn on — both optional.':
    'Du kannst noch zwei Dinge aktivieren – beide sind optional.',
  'Add example entries': 'Beispieleinträge hinzufügen',
  'A few sample entries show how photos, voice memos, moods and tags work. Remove them anytime with one tap.':
    'Einige Beispieleinträge zeigen, wie Fotos, Sprachnotizen, Stimmungen und Tags funktionieren. Du kannst sie jederzeit mit einem Tippen entfernen.',
  'Remind me daily': 'Täglich erinnern',
  'A gentle nudge to write — never your journal content.':
    'Ein sanfter Anstoß zum Schreiben – ohne deine Tagebuchinhalte.',
  'Remind me at {time}': 'Um {time} erinnern',
  'Setting things up…': 'Alles wird eingerichtet …',
  'Start journaling': 'Tagebuch starten',
  'Showing example entries': 'Beispieleinträge werden angezeigt',
  'Remove all': 'Alle entfernen',
  'Hide this banner': 'Diesen Hinweis ausblenden',
  'Example entries removed': 'Beispieleinträge entfernt',
  'Failed to remove example entries': 'Beispieleinträge konnten nicht entfernt werden',
  'Add today’s entry here.': 'Füge hier den heutigen Eintrag hinzu.',
  'Press and hold, then drag to move these buttons along the edge.':
    'Halte die Schaltflächen gedrückt und ziehe sie dann am Rand entlang, um sie zu verschieben.',
  'Tap an entry to view or edit it.':
    'Tippe auf einen Eintrag, um ihn anzusehen oder zu bearbeiten.',
  'Find memories by text or tag.': 'Finde Erinnerungen nach Text oder Tag.',
  'Replay Onboarding': 'Einführung wiederholen',
  'Run the welcome setup again': 'Willkommenseinrichtung erneut ausführen',
  'Replay onboarding?': 'Einführung wiederholen?',
  'The welcome setup will start again. Your journal entries and settings are kept.':
    'Die Willkommenseinrichtung wird erneut gestartet. Deine Tagebucheinträge und Einstellungen bleiben erhalten.',
  Replay: 'Wiederholen',

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
  Insights: 'Einblicke',
  Overview: 'Überblick',
  'Gratitude score': 'Dankbarkeits-Score',
  'Current streak': 'Aktuelle Serie',
  'Longest streak': 'Längste Serie',
  'Days journaled': 'Tage mit Einträgen',
  Consistency: 'Beständigkeit',
  Entries: 'Einträge',
  Less: 'Weniger',
  More: 'Mehr',
  'Your happiest day is {weekday}': 'Dein glücklichster Tag ist {weekday}',
  'Mood over time': 'Stimmung im Zeitverlauf',
  'Writing habits': 'Schreibgewohnheiten',
  Morning: 'Morgens',
  Afternoon: 'Nachmittags',
  Evening: 'Abends',
  Night: 'Nachts',
  "You're a morning writer": 'Du schreibst am liebsten morgens',
  "You're an afternoon writer": 'Du schreibst am liebsten nachmittags',
  "You're an evening writer": 'Du schreibst am liebsten abends',
  "You're a night writer": 'Du schreibst am liebsten nachts',
  'Entries per month': 'Einträge pro Monat',
  'Top tags': 'Top-Tags',
  Totals: 'Gesamt',
  Words: 'Wörter',
  Characters: 'Zeichen',
  Photos: 'Fotos',
  'Voice memos': 'Sprachnotizen',
  'Your memories': 'Deine Erinnerungen',
  'On this day': 'An diesem Tag',
  'One year ago today': 'Heute vor einem Jahr',
  'One month ago today': 'Heute vor einem Monat',
  '{count} years ago today': 'Heute vor {count} Jahren',
  'A moment from this day': 'Ein Moment dieses Tages',
  'No insights yet': 'Noch keine Einblicke',
  'Write a few entries and your stats will show up here.':
    'Schreibe ein paar Einträge und deine Statistiken erscheinen hier.',

  // Teilen und Erfolge
  'Share your gratitude': 'Teile deine Dankbarkeit',
  'I was grateful for': 'Ich war dankbar für',
  'Share image': 'Bild teilen',
  'Share entry': 'Eintrag teilen',
  'Include mood': 'Stimmung einbeziehen',
  'Mood is hidden unless you include it':
    'Die Stimmung bleibt verborgen, wenn du sie nicht einbeziehst',
  'Include photos': 'Fotos einbeziehen',
  'Up to the first five photos will be shared':
    'Bis zu den ersten fünf Fotos werden geteilt',
  'Choose a style': 'Stil auswählen',
  'Sharing is not available on this device':
    'Teilen ist auf diesem Gerät nicht verfügbar',
  'Could not share image. Please try again.':
    'Das Bild konnte nicht geteilt werden. Bitte versuche es erneut.',
  '{theme} theme': 'Design {theme}',
  '{theme} theme, selected': 'Design {theme}, ausgewählt',
  'Day one complete!': 'Tag eins geschafft!',
  'A beautiful beginning. Keep noticing the good.':
    'Ein schöner Anfang. Nimm weiterhin das Gute wahr.',
  '{count} days of gratitude!': '{count} Tage Dankbarkeit!',
  'Congratulations on making gratitude part of your journey.':
    'Glückwunsch, dass Dankbarkeit Teil deines Weges ist.',
  'Share achievement': 'Erfolg teilen',
  'Open {count} day achievement': 'Erfolg für {count} Tage öffnen',

  // Date Format Patterns (placeholders: {weekday}, {month}, {day}, {year})
  'dateFormat.short': '{day}. {month} {year}',
  'dateFormat.full': '{weekday}, {day}. {month} {year}',
  'dateFormat.timeLabel': '{weekday} um {time}',

  // Cloud Backup & Sync
  'Attention needed': 'Aktion erforderlich',
  'Back up and sync your journal with your own Google Drive. No Tackbok account is created.': 'Sichere und synchronisiere dein Tagebuch mit deinem eigenen Google Drive. Es wird kein Tackbok-Konto erstellt.',
  'Backup from {date}': 'Sicherung vom {date}',
  'Before you connect': 'Vor dem Verbinden',
  'Checking Google Drive for changes': 'Google Drive wird auf Änderungen geprüft',
  'Choose a backup to merge with this journal. Both sides are preserved.': 'Wähle eine Sicherung, die mit diesem Tagebuch zusammengeführt wird. Beide Seiten bleiben erhalten.',
  'Choose a backup to restore on this device.': 'Wähle eine Sicherung zur Wiederherstellung auf diesem Gerät.',
  'Choose which copies of your journal to remove.': 'Wähle aus, welche Kopien deines Tagebuchs entfernt werden sollen.',
  'Cloud Backup & Sync': 'Cloud-Sicherung & Synchronisierung',
  'Cloud backup connected': 'Cloud-Sicherung verbunden',
  'Cloud backup could not be updated': 'Cloud-Sicherung konnte nicht aktualisiert werden',
  'Cloud backup deleted': 'Cloud-Sicherung gelöscht',
  'Cloud backup deletion received': 'Löschung der Cloud-Sicherung empfangen',
  'Cloud backup {number}': 'Cloud-Sicherung {number}',
  'Backups are encrypted in transit and at rest by Google Drive, but are not end-to-end encrypted.': 'Backups werden bei der Übertragung und im Ruhezustand von Google Drive verschlüsselt, sind aber nicht Ende-zu-Ende verschlüsselt.',
  'Cloud restore started': 'Cloud-Wiederherstellung gestartet',
  'Cloud sync: attention needed': 'Cloud-Synchronisierung: Aktion erforderlich',
  'Cloud sync: changes safely queued': 'Cloud-Synchronisierung: Änderungen sicher vorgemerkt',
  'Cloud sync: paused': 'Cloud-Synchronisierung: pausiert',
  'Cloud sync: syncing': 'Cloud-Synchronisierung: läuft',
  'Cloud sync: up to date': 'Cloud-Synchronisierung: aktuell',
  'Connect Google Drive': 'Google Drive verbinden',
  'Connecting…': 'Verbindung wird hergestellt…',
  'Create cloud backup': 'Cloud-Sicherung erstellen',
  'Delete cloud and local journal data': 'Cloud- und lokale Tagebuchdaten löschen',
  'Delete cloud backup': 'Cloud-Sicherung löschen',
  'Delete cloud backup?': 'Cloud-Sicherung löschen?',
  'Delete journal everywhere': 'Tagebuch überall löschen',
  'Delete journal everywhere?': 'Tagebuch überall löschen?',
  'Delete or reset data': 'Daten löschen oder zurücksetzen',
  'Deleting journal everywhere…': 'Tagebuch wird überall gelöscht…',
  'Removing the cloud backup and journal data. Keep Tackbok open.':
    'Cloud-Sicherung und Tagebuchdaten werden gelöscht. Lass Tackbok geöffnet.',
  Disconnect: 'Trennen',
  'Disconnect {provider}': '{provider} trennen',
  'Disconnect {provider} from this device?': '{provider} von diesem Gerät trennen?',
  'Disconnect, then delete local journal data only': 'Trennen und dann nur lokale Tagebuchdaten löschen',
  'Edits remain safely queued on this device.': 'Änderungen bleiben auf diesem Gerät sicher vorgemerkt.',
  Entry: 'Eintrag',
  'Google Drive': 'Google Drive',
  'Google Drive access is required. Try again and select the Drive access checkbox.': 'Google-Drive-Zugriff ist erforderlich. Versuche es erneut und wähle das Kontrollkästchen für den Drive-Zugriff aus.',
  'Google Drive connected': 'Google Drive verbunden',
  'Google Drive connection was not completed': 'Google-Drive-Verbindung wurde nicht abgeschlossen',
  'Google Drive could not be reached. Your changes remain safely queued.': 'Google Drive konnte nicht erreicht werden. Deine Änderungen bleiben sicher in der Warteschlange.',
  'Photos and voice memos are waiting for Wi-Fi. Your changes remain safely queued.': 'Fotos und Sprachnotizen warten auf WLAN. Deine Änderungen bleiben sicher in der Warteschlange.',
  'Google Drive disconnected on this device': 'Google Drive auf diesem Gerät getrennt',
  'Google Drive is busy. Try again shortly.': 'Google Drive ist ausgelastet. Versuche es gleich noch einmal.',
  'Google Drive needs to be reconnected.': 'Google Drive muss erneut verbunden werden.',
  'Google Drive reconnected': 'Google Drive erneut verbunden',
  'Google Drive storage is full.': 'Der Google-Drive-Speicher ist voll.',
  'Google Drive — {status}': 'Google Drive — {status}',
  'If Google shows a Drive access checkbox, select it. Backup cannot connect without this permission.': 'Wenn Google ein Kontrollkästchen für den Drive-Zugriff anzeigt, wähle es aus. Ohne diese Berechtigung kann das Backup nicht verbunden werden.',
  'Journal deletion received': 'Tagebuchlöschung empfangen',
  'Journal text still syncs on mobile data.': 'Tagebuchtext wird weiterhin über mobile Daten synchronisiert.',
  'Keep local data and the cloud copy': 'Lokale Daten und Cloud-Kopie behalten',
  'Keep local journal data': 'Lokale Tagebuchdaten behalten',
  'Keep the cloud copy and other devices': 'Cloud-Kopie und andere Geräte behalten',
  'Last successful sync: {date}': 'Letzte erfolgreiche Synchronisierung: {date}',
  'Local data and the cloud backup will both remain. Other devices stay connected.': 'Lokale Daten und die Cloud-Sicherung bleiben erhalten. Andere Geräte bleiben verbunden.',
  'Mark as reviewed': 'Als geprüft markieren',
  'Merging changes and updating Google Drive':
    'Änderungen werden zusammengeführt und Google Drive wird aktualisiert',
  'No Tackbok backup found in this Google account': 'Keine Tackbok-Sicherung in diesem Google-Konto gefunden',
  'No internet connection. Your changes remain safely queued.': 'Keine Internetverbindung. Deine Änderungen bleiben sicher in der Warteschlange.',
  'No existing Tackbok backup was found. Create one for this journal.': 'Keine bestehende Tackbok-Sicherung gefunden. Erstelle eine für dieses Tagebuch.',
  'Optional cloud backup': 'Optionale Cloud-Sicherung',
  'Pause sync': 'Synchronisierung pausieren',
  'Preparing journal changes': 'Journaländerungen werden vorbereitet',
  'Preparing restored journal data': 'Wiederhergestellte Journaldaten werden vorbereitet',
  Profile: 'Profil',
  Prompt: 'Schreibimpuls',
  'Reconnect Google Drive': 'Google Drive erneut verbinden',
  'Recovered conflicts': 'Wiederhergestellte Konflikte',
  'Recovered conflicts marked as reviewed': 'Wiederhergestellte Konflikte als geprüft markiert',
  'Recovered {type} conflict — {count} preserved alternatives': '{type}-Konflikt wiederhergestellt — {count} Alternativen erhalten',
  'Reset this device only': 'Nur dieses Gerät zurücksetzen',
  'Reset this device only?': 'Nur dieses Gerät zurücksetzen?',
  'Restore and merge': 'Wiederherstellen und zusammenführen',
  'Restore cloud backup': 'Cloud-Sicherung wiederherstellen',
  'Restore from your cloud backup': 'Aus deiner Cloud-Sicherung wiederherstellen',
  'Restoring…': 'Wiederherstellung läuft…',
  'Safely queued': 'Sicher vorgemerkt',
  'Saving synced journal data on this device':
    'Synchronisierte Journaldaten werden auf diesem Gerät gespeichert',
  'Setting up cloud sync…': 'Cloud-Synchronisierung wird eingerichtet…',
  'Step {current} of {total} in this batch':
    'Schritt {current} von {total} in diesem Durchlauf',
  'Sync completed': 'Synchronisierung abgeschlossen',
  'Sync now': 'Jetzt synchronisieren',
  'Sync paused': 'Synchronisierung pausiert',
  'Sync resumed': 'Synchronisierung fortgesetzt',
  'Sync runs in safe batches. You can keep using Tackbok.':
    'Die Synchronisierung erfolgt in sicheren Durchläufen. Du kannst Tackbok weiterverwenden.',
  'Sync media on Wi-Fi only': 'Medien nur über WLAN synchronisieren',
  'Syncing…': 'Synchronisierung läuft…',
  'The cloud copy and this device’s journal will be permanently deleted. Other devices will delete their local journal when they sync.': 'Die Cloud-Kopie und das Tagebuch dieses Geräts werden dauerhaft gelöscht. Andere Geräte löschen ihr lokales Tagebuch bei der Synchronisierung.',
  'The cloud copy will be permanently deleted after verification. Local journal data remains.': 'Die Cloud-Kopie wird nach der Prüfung dauerhaft gelöscht. Lokale Tagebuchdaten bleiben erhalten.',
  'This cloud backup was deleted. Local journal data remains on this device.': 'Diese Cloud-Sicherung wurde gelöscht. Lokale Tagebuchdaten bleiben auf diesem Gerät.',
  'This cloud backup contains data Tackbok cannot read.': 'Diese Cloud-Sicherung enthält Daten, die Tackbok nicht lesen kann.',
  'Finish deleting this journal?': 'Löschen dieses Tagebuchs abschließen?',
  'Cloud deletion is already recorded. Erase the remaining journal data from this device.': 'Die Cloud-Löschung wurde bereits gespeichert. Lösche die verbleibenden Tagebuchdaten von diesem Gerät.',
  'Finish deletion': 'Löschen abschließen',
  'Your Google email is stored securely on this device to identify the connected account, and deleted on Disconnect. It is never included in backups, logs, diagnostics, or analytics.': 'Deine Google-E-Mail-Adresse wird sicher auf diesem Gerät gespeichert, um das verbundene Konto zu identifizieren, und beim Trennen gelöscht. Sie wird niemals in Backups, Protokolle, Diagnosedaten oder Analysen aufgenommen.',
  'This device disconnects first, then deletes its local journal. The cloud backup and other devices remain.': 'Dieses Gerät wird zuerst getrennt und löscht dann sein lokales Tagebuch. Cloud-Sicherung und andere Geräte bleiben erhalten.',
  'This device was reset': 'Dieses Gerät wurde zurückgesetzt',
  'This journal was deleted everywhere. This device is disconnected.': 'Dieses Tagebuch wurde überall gelöscht. Dieses Gerät ist getrennt.',
  'Up to date': 'Aktuell',
  'Verify backup health': 'Sicherungsstatus prüfen',
  'Waiting for the first successful sync': 'Warten auf die erste erfolgreiche Synchronisierung',
  'You can leave this screen; syncing resumes when Tackbok is active.': 'Du kannst diesen Bildschirm verlassen; die Synchronisierung wird fortgesetzt, wenn Tackbok aktiv ist.',
  'Your journal stays on your device — with optional cloud backup.': 'Dein Tagebuch bleibt auf deinem Gerät — mit optionaler Cloud-Sicherung.',
  '{count} changes safely queued': '{count} Änderungen sicher vorgemerkt',
  '{count} changes remaining': '{count} Änderungen verbleiben',
  'Google Drive authorization needs attention.': 'Die Google-Drive-Autorisierung erfordert Aufmerksamkeit.',
  'This backup belongs to a different connected Google account.': 'Diese Sicherung gehört zu einem anderen verbundenen Google-Konto.',
  'Google Drive permission was not fully granted.': 'Die Google-Drive-Berechtigung wurde nicht vollständig erteilt.',
  'The connected cloud backup does not match this journal.': 'Die verbundene Cloud-Sicherung passt nicht zu diesem Tagebuch.',
  'This backup was created by a newer Tackbok version.': 'Diese Sicherung wurde mit einer neueren Tackbok-Version erstellt.',
  'A cloud snapshot failed its safety checks.': 'Ein Cloud-Snapshot hat die Sicherheitsprüfungen nicht bestanden.',
  'A device backup points to a missing snapshot.': 'Eine Gerätesicherung verweist auf einen fehlenden Snapshot.',
  'Two different backups claim the same device version.': 'Zwei verschiedene Sicherungen beanspruchen dieselbe Geräteversion.',
  'Too many independent device backups need consolidation.': 'Zu viele unabhängige Gerätesicherungen müssen zusammengeführt werden.',
  'A recovered item conflicts with an existing stable identifier.': 'Ein wiederhergestelltes Element kollidiert mit einer vorhandenen stabilen Kennung.',
  'Tackbok could not safely stage backup data on this device.': 'Tackbok konnte Sicherungsdaten auf diesem Gerät nicht sicher vorbereiten.',
  'Google Drive does not have enough free storage.': 'Google Drive hat nicht genügend freien Speicherplatz.',
  'Google Drive denied access to the app backup folder.': 'Google Drive hat den Zugriff auf den Sicherungsordner der App verweigert.',
  'A referenced photo or voice memo is unavailable.': 'Ein referenziertes Foto oder eine Sprachnotiz ist nicht verfügbar.',
  'A local photo or voice memo could not be verified.': 'Ein lokales Foto oder eine Sprachnotiz konnte nicht überprüft werden.',
  'Your journal is not ready for cloud sync yet.': 'Dein Tagebuch ist noch nicht für die Cloud-Synchronisierung bereit.',
  'This cloud backup was deleted from another device.': 'Diese Cloud-Sicherung wurde von einem anderen Gerät gelöscht.',
  'This journal was deleted everywhere from another device.': 'Dieses Tagebuch wurde von einem anderen Gerät überall gelöscht.',
  'Cloud deletion stopped before every backup object was removed.': 'Die Cloud-Löschung wurde beendet, bevor alle Sicherungsobjekte entfernt waren.',
  'Backup cleanup was stopped to protect a current snapshot.': 'Die Sicherungsbereinigung wurde zum Schutz eines aktuellen Snapshots gestoppt.',
  'Choose the connected account': 'Verbundenes Konto auswählen',
  'Choose a Google account to reconnect': 'Google-Konto zum erneuten Verbinden auswählen',
  'Finish connection': 'Verbindung abschließen',
  'Reconnect to the correct backup': 'Mit der richtigen Sicherung verbinden',
  'Update Tackbok': 'Tackbok aktualisieren',
  'Retry and verify backup': 'Erneut versuchen und Sicherung prüfen',
  'Repair from verified backup': 'Aus geprüfter Sicherung reparieren',
  'Inspect and repair backup': 'Sicherung prüfen und reparieren',
  'Consolidate backups': 'Sicherungen zusammenführen',
  'Export journal and repair backup': 'Tagebuch exportieren und Sicherung reparieren',
  'Free device storage and retry': 'Gerätespeicher freigeben und erneut versuchen',
  'Manage Google Drive storage': 'Google-Drive-Speicher verwalten',
  'Retry missing media': 'Fehlende Medien erneut versuchen',
  'Locate or retry attachment': 'Anhang suchen oder erneut versuchen',
  'Retry journal preparation': 'Tagebuchvorbereitung erneut versuchen',
  'Acknowledge and disconnect': 'Bestätigen und trennen',
  'Review deletion and erase this device': 'Löschung prüfen und dieses Gerät löschen',
  'Resume deletion': 'Löschung fortsetzen',
  'Cloud deletion completed': 'Cloud-Löschung abgeschlossen',
  'Export or repair the affected journal data, then return and retry.': 'Exportiere oder repariere die betroffenen Tagebuchdaten und versuche es danach erneut.',
  'Cloud backup retry completed': 'Erneuter Sicherungsversuch abgeschlossen',
};
