export type NoteType = "plain" | "rich" | "markdown" | "checklist" | "code" | "spreadsheet";

export interface DesktopNote {
  id: string;
  title: string;
  content: string;
  noteType: NoteType;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NoteInput = Omit<DesktopNote, "id" | "createdAt" | "updatedAt"> & { id?: string | null };

export interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
  recoveryCodesRemaining: number;
}

export interface RecoveryResult {
  codes: string[];
}

export interface DesktopApi {
  status(): Promise<VaultStatus>;
  setup(pin: string): Promise<RecoveryResult>;
  unlock(pin: string): Promise<void>;
  lock(): Promise<void>;
  recover(code: string, newPin: string): Promise<RecoveryResult>;
  changePin(currentPin: string, newPin: string): Promise<void>;
  regenerateCodes(): Promise<RecoveryResult>;
  listNotes(): Promise<DesktopNote[]>;
  saveNote(note: NoteInput): Promise<DesktopNote>;
  deleteNote(id: string): Promise<void>;
  exportBackup(): Promise<string | null>;
  restoreBackup(code: string, newPin: string): Promise<RecoveryResult | null>;
}
