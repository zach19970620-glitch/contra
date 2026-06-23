/** 公网部署：在构建时通过环境变量注入 STUN/TURN 与信令地址 */

export function getIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS?.trim();
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as RTCIceServer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[webrtc] VITE_ICE_SERVERS 不是合法 JSON，已忽略");
    return [];
  }
}

export function getDefaultSignalingUrl(): string {
  const fromEnv = import.meta.env.VITE_SIGNALING_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  return `${protocol}//${host}:8080`;
}
