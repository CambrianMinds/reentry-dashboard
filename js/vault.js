/**
 * Indiana Re-Entry Vault (IndexedDB Wrapper)
 * Zero-server, client-side persistent storage for cases, court documents, statutory deadlines, and petitioner profiles.
 */

const DB_NAME = 'IndianaReEntryVault';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Open or initialize the IndexedDB vault
 * @returns {Promise<IDBDatabase>}
 */
export async function openVault() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Cases store
      if (!db.objectStoreNames.contains('cases')) {
        const casesStore = db.createObjectStore('cases', { keyPath: 'id' });
        casesStore.createIndex('causeNumber', 'causeNumber', { unique: false });
        casesStore.createIndex('status', 'status', { unique: false });
        casesStore.createIndex('county', 'county', { unique: false });
        casesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 2. Documents store (PDF packets, orders, ISP reports)
      if (!db.objectStoreNames.contains('documents')) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('caseId', 'caseId', { unique: false });
        docStore.createIndex('type', 'type', { unique: false });
        docStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 3. Events & Deadlines store
      if (!db.objectStoreNames.contains('events')) {
        const eventStore = db.createObjectStore('events', { keyPath: 'id' });
        eventStore.createIndex('caseId', 'caseId', { unique: false });
        eventStore.createIndex('date', 'date', { unique: false });
        eventStore.createIndex('type', 'type', { unique: false });
        eventStore.createIndex('completed', 'completed', { unique: false });
      }

      // 4. Petitioner Profile (single record, key: 'user')
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'id' });
      }

      // 5. Settings store (single record, key: 'app')
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance.onclose = () => { dbInstance = null; };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Failed to open IndianaReEntryVault:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Generate a unique ID (UUID v4 fallback)
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

// -------------------------------------------------------------
// CASES CRUD
// -------------------------------------------------------------

