const DB_NAME = 'creative-collab-studio';
const DB_VERSION = 2;

export const STORE_PROJECTS = 'projects';
export const STORE_TICKETS = 'tickets';
export const STORE_SCENES = 'scenes';
export const STORE_META = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction!;

      const ensureStore = (name: string) => {
        if (db.objectStoreNames.contains(name)) {
          return transaction.objectStore(name);
        }
        return db.createObjectStore(name, { keyPath: 'id' });
      };

      ensureStore(STORE_PROJECTS);
      const tickets = ensureStore(STORE_TICKETS);
      if (!tickets.indexNames.contains('projectId')) {
        tickets.createIndex('projectId', 'projectId', { unique: false });
      }
      const scenes = ensureStore(STORE_SCENES);
      if (!scenes.indexNames.contains('projectId')) {
        scenes.createIndex('projectId', 'projectId', { unique: false });
      }
      ensureStore(STORE_META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let request: IDBRequest<T> | void;
    try {
      request = action(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      if (request) {
        resolve(request.result);
      } else {
        resolve(undefined);
      }
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getAllRecords<T>(storeName: string): Promise<T[]> {
  const result = await withStore<T[]>(storeName, 'readonly', (store) => store.getAll());
  return result ?? [];
}

export async function getRecord<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T>(storeName, 'readonly', (store) => store.get(key));
}

export async function putRecord<T>(storeName: string, value: T): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.put(value));
}

export async function putRecords<T>(storeName: string, values: T[]): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => {
    values.forEach((value) => store.put(value));
  });
}

export async function deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
  await withStore(storeName, 'readwrite', (store) => store.delete(key));
}

async function deleteByProject(storeName: string, projectId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const index = transaction.objectStore(storeName).index('projectId');
    const request = index.openCursor(IDBKeyRange.only(projectId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteTicketsForProject(projectId: string): Promise<void> {
  await deleteByProject(STORE_TICKETS, projectId);
}

export async function deleteScenesForProject(projectId: string): Promise<void> {
  await deleteByProject(STORE_SCENES, projectId);
}

export async function resetDatabase(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      [STORE_PROJECTS, STORE_TICKETS, STORE_SCENES, STORE_META],
      'readwrite',
    );
    transaction.objectStore(STORE_PROJECTS).clear();
    transaction.objectStore(STORE_TICKETS).clear();
    transaction.objectStore(STORE_SCENES).clear();
    transaction.objectStore(STORE_META).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
