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

  return (
    <div className="app">
      <h1>Contra Online MVP</h1>
      <p className="status">
        联机 · Lockstep ·{" "}
        {ROM_SOURCE === "bundled" ? "内置 ROM" : "请上传自有 ROM（.nes）"}
      </p>
      <Lobby
        defaultSignalingUrl={defaultSignalingUrl}
        onJoin={(next) => setSession(next)}
      />
    </div>
  );
}
