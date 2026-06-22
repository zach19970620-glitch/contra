import {
  BUNDLED_ROM_NAME,
  BUNDLED_ROM_URL,
  ROM_SOURCE,
} from "../config/rom";

const DB_NAME = "contra-online";
const STORE = "roms";
const ROM_KEY = "primary";

export type RomRecord = {
  name: string;
  data: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadBundledRom(): Promise<RomRecord> {
  const response = await fetch(BUNDLED_ROM_URL);
  if (!response.ok) {
    throw new Error(`内置 ROM 加载失败: ${response.status}`);
  }
  return {
    name: BUNDLED_ROM_NAME,
    data: await response.arrayBuffer(),
  };
}

async function loadUploadedRom(): Promise<RomRecord | null> {
  const db = await openDb();
  const record = await new Promise<RomRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(ROM_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

export async function loadRom(): Promise<RomRecord> {
  if (ROM_SOURCE === "bundled") {
    return loadBundledRom();
  }
  const uploaded = await loadUploadedRom();
  if (!uploaded) {
    throw new Error("请先上传 ROM");
  }
  return uploaded;
}

export function getRomSourceLabel(): string {
  return ROM_SOURCE === "bundled"
    ? `内置: ${BUNDLED_ROM_NAME}`
    : "用户上传 ROM";
}

/** 部署切回 upload 模式时使用 */
export async function saveRom(file: File): Promise<void> {
  const db = await openDb();
  const buffer = await file.arrayBuffer();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(
      {
        name: file.name,
        data: buffer,
        updatedAt: Date.now(),
      },
      ROM_KEY,
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
