import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

type PlayerId = 1 | 2;

type Client = {
  ws: WebSocket;
  roomId: string;
  playerId: PlayerId;
};

type Room = {
  clients: Map<PlayerId, Client>;
};

const PORT = Number(process.env.PORT ?? 8080);
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.resolve(rootDir, "../../../certs");
const certPath = path.join(certDir, "cert.pem");
const keyPath = path.join(certDir, "key.pem");
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = { clients: new Map() };
    rooms.set(roomId, room);
  }
  return room;
}

function send(ws: WebSocket, payload: unknown) {
  ws.send(JSON.stringify(payload));
}

function broadcast(room: Room, payload: unknown, except?: PlayerId) {
  for (const [playerId, client] of room.clients) {
    if (except !== undefined && playerId === except) {
      continue;
    }
    send(client.ws, payload);
  }
}

function attachServer(server: https.Server | import("node:http").Server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    let joined: Client | null = null;

    ws.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as {
        type: string;
        roomId?: string;
        playerId?: PlayerId;
        from?: PlayerId;
        sdp?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      };

      if (message.type === "join") {
        if (!message.roomId || !message.playerId) {
          send(ws, { type: "error", message: "join 参数无效" });
          return;
        }

        const room = getRoom(message.roomId);
        if (room.clients.has(message.playerId)) {
          send(ws, { type: "error", message: `P${message.playerId} 已在房间中` });
          return;
        }

        joined = { ws, roomId: message.roomId, playerId: message.playerId };
        room.clients.set(message.playerId, joined);

        send(ws, {
          type: "joined",
          roomId: message.roomId,
          playerId: message.playerId,
          peers: room.clients.size,
        });

        broadcast(room, { type: "peer-joined", playerId: message.playerId }, message.playerId);
        return;
      }

      if (!joined) {
        send(ws, { type: "error", message: "尚未 join" });
        return;
      }

      const room = getRoom(joined.roomId);
      if (message.type === "offer" || message.type === "answer" || message.type === "ice") {
        broadcast(room, message, joined.playerId);
      }
    });

    ws.on("close", () => {
      if (!joined) {
        return;
      }
      const room = rooms.get(joined.roomId);
      room?.clients.delete(joined.playerId);
      if (room && room.clients.size === 0) {
        rooms.delete(joined.roomId);
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    const scheme = hasCerts ? "wss" : "ws";
    console.log(`[signaling] ${scheme}://0.0.0.0:${PORT}`);
  });
}

if (hasCerts) {
  const server = https.createServer({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  });
  attachServer(server);
} else {
  const { createServer } = await import("node:http");
  attachServer(createServer());
}
