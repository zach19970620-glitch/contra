import type { InputPacket } from "./webrtc";

/** 提前 1 帧提交输入，兼顾延迟与管道复杂度 */
const INPUT_DELAY = 1;

type FrameInputs = {
  p1?: number;
  p2?: number;
};

export class LockstepSync {
  private readonly localPlayer: 1 | 2;
  private currentFrame = 0;
  private simulatedFrames = 0;
  private readonly frames = new Map<number, FrameInputs>();
  private onStep: ((frame: number, p1: number, p2: number) => void) | null = null;

  constructor(localPlayer: 1 | 2) {
    this.localPlayer = localPlayer;
  }

  setStepHandler(handler: (frame: number, p1: number, p2: number) => void) {
    this.onStep = handler;
  }

  reset() {
    this.currentFrame = 0;
    this.simulatedFrames = 0;
    this.frames.clear();
  }

  applyInput(packet: InputPacket) {
    const entry = this.frames.get(packet.frame) ?? {};
    if (packet.playerId === 1) {
      entry.p1 = packet.buttons;
    } else {
      entry.p2 = packet.buttons;
    }
    this.frames.set(packet.frame, entry);
  }

  /** 为 delay 管道预填本机玩家在 frame 0..delay-1 的空输入 */
  bootstrap(send: (packet: InputPacket) => void) {
    for (let frame = 0; frame < INPUT_DELAY; frame += 1) {
      const packet: InputPacket = {
        kind: "input",
        frame,
        playerId: this.localPlayer,
        buttons: 0,
      };
      this.applyInput(packet);
      send(packet);
    }
  }

  isBootstrapComplete() {
    for (let frame = 0; frame < INPUT_DELAY; frame += 1) {
      const entry = this.frames.get(frame);
      if (entry?.p1 === undefined || entry?.p2 === undefined) {
        return false;
      }
    }
    return true;
  }

  /** 重发本机在 delay 管道内的输入，丢包后帮助对手恢复 */
  resendBootstrap(send: (packet: InputPacket) => void) {
    for (let frame = 0; frame < INPUT_DELAY; frame += 1) {
      const entry = this.frames.get(frame);
      const buttons =
        this.localPlayer === 1 ? entry?.p1 ?? 0 : entry?.p2 ?? 0;
      send({
        kind: "input",
        frame,
        playerId: this.localPlayer,
        buttons,
      });
    }
  }

  tick(localButtons: number, send: (packet: InputPacket) => void) {
    const submitFrame = this.currentFrame + INPUT_DELAY;
    const packet: InputPacket = {
      kind: "input",
      frame: submitFrame,
      playerId: this.localPlayer,
      buttons: localButtons,
    };
    this.applyInput(packet);
    send(packet);
    return this.tryAdvance();
  }

  tryAdvance() {
    const entry = this.frames.get(this.currentFrame);
    if (!entry || entry.p1 === undefined || entry.p2 === undefined) {
      return false;
    }
    this.onStep?.(this.currentFrame, entry.p1, entry.p2);
    this.frames.delete(this.currentFrame);
    this.currentFrame += 1;
    this.simulatedFrames += 1;
    return true;
  }

  getFrame() {
    return this.currentFrame;
  }

  getSimulatedFrames() {
    return this.simulatedFrames;
  }

  getDebugState() {
    const pending = this.frames.get(this.currentFrame);
    return {
      frame: this.currentFrame,
      simulated: this.simulatedFrames,
      hasP1: pending?.p1 !== undefined,
      hasP2: pending?.p2 !== undefined,
      queued: this.frames.size,
      bootstrapComplete: this.isBootstrapComplete(),
    };
  }
}
