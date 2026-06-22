import type { SignalMessage } from "./signaling";
import { SignalingClient } from "./signaling";

export type InputPacket = {
  kind: "input";
  frame: number;
  playerId: 1 | 2;
  buttons: number;
};

export type NetPacket =
  | InputPacket
  | { kind: "hello"; playerId: 1 | 2 }
  | { kind: "sync-start"; playerId: 1 | 2 }
  | { kind: "sync-ready"; playerId: 1 | 2 };

export function isInputPacket(packet: NetPacket): packet is InputPacket {
  return packet.kind === "input";
}

export function encodeNetPacket(packet: NetPacket): ArrayBuffer {
  if (packet.kind === "hello") {
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint8(0, 1);
    view.setUint8(1, packet.playerId);
    return buf;
  }
  if (packet.kind === "sync-start") {
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint8(0, 2);
    view.setUint8(1, packet.playerId);
    return buf;
  }
  if (packet.kind === "sync-ready") {
    const buf = new ArrayBuffer(2);
    const view = new DataView(buf);
    view.setUint8(0, 3);
    view.setUint8(1, packet.playerId);
    return buf;
  }
  const buf = new ArrayBuffer(7);
  const view = new DataView(buf);
  view.setUint8(0, 0);
  view.setUint32(1, packet.frame, true);
  view.setUint8(5, packet.playerId);
  view.setUint8(6, packet.buttons);
  return buf;
}

function parseBinaryPacket(raw: ArrayBuffer): NetPacket | null {
  if (raw.byteLength < 2) {
    return null;
  }
  const view = new DataView(raw);
  const kind = view.getUint8(0);
  if (kind === 1 || kind === 2 || kind === 3) {
    const playerId = view.getUint8(1);
    if (playerId !== 1 && playerId !== 2) {
      return null;
    }
    if (kind === 1) {
      return { kind: "hello", playerId };
    }
    if (kind === 2) {
      return { kind: "sync-start", playerId };
    }
    return { kind: "sync-ready", playerId };
  }
  if (kind !== 0 || raw.byteLength < 7) {
    return null;
  }
  const playerId = view.getUint8(5);
  if (playerId !== 1 && playerId !== 2) {
    return null;
  }
  return {
    kind: "input",
    frame: view.getUint32(1, true),
    playerId,
    buttons: view.getUint8(6),
  };
}

export function parseNetPacket(raw: unknown): NetPacket | null {
  if (raw instanceof ArrayBuffer) {
    return parseBinaryPacket(raw);
  }
  return parseJsonPacket(raw);
}

function parseJsonPacket(raw: unknown): NetPacket | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const data = raw as Record<string, unknown>;
  if (data.kind === "hello" || data.kind === "sync-start" || data.kind === "sync-ready") {
    return raw as NetPacket;
  }
  if (data.kind === "input" || typeof data.frame === "number") {
    const playerId = Number(data.playerId);
    if (playerId !== 1 && playerId !== 2) {
      return null;
    }
    return {
      kind: "input",
      frame: Number(data.frame),
      playerId: playerId as 1 | 2,
      buttons: typeof data.buttons === "number" ? data.buttons : 0,
    };
  }
  return null;
}

type PeerEvents = {
  onPacket: (packet: NetPacket) => void;
  onOpen: () => void;
  onClose: () => void;
};

export class WebRtcPeer {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private openNotified = false;
  private readonly events: PeerEvents;

