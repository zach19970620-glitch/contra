export type SignalMessage =
  | { type: "join"; roomId: string; playerId: 1 | 2 }
  | { type: "joined"; roomId: string; playerId: 1 | 2; peers: number }
  | { type: "peer-joined"; playerId: 1 | 2 }
  | { type: "offer"; from: 1 | 2; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: 1 | 2; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: 1 | 2; candidate: RTCIceCandidateInit }
  | { type: "error"; message: string };

type Handler = (message: SignalMessage) => void;

export class SignalingClient {
  private socket: WebSocket | null = null;
  private handler: Handler | null = null;

  connect(url: string, onMessage: Handler): Promise<void> {
    return new Promise((resolve, reject) => {
      this.handler = onMessage;
      this.socket = new WebSocket(url);
      this.socket.onopen = () => resolve();
      this.socket.onerror = () => reject(new Error("信令连接失败"));
      this.socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as SignalMessage;
        this.handler?.(message);
      };
    });
  }

  send(message: SignalMessage) {
    this.socket?.send(JSON.stringify(message));
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}
