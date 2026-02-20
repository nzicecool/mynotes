/**
 * IndexedDB wrapper for offline note storage
 */

const DB_NAME = "MyNotesDB";
const DB_VERSION = 1;
const NOTES_STORE = "notes";
const SYNC_QUEUE_STORE = "syncQueue";

export interface OfflineNote {
  id: number;
  title: string | null;
  encryptedContent: string;
  noteType: string;
  isPinned: number;
  isArchived: number;
  isTrashed: number;
  createdAt: Date;
  updatedAt: Date;
  userId: number;
}

export interface SyncQueueItem {
  id?: number;
  action: "create" | "update" | "delete";
  noteId?: number;
  data?: Partial<OfflineNote>;
  timestamp: number;
}

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create notes store
      if (!database.objectStoreNames.contains(NOTES_STORE)) {
        const notesStore = database.createObjectStore(NOTES_STORE, { keyPath: "id" });
        notesStore.createIndex("userId", "userId", { unique: false });
        notesStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      // Create sync queue store
      if (!database.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        database.createObjectStore(SYNC_QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
  });
}

/**
 * Save notes to IndexedDB
 */
export async function saveNotesToDB(notes: OfflineNote[]): Promise<void> {
  const database = await initDB();
  const transaction = database.transaction([NOTES_STORE], "readwrite");
  const store = transaction.objectStore(NOTES_STORE);

  for (const note of notes) {
    store.put(note);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get all notes from IndexedDB
 */
export async function getNotesFromDB(): Promise<OfflineNote[]> {
  const database = await initDB();
  const transaction = database.transaction([NOTES_STORE], "readonly");
  const store = transaction.objectStore(NOTES_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single note from IndexedDB
 */
export async function getNoteFromDB(noteId: number): Promise<OfflineNote | undefined> {
  const database = await initDB();
  const transaction = database.transaction([NOTES_STORE], "readonly");
  const store = transaction.objectStore(NOTES_STORE);
  const request = store.get(noteId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a note from IndexedDB
 */
export async function deleteNoteFromDB(noteId: number): Promise<void> {
  const database = await initDB();
  const transaction = database.transaction([NOTES_STORE], "readwrite");
  const store = transaction.objectStore(NOTES_STORE);
  store.delete(noteId);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Add item to sync queue
 */
export async function addToSyncQueue(item: Omit<SyncQueueItem, "id">): Promise<void> {
  const database = await initDB();
  const transaction = database.transaction([SYNC_QUEUE_STORE], "readwrite");
  const store = transaction.objectStore(SYNC_QUEUE_STORE);
  store.add(item);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get all items from sync queue
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const database = await initDB();
  const transaction = database.transaction([SYNC_QUEUE_STORE], "readonly");
  const store = transaction.objectStore(SYNC_QUEUE_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear sync queue
 */
export async function clearSyncQueue(): Promise<void> {
  const database = await initDB();
  const transaction = database.transaction([SYNC_QUEUE_STORE], "readwrite");
  const store = transaction.objectStore(SYNC_QUEUE_STORE);
  store.clear();

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Check if app is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Setup online/offline event listeners
 */
export function setupOnlineListeners(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
