import { SharedRingBuffer } from "./ring-buffer";

const SAMPLE_RATE = 48_000;
/** ~3 帧音频（60fps），目标播放延迟 */
const TARGET_LATENCY_MS = 50;
/** 超过此值主动丢弃旧样本 */
const MAX_LATENCY_MS = 100;
const TARGET_LATENCY_SAMPLES = Math.floor((SAMPLE_RATE * TARGET_LATENCY_MS) / 1000);
const MAX_LATENCY_SAMPLES = Math.floor((SAMPLE_RATE * MAX_LATENCY_MS) / 1000);
/** 环形缓冲容量：略高于 max，留 jitter 余量 */
const RING_CAPACITY = MAX_LATENCY_SAMPLES + TARGET_LATENCY_SAMPLES;

export class NesAudioEngine {
  private context: AudioContext | null = null;
  private ring: SharedRingBuffer | null = null;

  async init(): Promise<void> {
    this.context = new AudioContext({
      sampleRate: SAMPLE_RATE,
      latencyHint: "interactive",
    });
    await this.context.audioWorklet.addModule(
      new URL("./nes-audio-processor.ts", import.meta.url),
    );

    this.ring = new SharedRingBuffer(RING_CAPACITY);
    const node = new AudioWorkletNode(this.context, "nes-audio-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        sab: this.ring.buffer,
      },
    });
    node.connect(this.context.destination);
    await this.context.resume();
  }

  pushFrame(samples: Float32Array) {
    if (!this.ring || samples.length === 0) {
      return;
    }
    this.ring.write(samples);
    this.trimToTarget();
  }

  /** 丢弃多余缓冲，把延迟压在 MAX 以下 */
  trimToTarget() {
    if (!this.ring) {
      return;
    }
    const buffered = this.ring.available();
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

  async suspend() {
    await this.context?.suspend();
  }
}
