import { useEffect, useRef, useState } from "react";
import type { Session } from "../App";
import { NesAudioEngine } from "../audio/nes-audio-engine";
import { InputState } from "../emulator/input";
import { WasmEmulator } from "../emulator/wasm-emulator";
import { LockstepSync } from "../net/lockstep";
import {
  isInputPacket,
  type InputPacket,
  type NetPacket,
  WebRtcSession,
} from "../net/webrtc";
import { loadRom } from "../storage/rom-db";

const FRAME_MS = 1000 / 60.0988;
/** 单机 rAF 每帧最多追几帧，避免音频环形缓冲被瞬间灌满 */
const MAX_SOLO_CATCHUP_FRAMES = 1;
const MAX_ACCUMULATOR_MS = FRAME_MS * 4;

type Props = {
  session: Session;
  onLeave: () => void;
};

export default function Game({ session, onLeave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hashRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("初始化…");
  const [determinism, setDeterminism] = useState<string | null>(null);
  const isSolo = session.mode === "solo";

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let lastTime = 0;
    let accumulator = 0;

    const input = new InputState(
      isSolo ? { mode: "solo" } : { mode: "online", localPlayer: session.playerId },
    );
    const emulator = new WasmEmulator();
    const audio = new NesAudioEngine();
    const lockstep = session.mode === "online" ? new LockstepSync(session.playerId) : null;
    let net: WebRtcSession | null = null;
    let syncStarted = false;
    let lockstepReady = false;
    let localSyncReady = false;
    let remoteSyncReady = false;
    let pendingRemoteSyncReady = false;
    let channelReady = false;
    let remoteHello = false;
    let pendingSyncStart = false;
    const pendingInputPackets: InputPacket[] = [];
    let imageData: ImageData | null = null;
    let canvasCtx: CanvasRenderingContext2D | null = null;
    let soloFrame = 0;
    let lastHudUpdate = 0;
    let lastStatusUpdate = 0;
    let audioScratch: Float32Array | null = null;
    let lockstepTimer: ReturnType<typeof setInterval> | null = null;
    let bootGeneration = 0;
    let updateSyncStatus: (() => void) | null = null;

    const onKeyDown = (event: KeyboardEvent) => input.handleKeyDown(event.code);
    const onKeyUp = (event: KeyboardEvent) => input.handleKeyUp(event.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function renderFrame(frame: number) {
      if (!canvasCtx || !imageData) {
        return;
      }
      emulator.copyFramebuffer(imageData.data);
      canvasCtx.putImageData(imageData, 0, 0);
      if (audioScratch) {
        const count = emulator.copyAudioSamples(audioScratch);
        if (count > 0) {
          audio.pushFrame(audioScratch.subarray(0, count));
        }
      }
      const now = performance.now();
      if (hashRef.current) {
        hashRef.current.textContent = `WRAM hash: ${emulator.wramHash()}`;
      }
      if (isSolo && frame > 0 && now - lastHudUpdate >= 500) {
        lastHudUpdate = now;
        setStatus(`运行中 · 帧 ${frame}`);
      }
    }

    function stopLockstepTimer() {
      if (lockstepTimer !== null) {
        clearInterval(lockstepTimer);
        lockstepTimer = null;
      }
    }

    function runLockstepTick() {
      if (!lockstepReady || !lockstep) {
        return;
      }
      try {
        lockstep.tick(input.getLocalButtons(), (packet) => net?.send(packet));
        const now = performance.now();
        if (now - lastStatusUpdate >= 250) {
          lastStatusUpdate = now;
          updateSyncStatus?.();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "游戏循环错误";
        setStatus(`运行错误 · ${message}`);
        console.error(error);
      }
    }

    function startLockstepTimer() {
      if (lockstepTimer !== null) {
        return;
      }
      lockstepTimer = setInterval(runLockstepTick, FRAME_MS);
    }

    async function boot() {
      const generation = ++bootGeneration;
      let rom: Awaited<ReturnType<typeof loadRom>>;
      try {
        rom = await loadRom();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "ROM 加载失败");
        return;
      }

      await emulator.init();
      if (disposed || generation !== bootGeneration) {
        return;
      }
      emulator.loadRom(new Uint8Array(rom.data));
      await audio.init();
      if (disposed || generation !== bootGeneration) {
        return;
      }

      const canvas = canvasRef.current;
      canvasCtx =
        canvas?.getContext("2d", {
          alpha: false,
        }) ?? null;
      if (!canvas || !canvasCtx) {
        setStatus("Canvas 不可用");
        return;
      }

      canvas.width = emulator.width();
      canvas.height = emulator.height();
      imageData = canvasCtx.createImageData(canvas.width, canvas.height);
      audioScratch = new Float32Array(4096);

      if (isSolo) {
        setStatus("单机模式 · 本地双玩家");
      } else {
        updateSyncStatus = () => {
          const debug = lockstep!.getDebugState();
          if (lockstepReady) {
            setStatus(
              `Lockstep 同步中 · 已模拟 ${debug.simulated} 帧 · 待推进 ${debug.frame} · P1:${debug.hasP1 ? "✓" : "×"} P2:${debug.hasP2 ? "✓" : "×"}`,
            );
            return;
          }
          if (syncStarted) {
            if (!debug.bootstrapComplete) {
              setStatus(
                `等待 bootstrap · P1:${debug.hasP1 ? "✓" : "×"} P2:${debug.hasP2 ? "✓" : "×"}`,
              );
              return;
            }
            setStatus(
              `等待双方就绪 · 本机:${localSyncReady ? "✓" : "×"} 对手:${remoteSyncReady ? "✓" : "×"}`,
            );
            return;
          }
          if (channelReady) {
            setStatus("WebRTC 已连接，等待双方同步…");
          }
        };

        const tryStartSimulation = () => {
          if (
            lockstepReady ||
            !syncStarted ||
            !localSyncReady ||
            !remoteSyncReady ||
            !lockstep!.isBootstrapComplete()
          ) {
            return;
          }
          lockstepReady = true;
          lockstep!.tick(input.getLocalButtons(), (packet) => net?.send(packet));
          startLockstepTimer();
          updateSyncStatus?.();
        };

        const markBootstrapComplete = () => {
          if (!lockstep!.isBootstrapComplete()) {
            return;
          }
          if (!localSyncReady) {
            localSyncReady = true;
            lockstep!.resendBootstrap((packet) => net?.send(packet));
            net?.send({ kind: "sync-ready", playerId: session.playerId });
          }
          if (pendingRemoteSyncReady) {
            pendingRemoteSyncReady = false;
            remoteSyncReady = true;
          }
          tryStartSimulation();
        };

        const applyInputPacket = (packet: InputPacket) => {
          if (!syncStarted) {
            pendingInputPackets.push(packet);
            return;
          }
          lockstep!.applyInput(packet);
          markBootstrapComplete();
          updateSyncStatus?.();
        };

        const beginLockstep = () => {
          if (syncStarted) {
            return;
          }
          syncStarted = true;
          stopLockstepTimer();
          lockstepReady = false;
          localSyncReady = false;
          remoteSyncReady = false;
          emulator.reset();
          lockstep!.reset();
          audio.clear();

          for (const packet of pendingInputPackets) {
            lockstep!.applyInput(packet);
          }
          pendingInputPackets.length = 0;

          lockstep!.bootstrap((packet) => net?.send(packet));
          markBootstrapComplete();
          tryStartSimulation();
          updateSyncStatus?.();
        };

        const tryBeginAsHost = () => {
          if (session.isHost && channelReady && remoteHello && !syncStarted) {
            net?.send({ kind: "sync-start", playerId: session.playerId });
            beginLockstep();
          }
        };

        const handleNetPacket = (packet: NetPacket) => {
          if (packet.kind === "sync-start") {
            if (channelReady) {
              beginLockstep();
            } else {
              pendingSyncStart = true;
            }
            return;
          }
          if (packet.kind === "hello") {
            if (packet.playerId !== session.playerId) {
              remoteHello = true;
              tryBeginAsHost();
            }
            return;
          }
          if (packet.kind === "sync-ready") {
            if (packet.playerId === session.playerId) {
              return;
            }
            if (!syncStarted) {
              pendingRemoteSyncReady = true;
              return;
            }
            remoteSyncReady = true;
            tryStartSimulation();
            updateSyncStatus?.();
            return;
          }
          if (isInputPacket(packet)) {
            applyInputPacket(packet);
          }
        };

        lockstep!.setStepHandler((frame, p1, p2) => {
          emulator.setInputs(p1, p2);
          emulator.stepFrame();
          renderFrame(frame);
        });

        net = new WebRtcSession({
          signalingUrl: session.signalingUrl,
          roomId: session.roomId,
          playerId: session.playerId,
          isHost: session.isHost,
          onPacket: handleNetPacket,
          onReady: () => {
            channelReady = true;
            net?.send({ kind: "hello", playerId: session.playerId });
            tryBeginAsHost();
            if (pendingSyncStart) {
              beginLockstep();
            }
            updateSyncStatus?.();
          },
          onStatus: (message) => {
            if (!lockstepReady) {
              setStatus(message);
            }
          },
        });
      }

      const loop = (time: number) => {
        if (disposed) {
          return;
        }
        if (!lastTime) {
          lastTime = time;
        }
        accumulator += time - lastTime;
        lastTime = time;
        if (accumulator > MAX_ACCUMULATOR_MS) {
          accumulator = MAX_ACCUMULATOR_MS;
        }

        let soloSteps = 0;
        while (accumulator >= FRAME_MS && soloSteps < MAX_SOLO_CATCHUP_FRAMES) {
          if (isSolo) {
            emulator.setInputs(input.getButtons(1), input.getButtons(2));
            emulator.stepFrame();
            renderFrame(soloFrame);
            soloFrame += 1;
            soloSteps += 1;
          } else {
            break;
          }
          accumulator -= FRAME_MS;
        }
        if (!isSolo && accumulator >= FRAME_MS) {
          accumulator %= FRAME_MS;
        }
        raf = requestAnimationFrame(loop);
      };
      if (disposed || generation !== bootGeneration) {
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    boot().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "启动失败");
    });

    return () => {
      disposed = true;
      bootGeneration += 1;
      stopLockstepTimer();
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      net?.close();
      void audio.suspend();
    };
  }, [session, isSolo]);

  async function runDeterminismCheck() {
    setDeterminism("运行中…");
    let rom: Awaited<ReturnType<typeof loadRom>>;
    try {
      rom = await loadRom();
    } catch {
      setDeterminism("ROM 加载失败");
      return;
    }

    const runOnce = async () => {
      const emu = new WasmEmulator();
      await emu.init();
      emu.loadRom(new Uint8Array(rom.data));
      const script = [
        { frames: 120, p1: 0x80, p2: 0 },
        { frames: 120, p1: 0x10, p2: 0 },
        { frames: 120, p1: 0x01, p2: 0x02 },
      ];
      for (const step of script) {
        for (let i = 0; i < step.frames; i += 1) {
          emu.setInputs(step.p1, step.p2);
          emu.stepFrame();
        }
      }
      return emu.wramHash();
    };

    const a = await runOnce();
    const b = await runOnce();
    setDeterminism(a === b ? `通过 · hash=${a}` : `失败 · ${a} vs ${b}`);
  }

  const title = isSolo
    ? "单机模式"
    : `房间 ${session.roomId} · P${session.playerId}`;

  return (
    <div className="app game-shell">
      <div className="row">
        <button className="secondary" onClick={onLeave}>
          {isSolo ? "返回大厅" : "离开房间"}
        </button>
        <button className="secondary" onClick={() => void runDeterminismCheck()}>
          确定性自检
        </button>
        <span className="status">
          {title} · {status}
        </span>
      </div>
      <canvas ref={canvasRef} />
      <div ref={hashRef} className="status">
        WRAM hash: 0
      </div>
      {determinism ? <div className="status">Determinism: {determinism}</div> : null}
    </div>
  );
}
