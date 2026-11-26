import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DesktopApi, DesktopNote, NoteInput, RecoveryResult, VaultStatus } from "./types";

export const desktopRuntimeAvailable = isTauri();

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return Promise.reject(new Error("Open MyNotes Desktop to use the encrypted local vault. A browser preview cannot access desktop storage."));
  return invoke<T>(command, args);
}

export const desktopApi: DesktopApi = {
  status: () => call<VaultStatus>("vault_status"),
  setup: (pin: string) => call<RecoveryResult>("setup_vault", { pin }),
  unlock: (pin: string) => call<void>("unlock_vault", { pin }),
  lock: () => call<void>("lock_vault"),
  recover: (code: string, newPin: string) => call<RecoveryResult>("recover_vault", { code, newPin }),
  changePin: (currentPin: string, newPin: string) => call<void>("change_pin", { currentPin, newPin }),
  regenerateCodes: () => call<RecoveryResult>("regenerate_codes"),
  listNotes: () => call<DesktopNote[]>("list_notes"),
  saveNote: (note: NoteInput) => call<DesktopNote>("save_note", { note }),
  deleteNote: (id: string) => call<void>("delete_note", { id }),
  exportBackup: () => call<string | null>("export_backup"),
  restoreBackup: (code: string, newPin: string) => call<RecoveryResult | null>("restore_backup", { code, newPin }),
};
