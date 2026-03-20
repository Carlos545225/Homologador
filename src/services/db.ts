import { openDB, IDBPDatabase } from 'idb';
import { HealthProcedure } from '../types';

const DB_NAME = 'HealthTariffsDB';
const STORE_NAME = 'procedures';

export async function initDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'Codigo_CUPS' });
        store.createIndex('Descripcion', 'Descripcion');
        store.createIndex('Codigo_SOAT', 'Codigo_SOAT');
      }
    },
  });
}

export async function saveProcedures(procedures: HealthProcedure[]) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.clear();
  for (const p of procedures) {
    await store.put(p);
  }
  await tx.done;
}

export async function getAllProcedures(): Promise<HealthProcedure[]> {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}

export async function searchProcedures(query: string): Promise<HealthProcedure[]> {
  const db = await initDB();
  const all = await db.getAll(STORE_NAME);
  const q = query.toLowerCase();
  return all.filter(p => 
    p.Codigo_CUPS.toLowerCase().includes(q) || 
    p.Codigo_SOAT.toLowerCase().includes(q) || 
    p.Descripcion.toLowerCase().includes(q)
  ).slice(0, 50); // Limit results for performance
}
