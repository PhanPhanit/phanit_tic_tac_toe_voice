const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const rooms = new Map();

function makeCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function publicState(room) {
  return {
    board: room.board,
    currentPlayer: room.currentPlayer,
    winner: room.winner,
    winningLine: room.winningLine || [],
    lastMove: room.lastMove || null,
    boardSize: room.boardSize,
    connectCount: room.connectCount,
    players: room.players.map(p => ({ symbol: p.symbol, name: p.name })),
    roomCode: room.code
  };
}
function sendState(room) {
  io.to(room.code).emit("game-state", publicState(room));
}
function checkWinner(board, size, connect) {
  const directions = [[0,1], [1,0], [1,1], [1,-1]];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const symbol = board[r * size + c];
      if (!symbol) continue;
      for (const [dr, dc] of directions) {
        const endR = r + (connect - 1) * dr;
        const endC = c + (connect - 1) * dc;
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
        const line = [];
        for (let step = 0; step < connect; step++) {
          line.push((r + step * dr) * size + (c + step * dc));
        }
        if (line.every(index => board[index] === symbol)) {
          return { winner: symbol, winningLine: line };
        }
      }
    }
  }
  return board.every(Boolean) ? { winner: "draw", winningLine: [] } : null;
}

io.on("connection", socket => {
  socket.on("create-room", ({ name, boardSize, connectCount } = {}, reply = () => {}) => {
    boardSize = Number(boardSize);
    connectCount = Number(connectCount);
    if (!Number.isInteger(boardSize) || boardSize < 3 || boardSize > 15 ||
        !Number.isInteger(connectCount) || connectCount < 3 || connectCount > boardSize) {
      return reply({ ok: false, error: "Choose a board from 3–15 and a connect target from 3 up to the board size." });
    }
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const room = {
      code, boardSize, connectCount, board: Array(boardSize * boardSize).fill(null),
      currentPlayer: "X", winner: null, winningLine: [], lastMove: null,
      players: [{ id: socket.id, symbol: "X", name: (name || "Player 1").slice(0, 20) }]
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.symbol = "X";
    reply({ ok: true, code, symbol: "X" });
    sendState(room);
  });

  socket.on("join-room", ({ code, name } = {}, reply = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return reply({ ok: false, error: "Room not found. Check the code." });
    if (room.players.length >= 2) return reply({ ok: false, error: "This room already has two players." });
    if (room.players.some(p => p.id === socket.id)) return reply({ ok: false, error: "You are already in this room." });

    room.players.push({ id: socket.id, symbol: "O", name: (name || "Player 2").slice(0, 20) });
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.symbol = "O";
    reply({ ok: true, code, symbol: "O" });
    sendState(room);
    socket.to(code).emit("opponent-joined");
  });

  socket.on("make-move", ({ index } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.players.length !== 2 || room.winner) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.symbol !== room.currentPlayer) return;
    if (!Number.isInteger(index) || index < 0 || index >= room.board.length || room.board[index]) return;
    room.board[index] = player.symbol;
    room.lastMove = { index, symbol: player.symbol, moveNumber: (room.lastMove?.moveNumber || 0) + 1 };
    const result = checkWinner(room.board, room.boardSize, room.connectCount);
    room.winner = result?.winner || null;
    room.winningLine = result?.winningLine || [];
    if (!room.winner) room.currentPlayer = player.symbol === "X" ? "O" : "X";
    sendState(room);
  });

  socket.on("restart-game", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.players.some(p => p.id === socket.id)) return;
    room.board = Array(room.boardSize * room.boardSize).fill(null);
    room.currentPlayer = "X";
    room.winner = null;
    room.winningLine = [];
    room.lastMove = null;
    sendState(room);
  });

  // Relay WebRTC signaling messages only to the other person in this room.
  for (const event of ["webrtc-offer", "webrtc-answer", "webrtc-ice"]) {
    socket.on(event, payload => {
      const room = rooms.get(socket.data.roomCode);
      if (!room || room.players.length !== 2) return;
      socket.to(room.code).emit(event, payload);
    });
  }
  socket.on("voice-ready", () => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.find(p => p.id === socket.id);
    if (!room || !player || room.players.length !== 2) return;
    player.voiceReady = true;
    socket.to(room.code).emit("voice-ready");
    if (room.players.every(p => p.voiceReady)) io.to(room.code).emit("both-voice-ready");
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.to(code).emit("opponent-left");
    if (room.players.length === 0) rooms.delete(code);
    else {
      room.board = Array(room.boardSize * room.boardSize).fill(null);
      room.currentPlayer = "X";
      room.winner = null;
      room.winningLine = [];
      room.lastMove = null;
      room.players.forEach(p => { p.voiceReady = false; });
      sendState(room);
    }
  });
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
