import { useState } from "react";
import type { Session } from "../App";
import { getRomSourceLabel } from "../storage/rom-db";

type Props = {
  defaultSignalingUrl: string;
  onJoin: (session: Session) => void;
};

export default function Lobby({ defaultSignalingUrl, onJoin }: Props) {
  const [roomId, setRoomId] = useState("");
  const [signalingUrl, setSignalingUrl] = useState(defaultSignalingUrl);
  const [error, setError] = useState<string | null>(null);

  function join(asHost: boolean) {
    const id = roomId.trim();
    if (!id) {
      setError("请输入房间号");
      return;
    }
    onJoin({
      mode: "online",
      roomId: id,
      playerId: asHost ? 1 : 2,
      isHost: asHost,
      signalingUrl: signalingUrl.trim(),
    });
  }

  return (
    <div className="panel">
      <div className="row">
        <input
          type="text"
          placeholder="房间号，例如 contra-001"
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
        />
        <input
          type="text"
          placeholder="信令地址"
          value={signalingUrl}
          onChange={(event) => setSignalingUrl(event.target.value)}
        />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <span className="status">{getRomSourceLabel()}</span>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={() => onJoin({ mode: "solo" })}>单机模式</button>
        <button onClick={() => join(true)}>创建房间 (P1)</button>
        <button className="secondary" onClick={() => join(false)}>
          加入房间 (P2)
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="keymap" style={{ marginTop: 16 }}>
        统一键位: WASD 移动 · J/K 射击 · Enter 开始 · Space 选择
        <br />
        联机时各玩家在自己电脑上用同一套键；单机时 P1/P2 同步操作
      </div>
    </div>
  );
}
