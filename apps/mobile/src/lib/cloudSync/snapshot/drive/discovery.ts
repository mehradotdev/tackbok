import { SnapshotProviderError } from '../sync/types';
import type { DriveMethodClass } from './instrumentation';
import type { DriveFileRecord, DriveObjectKind, DriveProviderStateStore } from './state';
import { DriveRequestError, type DriveResponseLike } from './transport';
import type { DriveFile } from './googleDriveSnapshotProvider';

const API = 'https://www.googleapis.com/drive/v3';
const APP_DATA = 'appDataFolder';
const FILE_FIELDS = 'id,name,size,createdTime,sha256Checksum,appProperties,trashed';
const PAGE_SIZE = 1_000;
const MAX_DISCOVERY_REBUILDS = 1;

interface DriveChange {
  removed?: boolean;
  fileId?: string;
  file?: unknown;
}

export interface DriveDiscoveryOptions {
  state: DriveProviderStateStore;
  request(
    vaultId: string,
    methodClass: DriveMethodClass,
    url: string,
    init: Record<string, unknown>,
    options: { idempotent: boolean; accepted?: readonly number[] },
  ): Promise<DriveResponseLike>;
  queryFiles(vaultId: string, query: string): Promise<DriveFile[]>;
  parseFile(value: unknown): DriveFile | null;
  kindOf(value: unknown): DriveObjectKind | null;
  materialize(
    vaultId: string,
    file: DriveFile,
    kind: DriveObjectKind,
    rejectInvalid?: boolean,
  ): Promise<DriveFileRecord | null>;
  vaultQuery(vaultId: string, suffix?: string): string;
  propertyClause(key: string, value: string): string;
  sleep(milliseconds: number): Promise<void>;
}

export class DriveDiscovery {
  constructor(private readonly options: DriveDiscoveryOptions) {}

  async refresh(vaultId: string, rebuilds = 0): Promise<void> {
    const discovery = this.options.state.loadDiscovery(vaultId);
    if (!discovery.inventoryComplete || !discovery.cursor) {
      await this.initialize(vaultId, rebuilds);
      return;
    }
    let cursor = discovery.cursor;
    try {
      while (true) {
        const params = new URLSearchParams({
          pageToken: cursor,
          spaces: APP_DATA,
          pageSize: String(PAGE_SIZE),
          includeRemoved: 'true',
          fields: `nextPageToken,newStartPageToken,changes(removed,fileId,file(${FILE_FIELDS}))`,
        });
        const response = await this.options.request(
          vaultId,
          'list',
          `${API}/changes?${params}`,
          {},
          { idempotent: true },
        );
        const body = await response.json() as {
          nextPageToken?: unknown;
          newStartPageToken?: unknown;
          changes?: DriveChange[];
        };
        const files: DriveFileRecord[] = [];
        const removed: string[] = [];
        for (const change of body.changes ?? []) {
          if (change.removed && typeof change.fileId === 'string') {
            removed.push(change.fileId);
            continue;
          }
          if (!change.file) continue;
          const file = this.options.parseFile(change.file);
          if (!file || file.appProperties.tb_vault !== vaultId) continue;
          const kind = this.options.kindOf(file.appProperties.tb_kind);
          if (!kind) continue;
          const record = await this.options.materialize(vaultId, file, kind, kind === 'head');
          if (record) files.push(record);
        }
        const next = typeof body.nextPageToken === 'string'
          ? body.nextPageToken
          : typeof body.newStartPageToken === 'string'
            ? body.newStartPageToken
            : cursor;
        this.options.state.applyChangePage(vaultId, files, removed, next);
        if (typeof body.nextPageToken !== 'string') return;
        cursor = body.nextPageToken;
      }
    } catch (error) {
      if (!(error instanceof DriveRequestError) ||
          ![400, 404, 410].includes(error.status)) throw error;
      if (rebuilds >= MAX_DISCOVERY_REBUILDS) {
        throw new SnapshotProviderError(
          'transient',
          'Drive rejected a freshly rebuilt discovery cursor',
        );
      }
      this.options.state.resetDiscovery(vaultId);
      await this.initialize(vaultId, rebuilds + 1);
    }
  }

  private async initialize(vaultId: string, rebuilds = 0): Promise<void> {
    const tokenResponse = await this.options.request(
      vaultId,
      'start-token',
      `${API}/changes/startPageToken?spaces=${APP_DATA}`,
      {},
      { idempotent: true },
    );
    const tokenBody = await tokenResponse.json() as { startPageToken?: unknown };
    if (typeof tokenBody.startPageToken !== 'string') {
      throw new SnapshotProviderError('invalid-data', 'Drive returned no start-page token');
    }
    const scope = `(name contains 'heads/' or name contains 'snapshots/') and (` +
      `${this.options.propertyClause('tb_kind', 'head')} or ` +
      `${this.options.propertyClause('tb_kind', 'snapshot')})`;
    const query = this.options.vaultQuery(vaultId, scope);
    const initial = await this.options.queryFiles(vaultId, query);
    // Changes are authoritative only after startPageToken. Repeating the
    // prefix scan narrows Drive's listing-visibility window for older objects;
    // the changes catch-up below closes the race for newer writes.
    await this.options.sleep(250);
    const repeated = await this.options.queryFiles(vaultId, query);
    const files = [...new Map([...initial, ...repeated].map((file) => [file.id, file])).values()];
    const records: DriveFileRecord[] = [];
    for (const file of files) {
      const kind = this.options.kindOf(file.appProperties.tb_kind);
      if (kind !== 'head' && kind !== 'snapshot') continue;
      const record = await this.options.materialize(vaultId, file, kind, kind === 'head');
      if (record) records.push(record);
    }
    this.options.state.replaceInitialInventory(vaultId, records, tokenBody.startPageToken);
    await this.refresh(vaultId, rebuilds);
  }
}
