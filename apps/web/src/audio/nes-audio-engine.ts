import { SharedRingBuffer } from "./ring-buffer";

function workletModuleUrl(): string {
  if (import.meta.env.DEV) {
    return new URL("./nes-audio-processor.ts", import.meta.url).href;
  }
  return `${import.meta.env.BASE_URL}assets/nes-audio-processor.js`;
}

const SAMPLE_RATE = 48_000;
/** ~3 帧音频（60fps），目标播放延迟 */
const TARGET_LATENCY_MS = 50;
/** 超过此值主动丢弃旧样本 */
const MAX_LATENCY_MS = 100;
export const TARGET_LATENCY_SAMPLES = Math.floor((SAMPLE_RATE * TARGET_LATENCY_MS) / 1000);
const MAX_LATENCY_SAMPLES = Math.floor((SAMPLE_RATE * MAX_LATENCY_MS) / 1000);
/** 环形缓冲容量：略高于 max，留 jitter 余量 */
const RING_CAPACITY = MAX_LATENCY_SAMPLES + TARGET_LATENCY_SAMPLES;
/** 单次 pull 回调最多模拟帧数，防止主线程饥饿 */
const MAX_PULL_STEPS = 3;

export type AudioDriveMode = "push" | "pull";

export class NesAudioEngine {
  private context: AudioContext | null = null;
  private ring: SharedRingBuffer | null = null;
  private node: AudioWorkletNode | null = null;
  private pullHandler: (() => void) | null = null;
  private pullEnabled = false;

  async init(mode: AudioDriveMode = "push"): Promise<void> {
    this.pullEnabled = mode === "pull";
    this.context = new AudioContext({
      sampleRate: SAMPLE_RATE,
      latencyHint: "interactive",
    });
    await this.context.audioWorklet.addModule(workletModuleUrl());

    this.ring = new SharedRingBuffer(RING_CAPACITY);
    this.node = new AudioWorkletNode(this.context, "nes-audio-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        sab: this.ring.buffer,
        targetSamples: this.pullEnabled ? TARGET_LATENCY_SAMPLES : 0,
      },
    });

    if (this.pullEnabled) {
      this.node.port.onmessage = (event: MessageEvent<{ type?: string }>) => {
        if (event.data?.type === "pull") {
          this.drainPull();
        }
      };
    }

    this.node.connect(this.context.destination);
    await this.context.resume();
  }

  /** pull 模式：Worklet 缺样本时调用，步进模拟器并 push 音频 */
  setPullHandler(handler: () => void) {
    this.pullHandler = handler;
  }

  isPullMode() {
    return this.pullEnabled;
  }

  /** 缓冲低于目标时步进模拟器，直到达到目标或达到步进上限 */
  drainPull() {
    if (!this.pullEnabled || !this.pullHandler || !this.ring) {
      return;
    }
    let steps = 0;
    while (this.bufferedSamples() < TARGET_LATENCY_SAMPLES && steps < MAX_PULL_STEPS) {
      this.pullHandler();
      steps += 1;
    }
    this.trimToTarget();
  }

  needsPull() {
    return this.pullEnabled && this.bufferedSamples() < TARGET_LATENCY_SAMPLES;
  }

  /** 启动时预填缓冲 */
  prime() {
    this.drainPull();
  }

  pushFrame(samples: Float32Array) {
    if (!this.ring || samples.length === 0) {
      return;
    }
    this.ring.write(samples);
    this.trimToTarget();
  }

  trimToTarget() {
    if (!this.ring) {
      return;
    }
    const buffered = this.bufferedSamples();
    if (buffered > MAX_LATENCY_SAMPLES) {
      this.ring.dropOldest(buffered - TARGET_LATENCY_SAMPLES);
    }
  }

  clear() {
    this.ring?.clear();
  }

  bufferedSamples() {
    return this.ring?.available() ?? 0;
  }

  estimatedLatencyMs() {
    return (this.bufferedSamples() / SAMPLE_RATE) * 1000;
  }

  totalLatencyMs() {
    const ctx = this.context;
    const outputSec =
      ctx !== null ? (ctx.outputLatency ?? 0) + (ctx.baseLatency ?? 0) : 0;
    return this.estimatedLatencyMs() + outputSec * 1000;
  }

  async suspend() {
    await this.context?.suspend();
  }
}
