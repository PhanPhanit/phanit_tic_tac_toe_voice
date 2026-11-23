const socket = io();
const $ = id => document.getElementById(id);
let mySymbol = null, currentRoom = null, gameState = null;
let localStream = null, peer = null, remoteStream = null, voiceReady = false;
let cells = [...document.querySelectorAll(".cell")];
let lastSeenMoveNumber = 0, opponentFlashTimer = null;

const lobby = $("lobby"), game = $("game"), boardElement = $("board");

function showLobby(message = "") {
  cleanupVoice(); currentRoom = null; mySymbol = null;
  lobby.classList.remove("hidden"); game.classList.add("hidden");
  $("lobbyMessage").textContent = message;
}
function enterGame(result) {
  currentRoom = result.code; mySymbol = result.symbol;
  $("roomCode").textContent = currentRoom; lastSeenMoveNumber = 0;
  lobby.classList.add("hidden"); game.classList.remove("hidden");
  $("voiceBtn").disabled = false; render();
}
function buildBoard(count) {
  boardElement.innerHTML = ""; cells = [];
  for (let i=0; i<count; i++) {
    const cell = document.createElement("button");
    cell.className = "cell"; cell.dataset.index = i;
    cell.addEventListener("click", () => socket.emit("make-move", {index:i}));
    boardElement.appendChild(cell); cells.push(cell);
  }
}
function render() {
  if (!gameState) return;
  const opponent = gameState.players.find(p => p.symbol !== mySymbol);
  $("nameX").textContent = gameState.players.find(p => p.symbol === "X")?.name || "Waiting...";
  $("nameO").textContent = gameState.players.find(p => p.symbol === "O")?.name || "Waiting...";
  $("playerX").classList.toggle("active", gameState.currentPlayer === "X" && !gameState.winner);
  $("playerO").classList.toggle("active", gameState.currentPlayer === "O" && !gameState.winner);

  if (gameState.winner === "draw") $("status").textContent = "It's a draw!";
  else if (gameState.winner) $("status").textContent = `${gameState.winner} wins!`;
  else if (gameState.players.length < 2) $("status").textContent = "Waiting for another player to join...";
  else $("status").textContent = gameState.currentPlayer === mySymbol ? "Your turn!" : `${opponent?.name || "Opponent"}'s turn`;

  const size = gameState.boardSize || 3;
  if (cells.length !== gameState.board.length) buildBoard(gameState.board.length);
  boardElement.style.setProperty("--board-size", size);
  boardElement.style.width = `min(100%, ${Math.min(440, size * 58)}px)`;

  cells.forEach((cell, i) => {
    const value = gameState.board[i];
    cell.textContent = value || "";
    cell.className = "cell" + (value ? ` ${value === "X" ? "xmark" : "omark"}` : "");
    if ((gameState.winningLine || []).includes(i)) cell.classList.add("winning");
    cell.disabled = !value ? (gameState.players.length < 2 || !!gameState.winner || gameState.currentPlayer !== mySymbol) : true;
  });

  const move = gameState.lastMove;
  if (move && move.moveNumber !== lastSeenMoveNumber) {
    lastSeenMoveNumber = move.moveNumber;
    if (move.symbol !== mySymbol && cells[move.index] && !gameState.winner) {
      if (opponentFlashTimer) clearTimeout(opponentFlashTimer);
      const markedCell = cells[move.index];
      markedCell.classList.add("last-opponent");
      opponentFlashTimer = setTimeout(() => markedCell.classList.remove("last-opponent"), 1150);
    }
  }
}
socket.on("game-state", state => { gameState = state; render(); });
socket.on("opponent-joined", () => $("voiceStatus").textContent = "Opponent joined. Both players can enable voice.");
socket.on("opponent-left", () => {
  $("voiceStatus").textContent = "Opponent disconnected."; cleanupVoice();
});

