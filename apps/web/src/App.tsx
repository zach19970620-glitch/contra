import { useState } from "react";
import Game from "./pages/Game";
import Lobby from "./pages/Lobby";
import { ROM_SOURCE } from "./config/rom";
import { getDefaultSignalingUrl } from "./config/webrtc";

export type Session =
  | { mode: "solo" }
  | {
      mode: "online";
      roomId: string;
      playerId: 1 | 2;
      isHost: boolean;
      signalingUrl: string;
    };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const defaultSignalingUrl = getDefaultSignalingUrl();

  if (session) {
    return <Game session={session} onLeave={() => setSession(null)} />;
  }

  const romBundled = ROM_SOURCE === "bundled";

  return (
    <div className="app">
      <header className="hero">
        <span className="hero__tag">SYSTEM ONLINE</span>
        <h1 className="wordmark">
          CONTRA
          <span className="wordmark__sub">ONLINE · 魂斗罗联机</span>
        </h1>
        <p className="hero__line">
          Rust WASM NES 核心 · WebRTC <b>Lockstep</b> 帧同步 · AudioWorklet 低延迟音频。
          <br />
          双人跨网，逐帧确定性对战。
        </p>
        <div className="statusbar">
          <span className="pill">
            <span className="pill__dot" />
            Lockstep Netplay
          </span>
          <span className="pill">
            <span className="pill__dot pill__dot--amber" />
            {romBundled ? "内置 ROM" : "需上传 ROM (.nes)"}
          </span>
          <span className="pill">
            <span className="pill__dot pill__dot--red" />
            60.0988 Hz · 确定性核心
          </span>
        </div>
      </header>

      <Lobby
        defaultSignalingUrl={defaultSignalingUrl}
        onJoin={(next) => setSession(next)}
      />

      <footer className="creds">魂斗罗 · 1987 KONAMI · 网页联机复刻</footer>
    </div>
  );
}
