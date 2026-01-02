export interface IGratitudeDBLog {
  entryDate: string; // YYYY-MM-DD
  entryContent: string;
}

export interface IGratitudeLogItem extends IGratitudeDBLog {
  isLast?: boolean;
  placeholderText?: string;
}

export interface ISaveGratitudeLogResult {
  type: 'save' | 'delete';
  result: any; // SQLite result type (varies slightly by version)
}
