"use client";

/**
 * Offline store (D4 / PLAN §10). Kept tracks live encrypted-at-rest in
 * IndexedDB (AES-GCM with a non-extractable device key), never as loose files.
 * They are entitlement-revalidated on each online launch and purged on
 * lapse/logout/TTL. Honest limit: a browser PWA can't do true DRM — this is
 * strong deterrence (encrypted, in-app-only, expiring), not license-based DRM.
 */
const DB_NAME = "akasha-offline";
const AUDIO_STORE = "audio";
const META_STORE = "meta";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE))
        db.createObjectStore(AUDIO_STORE, { keyPath: "trackId" });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

async function deviceKey(): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>(META_STORE, "readonly", (s) =>
    s.get("deviceKey"),
  );
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
  await tx(META_STORE, "readwrite", (s) => s.put(key, "deviceKey"));
  return key;
}

interface AudioRecord {
  trackId: string;
  iv: Uint8Array;
  data: ArrayBuffer;
  type: string;
  expiresAt: number;
}

export async function keepTrack(
  trackId: string,
  url: string,
  ttlDays: number,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("download failed");
  const type = res.headers.get("Content-Type") ?? "audio/mp4";
  const plain = await res.arrayBuffer();
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const record: AudioRecord = {
    trackId,
    iv,
    data,
    type,
    expiresAt: Date.now() + ttlDays * 86400000,
  };
  await tx(AUDIO_STORE, "readwrite", (s) => s.put(record));
}

export async function offlineBlobUrl(trackId: string): Promise<string | null> {
  const rec = await tx<AudioRecord | undefined>(AUDIO_STORE, "readonly", (s) =>
    s.get(trackId),
  );
  if (!rec) return null;
  if (rec.expiresAt < Date.now()) {
    await removeTrack(trackId);
    return null;
  }
  try {
    const key = await deviceKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: rec.iv as BufferSource },
      key,
      rec.data,
    );
    return URL.createObjectURL(new Blob([plain], { type: rec.type }));
  } catch {
    return null;
  }
}

export async function isKept(trackId: string): Promise<boolean> {
  const rec = await tx<AudioRecord | undefined>(AUDIO_STORE, "readonly", (s) =>
    s.get(trackId),
  );
  return Boolean(rec && rec.expiresAt >= Date.now());
}

export async function removeTrack(trackId: string): Promise<void> {
  await tx(AUDIO_STORE, "readwrite", (s) => s.delete(trackId));
}

export async function keptTrackIds(): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>(AUDIO_STORE, "readonly", (s) => s.getAllKeys());
  return keys.map((k) => String(k));
}

/** Purge anything no longer entitled (from /api/offline/sync) or expired. */
export async function purgeInvalid(validIds: string[]): Promise<void> {
  const valid = new Set(validIds);
  const ids = await keptTrackIds();
  for (const id of ids) {
    if (!valid.has(id)) await removeTrack(id);
    else if (!(await isKept(id))) await removeTrack(id);
  }
}

/** Wipe everything (logout). */
export async function purgeAll(): Promise<void> {
  await tx(AUDIO_STORE, "readwrite", (s) => s.clear());
}
