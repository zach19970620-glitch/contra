import { useEffect, useRef, useState } from "react";
import type { Session } from "../App";
import { NesAudioEngine } from "../audio/nes-audio-engine";
import { NesCanvasRenderer } from "../emulator/canvas-renderer";
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
const HUD_UPDATE_MS = 400;

type Props = {
  session: Session;
  onLeave: () => void;
};

export default function Game({ session, onLeave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const monitorRef = useRef<HTMLDivElement>(null);
  const hashRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState("初始化…");
  const [determinism, setDeterminism] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isSolo = session.mode === "solo";

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === monitorRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    const monitor = monitorRef.current;
    if (!monitor) {
      return;
    }
    try {
      if (document.fullscreenElement === monitor) {
        await document.exitFullscreen();
      } else {
        await monitor.requestFullscreen();
      }
    } catch (error) {
      console.warn("[fullscreen]", error);
    }
  }

  useEffect(() => {
    let disposed = false;
    let raf = 0;

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
    let helloRetryTimer: ReturnType<typeof setInterval> | null = null;
    const pendingInputPackets: InputPacket[] = [];
    let renderer: NesCanvasRenderer | null = null;
    let canvasCtx: CanvasRenderingContext2D | null = null;
    let imageData: ImageData | null = null;
    let pixelBuffer: Uint8ClampedArray | null = null;
    let soloFrame = 0;
    let lastBlitFrame = -1;
    let simAccumulator = 0;
    let lastLoopTime = 0;
    let lastHudUpdate = 0;
    let lastStatusUpdate = 0;
    let audioScratch: Float32Array | null = null;
    let bootGeneration = 0;
    let updateSyncStatus: (() => void) | null = null;

    const onKeyDown = (event: KeyboardEvent) => input.handleKeyDown(event.code);
    const onKeyUp = (event: KeyboardEvent) => input.handleKeyUp(event.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function pushAudio() {
      if (!audioScratch) {
        return;
      }
      const count = emulator.copyAudioSamples(audioScratch);
      if (count > 0) {
        audio.pushFrame(audioScratch.subarray(0, count));
      }
    }

    function blitFramebuffer() {
      if (!pixelBuffer) {
        return;
      }
      emulator.copyFramebuffer(pixelBuffer);
      if (renderer) {
        renderer.blit(pixelBuffer);
        return;
      }
      if (canvasCtx && imageData) {
        imageData.data.set(pixelBuffer);
        canvasCtx.putImageData(imageData, 0, 0);
      }
    }

    function blitIfFrameChanged(frame: number) {
      if (frame === lastBlitFrame) {
        return;
      }
      lastBlitFrame = frame;
      blitFramebuffer();
    }

    function setGameplayStatus(message: string) {
      if (statusRef.current) {
        statusRef.current.textContent = message;
        return;
      }
      setStatus(message);
    }

    function updateHud(frame: number, force = false) {
      const now = performance.now();
      if (!force && now - lastHudUpdate < HUD_UPDATE_MS) {
        return;
      }
      lastHudUpdate = now;
      if (hashRef.current) {
        const hash = emulator.wramHash();
        const latency = audio.totalLatencyMs().toFixed(0);
        hashRef.current.textContent = `WRAM ${hash} · 音频 ~${latency}ms`;
      }
      if (isSolo && frame > 0) {
        setGameplayStatus(`运行中 · 帧 ${frame}`);
      }
    }

    function stepEmulatorFrame(p1: number, p2: number) {
      emulator.setInputs(p1, p2);
      emulator.stepFrame();
      if (!audio.isPullMode()) {
        pushAudio();
      }
    }

    function stepSoloFrame() {
      emulator.setInputs(input.getButtons(1), input.getButtons(2));
      emulator.stepFrame();
      pushAudio();
      soloFrame += 1;
    }

    function runLockstepTick() {
      if (!lockstepReady || !lockstep) {
        return;
      }
      lockstep.tick(input.getLocalButtons(), (packet) => net?.send(packet));
    }

    function stopHelloRetry() {
      if (helloRetryTimer !== null) {
        clearInterval(helloRetryTimer);
        helloRetryTimer = null;
      }
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
      try {
        emulator.loadRom(new Uint8Array(rom.data));
      } catch (error) {
        setStatus(
          error instanceof Error
            ? `ROM 无效 · ${error.message}`
            : "ROM 无效",
        );
        return;
      }
      await audio.init(isSolo ? "pull" : "push");
      if (disposed || generation !== bootGeneration) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        setStatus("Canvas 不可用");
        return;
      }

      const width = emulator.width();
      const height = emulator.height();
      pixelBuffer = new Uint8ClampedArray(width * height * 4);
      audioScratch = new Float32Array(4096);

      try {
        renderer = new NesCanvasRenderer(canvas, width, height);
      } catch {
        canvasCtx =
          canvas.getContext("2d", {
            alpha: false,
          }) ?? null;
        if (!canvasCtx) {
          setStatus("Canvas 不可用");
          return;
        }
        canvas.width = width;
        canvas.height = height;
        imageData = canvasCtx.createImageData(width, height);
      }

      if (isSolo) {
        audio.setPullHandler(stepSoloFrame);
        audio.prime();
        blitFramebuffer();
        setStatus("单机模式 · 本地双玩家");
      } else {
        updateSyncStatus = () => {
          const debug = lockstep!.getDebugState();
          if (lockstepReady) {
            setGameplayStatus(
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
            if (session.isHost) {
              setStatus(
                remoteHello
                  ? "WebRTC 已连接，正在发起同步…"
                  : "WebRTC 已连接，等待对方 hello…",
              );
            } else {
              setStatus("WebRTC 已连接，等待 P1 发起同步…");
            }
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
          simAccumulator = 0;
          lastLoopTime = performance.now();
          runLockstepTick();
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
          // 收包只缓存输入；推进只在 tick 里对称进行，避免越过本地 input delay 管道
          lockstep!.applyInput(packet);
          markBootstrapComplete();
          updateSyncStatus?.();
        };

        const beginLockstep = () => {
          if (syncStarted) {
            return;
          }
          stopHelloRetry();
          syncStarted = true;
          lockstepReady = false;
          lastBlitFrame = -1;
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

        const sendHello = () => {
          net?.send({ kind: "hello", playerId: session.playerId });
        };

        const startHelloRetry = () => {
          stopHelloRetry();
          helloRetryTimer = setInterval(() => {
            if (syncStarted || !channelReady) {
              stopHelloRetry();
              return;
            }
            sendHello();
            tryBeginAsHost();
          }, 500);
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
              sendHello();
              tryBeginAsHost();
              updateSyncStatus?.();
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
          stepEmulatorFrame(p1, p2);
          lastBlitFrame = frame;
        });

        net = new WebRtcSession({
          signalingUrl: session.signalingUrl,
          roomId: session.roomId,
          playerId: session.playerId,
          isHost: session.isHost,
          onPacket: handleNetPacket,
          onReady: () => {
            channelReady = true;
            sendHello();
            startHelloRetry();
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

      const loop = (now: number) => {
        if (disposed) {
          return;
        }

        if (lastLoopTime === 0) {
          lastLoopTime = now;
        }
        const dt = Math.min(now - lastLoopTime, 100);
        lastLoopTime = now;

        try {
          if (isSolo) {
            if (audio.needsPull()) {
              audio.drainPull();
            }
            blitIfFrameChanged(soloFrame);
            updateHud(soloFrame);
          } else if (lockstepReady && lockstep) {
            simAccumulator += dt;
            while (simAccumulator >= FRAME_MS) {
              runLockstepTick();
              simAccumulator -= FRAME_MS;
            }
            blitFramebuffer();
            if (now - lastStatusUpdate >= HUD_UPDATE_MS) {
              lastStatusUpdate = now;
              updateSyncStatus?.();
              updateHud(lockstep.getSimulatedFrames());
            }
          } else {
            if (now - lastStatusUpdate >= HUD_UPDATE_MS) {
              lastStatusUpdate = now;
              updateSyncStatus?.();
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "游戏循环错误";
          setStatus(`运行错误 · ${message}`);
          console.error(error);
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
      stopHelloRetry();
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
      <div className="hud">
        <span className="hud__title">{title}</span>
        <span className="hud__status" ref={statusRef}>
          {status}
        </span>
        <div className="hud__actions">
          <button className="ghost" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? "退出全屏" : "全屏"}
          </button>
          <button className="ghost" onClick={() => void runDeterminismCheck()}>
            确定性自检
          </button>
          <button className="secondary" onClick={onLeave}>
            {isSolo ? "返回大厅" : "离开房间"}
          </button>
        </div>
      </div>

      <div className="monitor-slot">
        <div className="monitor" ref={monitorRef}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      <div className="telemetry">
        <span ref={hashRef}>WRAM 0 · 音频 ~0ms</span>
        {determinism ? (
          <span>
            自检 · <b>{determinism}</b>
          </span>
        ) : null}
      </div>
    </div>
  );
}
