export type RomSource = "bundled" | "upload";

function resolveRomSource(): RomSource {
  const fromEnv = import.meta.env.VITE_ROM_SOURCE?.trim();
  if (fromEnv === "bundled" || fromEnv === "upload") {
    return fromEnv;
  }
  // 生产构建默认 upload：*.nes 不入库，Pages 上无内置 ROM
  return import.meta.env.PROD ? "upload" : "bundled";
}

/** 开发本地用内置 ROM；公网部署用 upload（或 VITE_ROM_SOURCE=bundled + CI 注入 ROM 文件） */
export const ROM_SOURCE = resolveRomSource();

export const BUNDLED_ROM_URL = "/roms/contra.nes";
export const BUNDLED_ROM_NAME = "魂斗罗.nes";
