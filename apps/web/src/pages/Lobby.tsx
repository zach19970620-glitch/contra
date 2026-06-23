import { useEffect, useState } from "react";
import type { Session } from "../App";
import { ROM_SOURCE } from "../config/rom";
import { getRomSourceLabel, hasUploadedRom, saveRom } from "../storage/rom-db";

type Props = {
  defaultSignalingUrl: string;
  onJoin: (session: Session) => void;
};

export default function Lobby({ defaultSignalingUrl, onJoin }: Props) {
  const [roomId, setRoomId] = useState("");
  const [signalingUrl, setSignalingUrl] = useState(defaultSignalingUrl);
  const [error, setError] = useState<string | null>(null);
  const [romReady, setRomReady] = useState(ROM_SOURCE === "bundled");
  const needsUpload = ROM_SOURCE === "upload";

  useEffect(() => {
    if (!needsUpload) {
      return;
    }
    void hasUploadedRom().then(setRomReady);
  }, [needsUpload]);

  async function onRomSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    try {
      await saveRom(file);
      setRomReady(true);
    } catch (uploadError) {
      setRomReady(false);
      setError(
        uploadError instanceof Error ? uploadError.message : "ROM 保存失败",
      );
    }
    event.target.value = "";
  }

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
        {needsUpload ? (
          <>
            <label className="secondary" style={{ cursor: "pointer" }}>
              {romReady ? "更换 ROM" : "上传 ROM (.nes)"}
              <input
                type="file"
                accept=".nes,application/octet-stream"
                hidden
                onChange={(event) => void onRomSelected(event)}
              />
            </label>
            <span className="status">
              {romReady ? "已就绪" : "请先上传 ROM 再开始游戏"}
            </span>
          </>
        ) : null}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button disabled={!romReady} onClick={() => onJoin({ mode: "solo" })}>
          单机模式
        </button>
        <button disabled={!romReady} onClick={() => join(true)}>
          创建房间 (P1)
        </button>
        <button
          className="secondary"
          disabled={!romReady}
          onClick={() => join(false)}
        >
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
