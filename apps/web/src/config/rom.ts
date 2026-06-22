/** 开发阶段内置 ROM；部署时改为 "upload" 恢复用户上传 */
export const ROM_SOURCE = "bundled" as const satisfies "bundled" | "upload";

export const BUNDLED_ROM_URL = "/roms/contra.nes";
export const BUNDLED_ROM_NAME = "魂斗罗.nes";
