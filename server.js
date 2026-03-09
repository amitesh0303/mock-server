const { Server } = require("socket.io");
const crypto = require("crypto");

// Use PORT from environment (for Render) or fallback to 4000 locally
const PORT = process.env.PORT || 4000;

const io = new Server(PORT, {
  cors: {
    origin: "*", // Allow connections from the mobile app
  },
});

const rooms = {};
const COLORS = ["red", "blue", "green", "yellow"];

// Generate a cryptographically secure 6-character uppercase room code
function generateRoomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

io.on("connection", (socket) => {
  const wallet = socket.handshake.query.wallet || "unknown";
  console.log(`Player connected: ${wallet} (${socket.id})`);

  // Handle room creation
  socket.on("create-room", (data) => {
    const code = generateRoomCode();
    rooms[code] = {
      id: code,
      code,
      host: wallet,
      players: [{ wallet, color: "red", isHost: true, isBot: false }],
    };
    socket.join(code);
    socket.roomId = code;
    socket.emit("room-created", { roomId: code, code });
    console.log(`Room created: ${code} by ${wallet}`);
  });

  // Handle joining a room
  socket.on("join-room", (data) => {
    const { code } = data;
    const room = rooms[code];
    if (!room) {
      socket.emit("join-error", { message: "Room not found" });
      return;
    }
    if (room.players.length >= 4) {
      socket.emit("join-error", { message: "Room is full" });
      return;
    }
    const color = COLORS[room.players.length];
    const newPlayer = { wallet, color, isHost: false, isBot: false };
    room.players.push(newPlayer);
    socket.join(code);
    socket.roomId = code;
    // Broadcast to existing players
    socket.to(code).emit("player-joined", { wallet, color });
    console.log(`${wallet} joined room ${code} as ${color}`);
    // Auto-start game if 2 players are present
    if (room.players.length >= 2) {
      console.log(`Starting game in room ${code}`);
      io.to(code).emit("game-start", { players: room.players });
    }
  });

  // Handle matchmaking queue
  socket.on("join-queue", (data) => {
    console.log(`${wallet} joined queue`);
    const code = "QUEUE";
    if (!rooms[code]) {
      rooms[code] = { id: code, code, host: wallet, players: [{ wallet, color: "red", isHost: true, isBot: false }] };
      socket.join(code);
      socket.roomId = code;
      socket.emit("room-created", { roomId: code, code });
    } else {
      const room = rooms[code];
      const color = COLORS[room.players.length];
      const newPlayer = { wallet, color, isHost: false, isBot: false };
      room.players.push(newPlayer);
      socket.join(code);
      socket.roomId = code;
      socket.to(code).emit("player-joined", { wallet, color });

      if (room.players.length >= 2) {
        io.to(code).emit("game-start", { players: room.players });
        delete rooms[code]; // Reset queue room
      }
    }
  });

  // Handle dice rolling
  socket.on("roll-dice", (data) => {
    if (socket.roomId) {
      console.log(`[${socket.roomId}] ${wallet} rolled ${data.value}`);
      socket.to(socket.roomId).emit("roll-dice", { player: wallet, value: data.value });
    }
  });

  // Handle token moving
  socket.on("move-token", (data) => {
    if (socket.roomId) {
      const roomId = socket.roomId;
      console.log(`[${roomId}] ${wallet} moved token ${data.tokenId} by ${data.steps}`);
      socket.to(roomId).emit("move-token", { player: wallet, tokenId: data.tokenId, steps: data.steps });
      // End turn automatically after a short delay
      setTimeout(() => {
        io.to(roomId).emit("turn-end", {});
      }, 500);
    }
  });

  // Handle chat
  socket.on("chat-message", (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("chat-message", { from: wallet, message: data.message });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].players = rooms[roomId].players.filter((p) => p.wallet !== wallet);
      if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

console.log(`Mock SoLudo WebSocket Server running on port ${PORT}...`);
