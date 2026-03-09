const { Server } = require("socket.io");

const io = new Server(4000, {
  cors: {
    origin: "*",
  },
});

const rooms = {};

io.on("connection", (socket) => {
  const wallet = socket.handshake.query.wallet || "unknown";
  console.log(`Player connected: ${wallet} (${socket.id})`);

  // Handle room creation
  socket.on("create-room", (data) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
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
    if (room && room.players.length < 4) {
      const colors = ["red", "blue", "green", "yellow"];
      const color = colors[room.players.length];
      const newPlayer = { wallet, color, isHost: false, isBot: false };
      room.players.push(newPlayer);
      socket.join(code);
      socket.roomId = code;

      // Broadcast to existing players
      socket.to(code).emit("player-joined", { wallet, color });
      console.log(`${wallet} joined room ${code} as ${color}`);

      // Auto-start game if 2 players are present (simplification for demo)
      if (room.players.length >= 2) {
        console.log(`Starting game in room ${code}`);
        io.to(code).emit("game-start", { players: room.players });
      }
    }
  });

  socket.on("join-queue", (data) => {
    // Mock join queue by creating a random room and automatically starting
    console.log(`${wallet} joined queue`);
    const code = "QUEUE";
    if (!rooms[code]) {
      rooms[code] = { id: code, code, host: wallet, players: [{ wallet, color: "red", isHost: true, isBot: false }] };
      socket.join(code);
      socket.roomId = code;
      socket.emit("room-created", { roomId: code, code });
    } else {
      const room = rooms[code];
      const colors = ["red", "blue", "green", "yellow"];
      const color = colors[room.players.length];
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
      console.log(`[${socket.roomId}] ${wallet} moved token ${data.tokenId} by ${data.steps}`);
      // Inform others of the move
      socket.to(socket.roomId).emit("move-token", { player: wallet, tokenId: data.tokenId, steps: data.steps });

      // End the turn automatically after a short delay to keep the game flowing
      setTimeout(() => {
        io.to(socket.roomId).emit("turn-end", {});
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
  });
});

console.log("Mock LudoChain WebSocket Server running on port 4000...");
