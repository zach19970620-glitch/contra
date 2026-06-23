import type { InputPacket } from "./webrtc";

/** 最大回滚窗口（帧） */
export const MAX_ROLLBACK_FRAMES = 16;

type FrameInputs = {
  p1?: number;
  p2?: number;
  p1Confirmed?: boolean;
  p2Confirmed?: boolean;
};

export type StepMeta = {
  /** 是否为回滚重模拟中间帧（不渲染/不推音频） */
  resimulating: boolean;
  /** 本次 resim 的最后一帧 */
  final: boolean;
};

export type RollbackCallbacks = {
  onStep: (frame: number, p1: number, p2: number, meta: StepMeta) => void;
  onSaveState: (frame: number) => void;
  onLoadState: (frame: number) => boolean;
};

export class RollbackSync {
  private readonly localPlayer: 1 | 2;
  private currentFrame = 0;
  private simulatedFrames = 0;
  private rollbacks = 0;
  private lastRemoteInput = 0;
  private readonly inputs = new Map<number, FrameInputs>();
  private callbacks: RollbackCallbacks | null = null;

  constructor(localPlayer: 1 | 2) {
    this.localPlayer = localPlayer;
  }

  setCallbacks(callbacks: RollbackCallbacks) {
    this.callbacks = callbacks;
  }

  reset() {
    this.currentFrame = 0;
    this.simulatedFrames = 0;
    this.rollbacks = 0;
    this.lastRemoteInput = 0;
    this.inputs.clear();
  }

  applyInput(packet: InputPacket) {
    if (packet.playerId === this.localPlayer) {
      return;
    }

    const entry = this.inputs.get(packet.frame) ?? {};
    const key = packet.playerId === 1 ? "p1" : "p2";
    const confirmedKey = packet.playerId === 1 ? "p1Confirmed" : "p2Confirmed";
    const previous = entry[key];

    if (previous === packet.buttons && entry[confirmedKey]) {
      return;
    }

    const mispredicted =
      packet.frame < this.currentFrame &&
      (entry[confirmedKey]
        ? previous !== packet.buttons
        : this.predictRemote(packet.frame) !== packet.buttons);

    entry[key] = packet.buttons;
    entry[confirmedKey] = true;
    this.inputs.set(packet.frame, entry);
    this.lastRemoteInput = packet.buttons;

    if (mispredicted) {
      this.rollbackAndResimulate(packet.frame);
    }
  }

  bootstrap(send: (packet: InputPacket) => void) {
    const packet: InputPacket = {
      kind: "input",
      frame: 0,
      playerId: this.localPlayer,
      buttons: 0,
    };
    this.storeLocalInput(0, 0);
    send(packet);
  }

  isBootstrapComplete() {
    const entry = this.inputs.get(0);
    return entry?.p1 !== undefined && entry?.p2 !== undefined;
  }

  resendBootstrap(send: (packet: InputPacket) => void) {
    const entry = this.inputs.get(0);
    const buttons =
      this.localPlayer === 1 ? entry?.p1 ?? 0 : entry?.p2 ?? 0;
    send({
      kind: "input",
      frame: 0,
      playerId: this.localPlayer,
      buttons,
    });
  }

  tick(localButtons: number, send: (packet: InputPacket) => void) {
    const frame = this.currentFrame;
    this.storeLocalInput(frame, localButtons);
    send({
      kind: "input",
      frame,
      playerId: this.localPlayer,
      buttons: localButtons,
    });
    this.advanceOne(frame, { resimulating: false, final: true });
    this.currentFrame += 1;
  }

  getDebugState() {
    const pending = this.inputs.get(this.currentFrame);
    return {
      frame: this.currentFrame,
      simulated: this.simulatedFrames,
      rollbacks: this.rollbacks,
      hasP1: pending?.p1 !== undefined,
      hasP2: pending?.p2 !== undefined,
      bootstrapComplete: this.isBootstrapComplete(),
      predictedRemote: this.lastRemoteInput,
    };
  }

  private storeLocalInput(frame: number, buttons: number) {
    const entry = this.inputs.get(frame) ?? {};
    if (this.localPlayer === 1) {
      entry.p1 = buttons;
      entry.p1Confirmed = true;
    } else {
      entry.p2 = buttons;
      entry.p2Confirmed = true;
    }
    this.inputs.set(frame, entry);
  }

  private predictRemote(frame: number) {
    const entry = this.inputs.get(frame);
    if (this.localPlayer === 1) {
      if (entry?.p2Confirmed) {
        return entry.p2 ?? 0;
      }
      return this.lastRemoteInput;
    }
    if (entry?.p1Confirmed) {
      return entry.p1 ?? 0;
    }
    return this.lastRemoteInput;
  }

  private resolveInputs(frame: number): { p1: number; p2: number } {
    const entry = this.inputs.get(frame) ?? {};
    const p1 =
      entry.p1 ??
      (this.localPlayer === 1 ? 0 : this.predictRemote(frame));
    const p2 =
      entry.p2 ??
      (this.localPlayer === 2 ? 0 : this.predictRemote(frame));
    return { p1, p2 };
  }

  private advanceOne(frame: number, meta: StepMeta) {
    const { p1, p2 } = this.resolveInputs(frame);
    this.callbacks?.onSaveState(frame);
    this.callbacks?.onStep(frame, p1, p2, meta);
    this.simulatedFrames += 1;
  }

  private rollbackAndResimulate(fromFrame: number) {
    if (!this.callbacks) {
      return;
    }
    if (fromFrame >= this.currentFrame) {
      return;
    }
    if (this.currentFrame - fromFrame > MAX_ROLLBACK_FRAMES) {
      console.warn(`rollback ${this.currentFrame - fromFrame} frames exceeds max`);
      return;
    }

    if (!this.callbacks.onLoadState(fromFrame)) {
      console.warn(`missing snapshot for frame ${fromFrame}`);
      return;
    }

    this.rollbacks += 1;
    const target = this.currentFrame;
    for (let frame = fromFrame; frame < target; frame += 1) {
      const final = frame === target - 1;
      this.advanceOne(frame, { resimulating: true, final });
    }
  }
}