$("createBtn").onclick = () => {
  socket.emit("create-room", {
    name: $("playerName").value.trim() || "Player 1",
    boardSize: Number($("boardSize").value),
    connectCount: Number($("connectCount").value)
  }, result => {
    if (result.ok) enterGame(result); else $("lobbyMessage").textContent = result.error;
  });
};
$("boardSize").addEventListener("change", () => {
  const size = Number($("boardSize").value);
  [...$("connectCount").options].forEach(option => option.disabled = Number(option.value) > size);
  if (Number($("connectCount").value) > size) $("connectCount").value = String(Math.min(5, size));
});
$("joinBtn").onclick = () => socket.emit("join-room", {
  code: $("roomInput").value, name: $("playerName").value.trim() || "Player 2"
}, result => {
  if (result.ok) enterGame(result); else $("lobbyMessage").textContent = result.error;
});
$("copyBtn").onclick = async () => {
  try { await navigator.clipboard.writeText(currentRoom); $("copyBtn").textContent = "Copied!"; }
  catch { $("copyBtn").textContent = currentRoom; }
  setTimeout(() => $("copyBtn").textContent = "Copy code", 1600);
};
$("rematchBtn").onclick = () => socket.emit("restart-game");
$("leaveBtn").onclick = () => {
  socket.disconnect(); cleanupVoice(); gameState = null; showLobby(); socket.connect();
};

async function ensurePeer() {
  if (peer) return peer;
  peer = new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  remoteStream = new MediaStream(); $("remoteAudio").srcObject = remoteStream;
  peer.ontrack = event => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    $("remoteAudio").play().catch(() => {}); $("voiceStatus").textContent = "Voice connected.";
  };
  peer.onicecandidate = event => { if (event.candidate) socket.emit("webrtc-ice", event.candidate); };
  peer.onconnectionstatechange = () => {
    if (peer && ["failed","disconnected","closed"].includes(peer.connectionState))
      $("voiceStatus").textContent = "Voice connection interrupted.";
  };
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
  return peer;
}
$("voiceBtn").onclick = async () => {
  try {
    if (!gameState || gameState.players.length !== 2) return $("voiceStatus").textContent = "Wait until the second player joins.";
    if (!localStream) localStream = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    voiceReady = true; $("voiceBtn").disabled = true; $("muteBtn").disabled = false;
    $("voiceStatus").textContent = "Microphone ready. Waiting for the other player...";
    socket.emit("voice-ready");
  } catch { $("voiceStatus").textContent = "Microphone permission was denied or unavailable."; }
};
socket.on("both-voice-ready", async () => {
  if (mySymbol !== "X" || !localStream) return;
  try {
    const pc = await ensurePeer(), offer = await pc.createOffer();
    await pc.setLocalDescription(offer); socket.emit("webrtc-offer", offer);
    $("voiceStatus").textContent = "Calling opponent...";
  } catch { $("voiceStatus").textContent = "Could not start voice connection."; }
});
socket.on("webrtc-offer", async offer => {
  try {
    if (!localStream) return;
    const pc = await ensurePeer(); await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
    socket.emit("webrtc-answer", answer);
  } catch { $("voiceStatus").textContent = "Could not answer voice call."; }
});
socket.on("webrtc-answer", async answer => { if (peer) await peer.setRemoteDescription(answer); });
socket.on("webrtc-ice", async candidate => {
  if (peer) { try { await peer.addIceCandidate(candidate); } catch (err) { console.warn(err); } }
});
$("muteBtn").onclick = () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0]; track.enabled = !track.enabled;
  $("muteBtn").textContent = track.enabled ? "Mute" : "Unmute";
};
function cleanupVoice() {
  if (peer) { peer.close(); peer = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  remoteStream = null; voiceReady = false; $("remoteAudio").srcObject = null;
  $("voiceBtn").disabled = !currentRoom; $("muteBtn").disabled = true; $("muteBtn").textContent = "Mute";
  $("voiceStatus").textContent = "Join with a second player to talk.";
}