  constructor(events: PeerEvents) {
    this.events = events;
    this.pc = new RTCPeerConnection({
      iceServers: [],
    });
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIce?.(event.candidate.toJSON());
      }
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") {
        this.events.onClose();
      }
    };
  }

  onIce: ((candidate: RTCIceCandidateInit) => void) | null = null;

  createOfferChannel(label: string) {
    this.channel = this.pc.createDataChannel(label, { ordered: true });
    this.bindChannel(this.channel);
  }

  async acceptIncomingChannel() {
    this.pc.ondatachannel = (event) => {
      this.channel = event.channel;
      this.bindChannel(this.channel);
    };
  }

  private bindChannel(channel: RTCDataChannel) {
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      if (this.openNotified) {
        return;
      }
      this.openNotified = true;
      this.events.onOpen();
    };
    channel.onclose = () => this.events.onClose();
    channel.onmessage = (event) => {
      const data = event.data;
      const packet =
        data instanceof ArrayBuffer
          ? parseNetPacket(data)
          : parseNetPacket(JSON.parse(String(data)));
      if (packet) {
        this.events.onPacket(packet);
      }
    };
  }

  send(packet: NetPacket) {
    if (this.channel?.readyState === "open") {
      this.channel.send(encodeNetPacket(packet));
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async applyAnswer(answer: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(answer);
  }

  async addIce(candidate: RTCIceCandidateInit) {
    await this.pc.addIceCandidate(candidate);
  }

  close() {
    this.channel?.close();
    this.pc.close();
  }
}

export class WebRtcSession {
  private signaling: SignalingClient;
  private peer: WebRtcPeer | null = null;
  private readonly roomId: string;
  private readonly playerId: 1 | 2;
  private readonly isHost: boolean;

  constructor(options: {
    signalingUrl: string;
    roomId: string;
    playerId: 1 | 2;
    isHost: boolean;
    onPacket: (packet: NetPacket) => void;
    onReady: () => void;
    onStatus: (status: string) => void;
  }) {
    this.roomId = options.roomId;
    this.playerId = options.playerId;
    this.isHost = options.isHost;
    this.signaling = new SignalingClient();

    this.signaling.connect(options.signalingUrl, async (message) => {
      await this.handleSignal(message, options.onPacket, options.onReady, options.onStatus);
    }).then(() => {
      this.signaling.send({ type: "join", roomId: this.roomId, playerId: this.playerId });
      options.onStatus("已连接信令，等待对手…");
    });
  }

  private async handleSignal(
    message: SignalMessage,
    onPacket: (packet: NetPacket) => void,
    onReady: () => void,
    onStatus: (status: string) => void,
  ) {
    switch (message.type) {
      case "joined":
        onStatus(`房间 ${message.roomId}，在线 ${message.peers}/2`);
        if (this.isHost && message.peers === 2) {
          await this.startAsHost(onPacket, onReady, onStatus);
        }
        break;
      case "peer-joined":
        onStatus("对手已加入，建立 WebRTC…");
        if (this.isHost) {
          await this.startAsHost(onPacket, onReady, onStatus);
        }
        break;
      case "offer":
        if (!this.isHost && message.from === 1) {
          this.peer = new WebRtcPeer({
            onPacket,
            onOpen: onReady,
            onClose: () => onStatus("连接断开"),
          });
          await this.peer.acceptIncomingChannel();
          this.peer.onIce = (candidate) => {
            this.signaling.send({
              type: "ice",
              from: this.playerId,
              candidate,
            });
          };
          const answer = await this.peer.createAnswer(message.sdp);
          this.signaling.send({ type: "answer", from: this.playerId, sdp: answer });
        }
        break;
      case "answer":
        if (this.isHost && message.from === 2) {
          await this.peer?.applyAnswer(message.sdp);
        }
        break;
      case "ice":
        if (message.from !== this.playerId) {
          await this.peer?.addIce(message.candidate);
        }
        break;
      case "error":
        onStatus(message.message);
        break;
      default:
        break;
    }
  }

  private async startAsHost(
    onPacket: (packet: NetPacket) => void,
    onReady: () => void,
    onStatus: (status: string) => void,
  ) {
    if (this.peer) {
      return;
    }
    this.peer = new WebRtcPeer({
      onPacket,
      onOpen: onReady,
      onClose: () => onStatus("连接断开"),
    });
    this.peer.createOfferChannel("inputs");
    this.peer.onIce = (candidate) => {
      this.signaling.send({ type: "ice", from: this.playerId, candidate });
    };
    const offer = await this.peer.createOffer();
    this.signaling.send({ type: "offer", from: this.playerId, sdp: offer });
    onStatus("已发送 WebRTC offer");
  }

  send(packet: NetPacket) {
    this.peer?.send(packet);
  }

  close() {
    this.peer?.close();
    this.signaling.close();
  }
}
