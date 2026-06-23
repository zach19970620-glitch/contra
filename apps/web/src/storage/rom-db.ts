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

const NES_MAGIC = [0x4e, 0x45, 0x53, 0x1a] as const;

function assertValidNesRom(data: ArrayBuffer, context: string) {
  const bytes = new Uint8Array(data);
  const valid =
    bytes.length >= 16 &&
    NES_MAGIC.every((byte, index) => bytes[index] === byte);
  if (!valid) {
    throw new Error(
      `${context}：不是有效的 NES ROM（请确认已上传 .nes 文件，公网部署需在大厅先上传 ROM）`,
    );
  }
}

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
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      "内置 ROM 未部署（/roms/contra.nes 返回了网页）。公网请在大厅上传 ROM，或构建时注入 ROM 文件",
    );
  }
  const data = await response.arrayBuffer();
  assertValidNesRom(data, "内置 ROM");
  return {
    name: BUNDLED_ROM_NAME,
    data,
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

export async function hasUploadedRom(): Promise<boolean> {
  const uploaded = await loadUploadedRom();
  return uploaded !== null;
}

export async function loadRom(): Promise<RomRecord> {
  if (ROM_SOURCE === "bundled") {
    return loadBundledRom();
  }
  const uploaded = await loadUploadedRom();
  if (!uploaded) {
    throw new Error("请先在大厅上传 ROM（.nes 文件）");
  }
  assertValidNesRom(uploaded.data, uploaded.name);
  return uploaded;
}

export function getRomSourceLabel(): string {
  return ROM_SOURCE === "bundled"
    ? `内置: ${BUNDLED_ROM_NAME}`
    : "用户上传 ROM";
}

/** 部署切回 upload 模式时使用 */
export async function saveRom(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  assertValidNesRom(buffer, file.name);
  const db = await openDb();
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
