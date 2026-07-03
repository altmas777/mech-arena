const { Server } = require('socket.io');
const crypto = require('crypto');

let io;
// rooms: { [code]: { p1: { socket, data }, p2: { socket, data } } }
const rooms = {};

function setupSockets(server) {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Connected: ${socket.id}`);

    // ── LOBBY: Create a room ──────────────────────────────────────────────────
    socket.on('createRoom', (fighterData) => {
      const code = crypto.randomBytes(3).toString('hex').toUpperCase();
      rooms[code] = {
        p1: { socket, data: fighterData },
        p2: null,
        code
      };
      socket.join(code);
      socket.roomCode = code;
      socket.role     = 'p1';
      socket.emit('roomCreated', { code });
      console.log(`[SOCKET] Room created: ${code}`);
    });

    // ── LOBBY: Join a room ───────────────────────────────────────────────────
    socket.on('joinRoom', ({ code, fighterData }) => {
      code = code.toUpperCase();
      const room = rooms[code];

      if (!room) {
        socket.emit('joinError', 'Room not found. Check your code.');
        return;
      }
      if (room.p2) {
        socket.emit('joinError', 'Room is already full.');
        return;
      }

      room.p2 = { socket, data: fighterData };
      socket.join(code);
      socket.roomCode = code;
      socket.role     = 'p2';

      // Tell host: opponent joined
      room.p1.socket.emit('matchFound', {
        role:            'p1',
        opponentFighter: fighterData,
        roomId:          code,
      });

      // Tell joiner: match found
      socket.emit('matchFound', {
        role:            'p2',
        opponentFighter: room.p1.data,
        roomId:          code,
      });

      console.log(`[SOCKET] Match started in room ${code}`);
    });

    // ── GAME: Player rejoins after page navigation ────────────────────────────
    socket.on('rejoinRoom', ({ roomId, role, fighterData }) => {
      let room = rooms[roomId];
      if (!room) {
        room = { p1: null, p2: null, code: roomId };
        rooms[roomId] = room;
      }

      // Update socket reference and data
      if (role === 'p1') {
        room.p1 = { socket, data: fighterData };
      } else {
        room.p2 = { socket, data: fighterData };
      }

      socket.join(roomId);
      socket.roomCode = roomId;
      socket.role     = role;
      console.log(`[SOCKET] ${role} rejoined room ${roomId}`);
    });

    // ── GAME: Real-time position + state sync ────────────────────────────────
    socket.on('opponentUpdate', ({ roomId, update }) => {
      if (roomId) {
        // Broadcast to everyone in the room except sender
        socket.to(roomId).emit('opponentUpdate', update);
      }
    });

    socket.on('hitOpponent', ({ roomId, dmg, attackState }) => {
      if (roomId) {
        socket.to(roomId).emit('opponentHitMe', { dmg, attackState });
      }
    });

    // ── GAME: Rematch request ────────────────────────────────────────────────
    socket.on('rematchRequested', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;

      const isP1 = room.p1?.socket === socket;
      if (isP1) { room.p1Rematch = true; }
      else       { room.p2Rematch = true; }

      console.log(`[SOCKET] Rematch request in ${roomId} — P1:${!!room.p1Rematch} P2:${!!room.p2Rematch}`);

      if (room.p1Rematch && room.p2Rematch) {
        room.p1Rematch = false;
        room.p2Rematch = false;
        io.to(roomId).emit('rematchAccepted');
        console.log(`[SOCKET] Rematch accepted in room ${roomId}`);
      }
    });

    // ── GAME: Explicit exit ──────────────────────────────────────────────────
    socket.on('exitMatch', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;
      const isP1 = room.p1?.socket === socket;
      if (isP1 && room.p2?.socket) room.p2.socket.emit('opponentDisconnected');
      if (!isP1 && room.p1?.socket) room.p1.socket.emit('opponentDisconnected');
      delete rooms[roomId];
      console.log(`[SOCKET] Room ${roomId} closed — player exited voluntarily`);
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Disconnected: ${socket.id}`);
      const code = socket.roomCode;
      if (!code || !rooms[code]) return;

      const room = rooms[code];
      const isP1 = room.p1?.socket === socket;
      const isP2 = room.p2?.socket === socket;
      
      if (isP1) room.p1.socket = null;
      if (isP2) room.p2.socket = null;

      // Allow 5 seconds for page transition (lobby -> game)
      setTimeout(() => {
        const currentRoom = rooms[code];
        if (currentRoom) {
          const p1Gone = currentRoom.p1 && !currentRoom.p1.socket;
          const p2Gone = currentRoom.p2 && !currentRoom.p2.socket;
          
          if (p1Gone || p2Gone) {
             if (p1Gone && currentRoom.p2?.socket) currentRoom.p2.socket.emit('opponentDisconnected');
             if (p2Gone && currentRoom.p1?.socket) currentRoom.p1.socket.emit('opponentDisconnected');
             delete rooms[code];
             console.log(`[SOCKET] Room ${code} closed due to disconnect timeout`);
          }
        }
      }, 5000);
    });
  });
}

module.exports = { setupSockets };
