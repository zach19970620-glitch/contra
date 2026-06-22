import { useMemo, useState } from "react";
import Game from "./pages/Game";
import Lobby from "./pages/Lobby";

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
  const defaultSignalingUrl = useMemo(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    return `${protocol}//${host}:8080`;
  }, []);

  if (session) {
    return <Game session={session} onLeave={() => setSession(null)} />;
  }

  return (
    <div className="app">
      <h1>Contra Online MVP</h1>
      <p className="status">
        局域网联机 · Rust WASM 核心 · WebRTC Lockstep · 内置 ROM
      </p>
      <Lobby
        defaultSignalingUrl={defaultSignalingUrl}
        onJoin={(next) => setSession(next)}
      />
    </div>
  );
}