export async function getAllCases() {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cases', 'readonly');
    const store = tx.objectStore('cases');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getCase(id) {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cases', 'readonly');
    const store = tx.objectStore('cases');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCase(caseData) {
  const db = await openVault();
  const now = new Date().toISOString();
  const record = {
    id: caseData.id || generateId(),
    causeNumber: caseData.causeNumber ? caseData.causeNumber.trim().toUpperCase() : '',
    county: caseData.county || '',
    court: caseData.court || '',
    offenseTier: caseData.offenseTier || 2,
    dispositionDate: caseData.dispositionDate || null,
    sentenceCompletedDate: caseData.sentenceCompletedDate || null,
    eligibility: caseData.eligibility || null,
    status: caseData.status || 'imported', // 'imported' | 'petitioned' | 'granted' | 'denied' | 'archived'
    notes: caseData.notes || '',
    charges: caseData.charges || '',
    source: caseData.source || 'manual', // 'manual' | 'mycase' | 'import'
    createdAt: caseData.createdAt || now,
    updatedAt: now
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('cases', 'readwrite');
    const store = tx.objectStore('cases');
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function updateCase(id, patch) {
  const existing = await getCase(id);
  if (!existing) throw new Error(`Case not found: ${id}`);
  const updated = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: new Date().toISOString()
  };
  return saveCase(updated);
}

export async function deleteCase(id) {
  const db = await openVault();
  // Also clean up linked events & documents
  await deleteEventsForCase(id);
  await deleteDocumentsForCase(id);

  return new Promise((resolve, reject) => {
    const tx = db.transaction('cases', 'readwrite');
    const store = tx.objectStore('cases');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// -------------------------------------------------------------
// DOCUMENTS CRUD (PDFs, Orders, Filings)
// -------------------------------------------------------------

export async function getAllDocuments() {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getDocumentsByCase(caseId) {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const index = tx.objectStore('documents').index('caseId');
    const req = index.getAll(caseId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getDocument(id) {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDocument(docData) {
  const db = await openVault();
  const record = {
    id: docData.id || generateId(),
    caseId: docData.caseId || null,
    type: docData.type || 'uploaded', // 'generated-packet' | 'uploaded' | 'order' | 'isp-report' | 'other'
    name: docData.name || 'Document.pdf',
    mimeType: docData.mimeType || 'application/pdf',
    data: docData.data, // Blob, ArrayBuffer, or Base64
    size: docData.size || (docData.data ? (docData.data.byteLength || docData.data.size || 0) : 0),
    createdAt: docData.createdAt || new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDocument(id) {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const req = tx.objectStore('documents').delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function deleteDocumentsForCase(caseId) {
  const docs = await getDocumentsByCase(caseId);
  for (const doc of docs) {
    await deleteDocument(doc.id);
  }
}

// -------------------------------------------------------------
// EVENTS & DEADLINES CRUD
// -------------------------------------------------------------

export async function getAllEvents() {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('events', 'readonly');
    const store = tx.objectStore('events');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getEventsByCase(caseId) {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('events', 'readonly');
    const index = tx.objectStore('events').index('caseId');
    const req = index.getAll(caseId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveEvent(eventData) {
  const db = await openVault();
  const record = {
    id: eventData.id || generateId(),
    caseId: eventData.caseId || null,
    title: eventData.title || '',
    date: eventData.date || new Date().toISOString().split('T')[0],
    type: eventData.type || 'reminder', // 'statutory' | 'hearing' | 'service' | 'custom' | 'reminder'
    completed: Boolean(eventData.completed),
    notes: eventData.notes || '',
    createdAt: eventData.createdAt || new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('events', 'readwrite');
    const req = tx.objectStore('events').put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function updateEvent(id, patch) {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('events', 'readwrite');
    const store = tx.objectStore('events');
    const req = store.get(id);
    req.onsuccess = () => {
      const existing = req.result;
      if (!existing) {
        reject(new Error(`Event not found: ${id}`));
        return;
      }
      const updated = { ...existing, ...patch, id: existing.id };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteEvent(id) {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('events', 'readwrite');
    const req = tx.objectStore('events').delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function deleteEventsForCase(caseId) {
  const events = await getEventsByCase(caseId);
  for (const ev of events) {
    await deleteEvent(ev.id);
  }
}

// -------------------------------------------------------------
// PROFILE & SETTINGS CRUD
// -------------------------------------------------------------

export async function getProfile() {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('profile', 'readonly');
    const req = tx.objectStore('profile').get('user');
    req.onsuccess = () => {
      resolve(req.result || {
        id: 'user',
        fullName: '',
        ssn: '',
        dob: '',
        dlNumber: '',
        phone: '',
        email: '',
        addresses: [], // 10-year address history items
        updatedAt: null
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveProfile(profileData) {
  const db = await openVault();
  const record = {
    ...profileData,
    id: 'user',
    updatedAt: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('profile', 'readwrite');
    const req = tx.objectStore('profile').put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function getSettings() {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get('app');
    req.onsuccess = () => {
      resolve(req.result || {
        id: 'app',
        theme: 'system',
        notificationsEnabled: false,
        reminderDaysBefore: [1, 7, 30]
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveSettings(settingsData) {
  const db = await openVault();
  const record = {
    ...settingsData,
    id: 'app'
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const req = tx.objectStore('settings').put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

// -------------------------------------------------------------
// EXPORT, IMPORT & PURGE (Zero-Knowledge Privacy)
// -------------------------------------------------------------

/**
 * Helper to convert Blob or ArrayBuffer to base64 for JSON serialization
 */
async function binaryToBase64(data) {
  if (!data) return null;
  if (typeof data === 'string') return data; // already base64 or string

  let blob = data;
  if (data instanceof ArrayBuffer) {
    blob = new Blob([data]);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Helper to convert base64 data URL back to ArrayBuffer
 */
function base64ToArrayBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const parts = dataUrl.split(',');
  const base64 = parts.length > 1 ? parts[1] : parts[0];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Export complete vault state as a structured JSON object
 */
export async function exportVault() {
  const cases = await getAllCases();
  const rawDocs = await getAllDocuments();
  const events = await getAllEvents();
  const profile = await getProfile();
  const settings = await getSettings();

  // Convert binary document payloads to base64 so they can be preserved in JSON
  const documents = [];
  for (const doc of rawDocs) {
    const serializedData = await binaryToBase64(doc.data);
    documents.push({
      ...doc,
      data: serializedData
    });
  }

  return {
    meta: {
      app: 'IndianaReEntryVault',
      version: 1,
      exportedAt: new Date().toISOString()
    },
    cases,
    documents,
    events,
    profile,
    settings
  };
}

/**
 * Import a vault JSON backup
 * @param {Object} backupData 
 * @param {boolean} overwrite If true, clears existing data first
 */
export async function importVault(backupData, overwrite = false) {
  if (!backupData || !backupData.meta || backupData.meta.app !== 'IndianaReEntryVault') {
    throw new Error('Invalid backup file: Not an Indiana Re-Entry Vault export.');
  }

  if (overwrite) {
    await clearAllData();
  }

  // Restore cases
  if (Array.isArray(backupData.cases)) {
    for (const c of backupData.cases) {
      await saveCase(c);
    }
  }

  // Restore events
  if (Array.isArray(backupData.events)) {
    for (const ev of backupData.events) {
      await saveEvent(ev);
    }
  }

  // Restore documents
  if (Array.isArray(backupData.documents)) {
    for (const doc of backupData.documents) {
      const restoredBuffer = base64ToArrayBuffer(doc.data);
      await saveDocument({
        ...doc,
        data: restoredBuffer || doc.data
      });
    }
  }

  // Restore profile
  if (backupData.profile) {
    await saveProfile(backupData.profile);
  }

  // Restore settings
  if (backupData.settings) {
    await saveSettings(backupData.settings);
  }

  return true;
}

/**
 * Clear all data in all object stores (Zero-knowledge wipe)
 */
export async function clearAllData() {
  const db = await openVault();
  const storeNames = ['cases', 'documents', 'events', 'profile', 'settings'];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    storeNames.forEach((name) => {
      tx.objectStore(name).clear();
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Check client storage estimation
 */
export async function getStorageUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percent = quota > 0 ? ((usage / quota) * 100).toFixed(1) : 0;
    return {
      usageBytes: usage,
      quotaBytes: quota,
      usageMB: (usage / (1024 * 1024)).toFixed(2),
      quotaMB: (quota / (1024 * 1024)).toFixed(2),
      percentUsed: percent
    };
  }
  return { usageMB: 'N/A', quotaMB: 'N/A', percentUsed: '0' };
}
