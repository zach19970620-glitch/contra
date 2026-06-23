import { useEffect, useState } from "react";
import type { Session } from "../App";
import { ROM_SOURCE } from "../config/rom";
import { getRomSourceLabel, hasUploadedRom, saveRom } from "../storage/rom-db";

type Props = {
  defaultSignalingUrl: string;
  onJoin: (session: Session) => void;
};

const KEYMAP = [
  { keys: "W A S D", label: "移动", role: "MOVE" },
  { keys: "J / K", label: "射击 · 跳跃", role: "FIRE / JUMP" },
  { keys: "Enter", label: "开始", role: "START" },
  { keys: "Space", label: "选择", role: "SELECT" },
];

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
    setError(null);
    onJoin({
      mode: "online",
      roomId: id,
      playerId: asHost ? 1 : 2,
      isHost: asHost,
      signalingUrl: signalingUrl.trim(),
    });
  }

  return (
    <>
      <section className="panel">
        <div className="panel__head">
          作战部署 · DEPLOY
          <span>{getRomSourceLabel()}</span>
        </div>

        <div className="row">
          <label className="field">
            <span className="field__label">房间号 · ROOM CODE</span>
            <input
              type="text"
              placeholder="例如 contra-001"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">信令地址 · SIGNAL LINK</span>
            <input
              type="text"
              placeholder="wss://…"
              value={signalingUrl}
              onChange={(event) => setSignalingUrl(event.target.value)}
            />
          </label>
        </div>

        {needsUpload ? (
          <>
            <div className="divider" />
            <div className="row">
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
                {romReady ? "弹药已就绪 · ROM LOADED" : "请先上传 ROM 再开始游戏"}
              </span>
            </div>
          </>
        ) : null}

        <div className="deploy">
          <button disabled={!romReady} onClick={() => onJoin({ mode: "solo" })}>
            单机模式
            <small>本地双玩家 · 不联网</small>
          </button>
          <button disabled={!romReady} onClick={() => join(true)}>
            创建房间 · P1
            <small>作为主机发起对战</small>
          </button>
          <button
            className="secondary"
            disabled={!romReady}
            onClick={() => join(false)}
          >
            加入房间 · P2
            <small>连入同房间号</small>
          </button>
        </div>

        {error ? <p className="error">⚠ {error}</p> : null}
      </section>

      <section className="panel panel--delay">
        <div className="panel__head">
          操作键位 · CONTROLS
          <span>联机时各自本机操作</span>
        </div>
        <div className="keymap">
          <div className="keymap__grid">
            {KEYMAP.map((k) => (
              <div className="keycard" key={k.role}>
                <kbd>{k.keys}</kbd>
                <div className="keycard__meta">
                  <b>{k.label}</b>
                  <small>{k.role}</small>
                </div>
              </div>
            ))}
          </div>
          <p className="note">
            联机时每位玩家在自己电脑上使用同一套键位；单机模式下 P1 / P2 同步操作。
          </p>
        </div>
      </section>
    </>
  );
}
