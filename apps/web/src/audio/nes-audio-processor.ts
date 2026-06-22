// @ts-nocheck

class NesAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const sab = options.processorOptions.sab;
    this.capacity = (sab.byteLength - 8) / 4;
    this.samples = new Float32Array(sab, 0, this.capacity);
    this.writeIndex = new Int32Array(sab, this.capacity * 4, 1);
    this.readIndex = new Int32Array(sab, this.capacity * 4 + 4, 1);
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) {
      return true;
    }

    let write = Atomics.load(this.writeIndex, 0);
    let read = Atomics.load(this.readIndex, 0);

    for (let i = 0; i < output.length; i += 1) {
      if (read === write) {
        output[i] = 0;
        continue;
      }
      output[i] = this.samples[read] ?? 0;
      read = (read + 1) % this.capacity;
    }

    Atomics.store(this.readIndex, 0, read);
    return true;
  }
}

registerProcessor("nes-audio-processor", NesAudioProcessor);
