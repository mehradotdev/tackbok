export interface GratitudeLog {
  entryDate: string; // YYYY-MM-DD
  entryContent: string;
}

export interface SaveGratitudeLogResult {
  type: 'save' | 'delete';
  result: any; // SQLite result type (varies slightly by version)
}
