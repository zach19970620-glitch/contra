export class RingBuffer {
  private readonly buffer: Float32Array;
  private readIndex = 0;
  private writeIndex = 0;
  private available = 0;

  constructor(capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

  write(samples: Float32Array) {
    for (let i = 0; i < samples.length; i += 1) {
      this.buffer[this.writeIndex] = samples[i]!;
      this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
      if (this.available < this.buffer.length) {
        this.available += 1;
      } else {
        this.readIndex = (this.readIndex + 1) % this.buffer.length;
      }
    }
  }

  readInto(target: Float32Array): number {
    const count = Math.min(target.length, this.available);
    for (let i = 0; i < count; i += 1) {
      target[i] = this.buffer[this.readIndex]!;
      this.readIndex = (this.readIndex + 1) % this.buffer.length;
    }
    this.available -= count;
    return count;
  }

  availableSamples() {
    return this.available;
  }
}

export class SharedRingBuffer {
  readonly buffer: SharedArrayBuffer;
  readonly samples: Float32Array;
  readonly writeIndex: Int32Array;
  readonly readIndex: Int32Array;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new SharedArrayBuffer(capacity * 4 + 8);
    this.samples = new Float32Array(this.buffer, 0, capacity);
    this.writeIndex = new Int32Array(this.buffer, capacity * 4, 1);
    this.readIndex = new Int32Array(this.buffer, capacity * 4 + 4, 1);
  }

  /** 缓冲满时丢弃最旧样本，避免延迟无限增长 */
  write(source: Float32Array) {
    let write = Atomics.load(this.writeIndex, 0);
    let read = Atomics.load(this.readIndex, 0);
    for (let i = 0; i < source.length; i += 1) {
      const next = (write + 1) % this.capacity;
      if (next === read) {
        read = (read + 1) % this.capacity;
        Atomics.store(this.readIndex, 0, read);
      }
      this.samples[write] = source[i]!;
      write = next;
    }
    Atomics.store(this.writeIndex, 0, write);
  }

  available() {
    const write = Atomics.load(this.writeIndex, 0);
    const read = Atomics.load(this.readIndex, 0);
    return write >= read ? write - read : this.capacity - read + write;
  }

  dropOldest(count: number) {
    if (count <= 0) {
      return;
    }
    const write = Atomics.load(this.writeIndex, 0);
    let read = Atomics.load(this.readIndex, 0);
    const avail = this.available();
    const drop = Math.min(count, avail);
    read = (read + drop) % this.capacity;
    Atomics.store(this.readIndex, 0, read);
    void write;
  }

  clear() {
    Atomics.store(this.writeIndex, 0, 0);
    Atomics.store(this.readIndex, 0, 0);
  }
}
