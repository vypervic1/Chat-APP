// Simple and robust IndexedDB wrapper for caching media, documents & files and voice notes locally.
const DB_NAME = 'VyperVicLocalStorageDB';
const DB_VERSION = 1;
const STORE_NAME = 'saved_files';

export interface SavedFile {
  id: string; // message_id or random ID
  fileName: string;
  fileType: string;
  fileData: string; // Base64 data url
  savedAt: string;
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = (event) => {
      reject(request.error);
    };
  });
}

export async function saveFileToLocalStorage(
  fileName: string,
  fileType: string,
  fileData: string,
  id?: string
): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const fileId = id || `file_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const record: SavedFile = {
      id: fileId,
      fileName,
      fileType,
      fileData,
      savedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to save file to IndexedDB local storage:', error);
  }
}

export async function getAllSavedFiles(): Promise<SavedFile[]> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to get saved files from IndexedDB:', error);
    return [];
  }
}

export async function deleteSavedFile(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to delete saved file from IndexedDB:', error);
  }
}
