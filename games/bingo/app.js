import {
  applyAction,
  createGame,
  getBotMove,
  checkBingo,
  COLUMNS,
  COLUMN_RANGES,
  getColumnLetter,
} from "./game.js";

// ================================================
// DOM References
// ================================================
const ui = {
  connectionStatus: document.getElementById("connectionStatus"),
  setupPanel: document.getElementById("setupPanel"),
  localSetup: document.getElementById("localSetup"),
  onlineSetup: document.getElementById("onlineSetup"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  playerMinus: document.getElementById("playerMinus"),
  playerPlus: document.getElementById("playerPlus"),
  playerCount: document.getElementById("playerCount"),
  speedMinus: document.getElementById("speedMinus"),
  speedPlus: document.getElementById("speedPlus"),
  callSpeed: document.getElementById("callSpeed"),
  localSpectator: document.getElementById("localSpectator"),
  startLocal: document.getElementById("startLocal"),
  onlineName: document.getElementById("onlineName"),
  serverUrl: document.getElementById("serverUrl"),
  roomCode: document.getElementById("roomCode"),
  createRoom: document.getElementById("createRoom"),
  joinRoom: document.getElementById("joinRoom"),
  onlineLobby: document.getElementById("onlineLobby"),
  lobbyPlayers: document.getElementById("lobbyPlayers"),
  roomDisplay: document.getElementById("roomDisplay"),
  copyRoom: document.getElementById("copyRoom"),
  shareLan: document.getElementById("shareLan"),
  addBot: document.getElementById("addBot"),
  startOnline: document.getElementById("startOnline"),
  leaveRoom: document.getElementById("leaveRoom"),
  hostHint: document.getElementById("hostHint"),
  gamePanel: document.getElementById("gamePanel"),
  gameStatus: document.getElementById("gameStatus"),
  gameHint: document.getElementById("gameHint"),
  callNumberBtn: document.getElementById("callNumberBtn"),
  claimBingoBtn: document.getElementById("claimBingoBtn"),
  restartBtn: document.getElementById("restartBtn"),
  currentBall: document.getElementById("currentBall"),
  ballLetter: document.getElementById("ballLetter"),
  ballNumber: document.getElementById("ballNumber"),
  numbersRemaining: document.getElementById("numbersRemaining"),
  cardLabel: document.getElementById("cardLabel"),
  bingoCard: document.getElementById("bingoCard"),
  calledCount: document.getElementById("calledCount"),
  calledGrid: document.getElementById("calledGrid"),
  playersList: document.getElementById("playersList"),
  logEntries: document.getElementById("logEntries"),
  toast: document.getElementById("toast"),
  winnerBanner: document.getElementById("winnerBanner"),
  winnerName: document.getElementById("winnerName"),
  winnerDetail: document.getElementById("winnerDetail"),
  winnerNewGame: document.getElementById("winnerNewGame"),
};

// ================================================
// State
// ================================================
let mode = "local";
let localState = null;
let onlineState = null;
let myPlayerId = null;
let socket = null;
let roomCode = null;
let isHost = false;
let noticeTimeout = null;
let autoCallTimer = null;
let autoCallSpeed = 3; // seconds
let lastCurrentNumber = null;

// ================================================
// Utilities
// ================================================
function showNotice(message) {
  if (noticeTimeout) clearTimeout(noticeTimeout);
  ui.toast.textContent = message;
  ui.toast.classList.add("visible");
  noticeTimeout = setTimeout(() => {
    noticeTimeout = null;
    ui.toast.classList.remove("visible");
  }, 2500);
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function setStatus(text) {
  ui.connectionStatus.textContent = text;
}

function currentState() {
  return mode === "online" ? onlineState : localState;
}

function currentViewingPlayerId() {
  const state = currentState();
  if (!state) return null;
  if (mode === "online") return myPlayerId;
  const human = state.players.find((p) => !p.isBot);
  return human ? human.id : null;
}

// ================================================
// Mode Switching
// ================================================
function setMode(nextMode) {
  mode = nextMode;
  ui.modeButtons.forEach((button) => {
    const active = button.dataset.mode === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  ui.localSetup.classList.toggle("hidden", nextMode !== "local");
  ui.onlineSetup.classList.toggle("hidden", nextMode !== "online");
  setStatus(nextMode === "local" ? "Local" : "Offline");
}

ui.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

// ================================================
// Stepper Controls
// ================================================
ui.playerMinus.addEventListener("click", () => {
  const count = Math.max(1, Number(ui.playerCount.textContent) - 1);
  ui.playerCount.textContent = String(count);
});

ui.playerPlus.addEventListener("click", () => {
  const count = Math.min(8, Number(ui.playerCount.textContent) + 1);
  ui.playerCount.textContent = String(count);
});

ui.speedMinus.addEventListener("click", () => {
  const speed = Math.max(1, Number(ui.callSpeed.textContent) - 1);
  ui.callSpeed.textContent = String(speed);
  autoCallSpeed = speed;
});

ui.speedPlus.addEventListener("click", () => {
  const speed = Math.min(10, Number(ui.callSpeed.textContent) + 1);
  ui.callSpeed.textContent = String(speed);
  autoCallSpeed = speed;
});

// ================================================
// Dispatch Action
// ================================================
function dispatchAction(action) {
  if (mode === "online") {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      showNotice("Not connected to the server.");
      return;
    }
    socket.send(JSON.stringify(action));
    return;
  }

  if (!localState) {
    showNotice("Start a game first.");
    return;
  }

  const result = applyAction(localState, action);
  if (result.error) {
    showNotice(result.error);
    return;
  }
  localState = result.state;
  render();
  scheduleAutoCall();
}

// ================================================
// Auto-call Timer (Local Mode)
// ================================================
function clearAutoCall() {
  if (autoCallTimer) {
    clearTimeout(autoCallTimer);
    autoCallTimer = null;
  }
}

function scheduleAutoCall() {
  clearAutoCall();
  if (mode !== "local" || !localState || localState.phase !== "playing") return;

  const caller = localState.players[localState.currentPlayerIndex];
  if (!caller) return;

  // In local mode, auto-call numbers on a timer
  autoCallTimer = setTimeout(() => {
    if (mode !== "local" || !localState || localState.phase !== "playing") return;

    // First check if any bot has bingo and should claim
    for (let i = 0; i < localState.players.length; i++) {
      const player = localState.players[i];
      if (player.isBot) {
        const botAction = getBotMove(localState, i);
        if (botAction && botAction.type === "claim_bingo") {
          dispatchAction(botAction);
          return;
        }
      }
    }

    // Call next number (caller is always player 0, aka host)
    const callerPlayer = localState.players[localState.currentPlayerIndex];
    if (callerPlayer) {
      dispatchAction({ type: "call_number", playerId: callerPlayer.id });
    }
  }, autoCallSpeed * 1000);
}

// ================================================
// Render Called Numbers Grid
// ================================================
function renderCalledGrid(state) {
  ui.calledGrid.innerHTML = "";
  const calledSet = new Set(state.calledNumbers);

  COLUMNS.forEach((letter) => {
    const row = document.createElement("div");
    row.className = "called-row";

    const label = document.createElement("div");
    label.className = `called-row-label col-${letter}`;
    label.textContent = letter;
    row.appendChild(label);

    const numbers = document.createElement("div");
    numbers.className = "called-row-numbers";

    const [min, max] = COLUMN_RANGES[letter];
    for (let n = min; n <= max; n++) {
      const chip = document.createElement("div");
      chip.className = "called-number";
      chip.textContent = String(n);
      if (calledSet.has(n)) {
        chip.classList.add("called");
        if (state.currentNumber === n) {
          chip.classList.add("current");
        }
      }
      numbers.appendChild(chip);
    }

    row.appendChild(numbers);
    ui.calledGrid.appendChild(row);
  });

  ui.calledCount.textContent = `${state.calledNumbers.length} / 75`;
}

// ================================================
// Render Bingo Card
// ================================================
function renderBingoCard(state) {
  const viewingId = currentViewingPlayerId();
  const player = state.players.find((p) => p.id === viewingId);

  // Remove existing cells (keep headers)
  const existing = ui.bingoCard.querySelectorAll(".bingo-cell");
  existing.forEach((el) => el.remove());

  if (!player) {
    // Spectator: show first bot's card
    const firstPlayer = state.players[0];
    if (firstPlayer) {
      ui.cardLabel.textContent = `${firstPlayer.name}'s Card`;
      renderCardCells(firstPlayer, state);
    }
    return;
  }

  ui.cardLabel.textContent = "Your Card";
  renderCardCells(player, state);
}

function renderCardCells(player, state) {
  // Card is card[col][row], we need to render row by row
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cell = document.createElement("div");
      cell.className = "bingo-cell";

      const isFree = col === 2 && row === 2;
      const number = player.card[col][row];
      const isMarked = player.marked[col][row];

      if (isFree) {
        cell.classList.add("free");
        cell.textContent = "FREE";
      } else {
        cell.textContent = String(number);
        if (isMarked) {
          cell.classList.add("marked");
          // Check if this was just marked (current number)
          if (state.currentNumber === number) {
            cell.classList.add("just-marked");
          }
        }
      }

      // Highlight winning pattern
      if (state.phase === "finished" && state.winnerId === player.id && state.winPattern) {
        const wp = state.winPattern;
        let isWinCell = false;
        if (wp.type === "row" && row === wp.index) isWinCell = true;
        if (wp.type === "column" && col === wp.index) isWinCell = true;
        if (wp.type === "diagonal" && wp.index === 0 && col === row) isWinCell = true;
        if (wp.type === "diagonal" && wp.index === 1 && col === (4 - row)) isWinCell = true;
        if (isWinCell) {
          cell.classList.add("win-highlight");
        }
      }

      ui.bingoCard.appendChild(cell);
    }
  }
}

// ================================================
// Render Players List
// ================================================
function renderPlayers(state) {
  ui.playersList.innerHTML = "";
  state.players.forEach((player, idx) => {
    const row = document.createElement("div");
    row.className = "player-row";

    if (idx === state.currentPlayerIndex) {
      row.classList.add("is-caller");
    }

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.name + (player.isBot ? " (Bot)" : "");
    row.appendChild(name);

    if (idx === state.currentPlayerIndex) {
      const badge = document.createElement("span");
      badge.className = "caller-badge";
      badge.textContent = "Caller";
      row.appendChild(badge);
    }

    const marked = document.createElement("div");
    marked.className = "player-marked";
    const count = player.markedCount ?? player.marked.flat().filter(Boolean).length;
    marked.textContent = `${count} marked`;
    row.appendChild(marked);

    ui.playersList.appendChild(row);
  });
}

// ================================================
// Render Game Log
// ================================================
function renderLog(state) {
  ui.logEntries.innerHTML = "";
  (state.log || []).forEach((entry) => {
    const div = document.createElement("div");
    div.className = "log-entry";
    div.textContent = entry;
    ui.logEntries.appendChild(div);
  });
}

// ================================================
// Main Render
// ================================================
function render() {
  const state = currentState();
  if (!state) {
    ui.gamePanel.classList.add("hidden");
    ui.winnerBanner.classList.add("hidden");
    return;
  }

  ui.gamePanel.classList.remove("hidden");

  const viewingId = currentViewingPlayerId();
  const caller = state.players[state.currentPlayerIndex];
  const isCaller = caller && caller.id === viewingId;
  const me = state.players.find((p) => p.id === viewingId);

  // Current number ball
  if (state.currentNumber) {
    const letter = getColumnLetter(state.currentNumber);
    ui.ballLetter.textContent = letter;
    ui.ballNumber.textContent = String(state.currentNumber);
    ui.currentBall.classList.remove("empty");
    if (state.currentNumber !== lastCurrentNumber) {
      ui.currentBall.classList.remove("new");
      // Force reflow
      void ui.currentBall.offsetWidth;
      ui.currentBall.classList.add("new");
      lastCurrentNumber = state.currentNumber;
    }
  } else {
    ui.ballLetter.textContent = "-";
    ui.ballNumber.textContent = "-";
    ui.currentBall.classList.add("empty");
    ui.currentBall.classList.remove("new");
  }

  const remaining = state.numberPoolCount ?? state.numberPool.length;
  ui.numbersRemaining.textContent = `${remaining} numbers remaining`;

  // Status
  if (state.phase === "finished") {
    if (state.winnerId) {
      const winner = state.players.find((p) => p.id === state.winnerId);
      ui.gameStatus.textContent = "BINGO!";
      ui.gameHint.textContent = `${winner?.name || "Someone"} wins!`;
    } else {
      ui.gameStatus.textContent = "Game Over";
      ui.gameHint.textContent = "All numbers called. No winner.";
    }
  } else {
    ui.gameStatus.textContent = "Game in Progress";
    ui.gameHint.textContent = `${state.calledNumbers.length} numbers called`;
  }

  // Call Number button - only for the caller in online mode or manual mode
  if (mode === "online") {
    ui.callNumberBtn.classList.remove("hidden");
    ui.callNumberBtn.disabled = !isCaller || state.phase !== "playing";
  } else {
    // In local mode, auto-calling is on, but still allow manual call
    ui.callNumberBtn.classList.remove("hidden");
    ui.callNumberBtn.disabled = state.phase !== "playing";
  }

  // Claim Bingo button
  if (me && state.phase === "playing") {
    const hasBingo = checkBingo(me.marked);
    ui.claimBingoBtn.disabled = !hasBingo;
  } else {
    ui.claimBingoBtn.disabled = true;
  }

  // Winner banner
  if (state.phase === "finished" && state.winnerId) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    ui.winnerBanner.classList.remove("hidden");
    ui.winnerName.textContent = `${winner?.name || "Someone"} Wins!`;
    const pattern = state.winPattern;
    if (pattern) {
      ui.winnerDetail.textContent = `Completed a ${pattern.type}!`;
    } else {
      ui.winnerDetail.textContent = "BINGO!";
    }
    clearAutoCall();
  } else {
    ui.winnerBanner.classList.add("hidden");
  }

  renderBingoCard(state);
  renderCalledGrid(state);
  renderPlayers(state);
  renderLog(state);
}

// ================================================
// Start Local Game
// ================================================
function startLocalGame() {
  const name = document.getElementById("localName").value.trim() || "Player";
  const botCount = Number(ui.playerCount.textContent);
  const isSpectator = ui.localSpectator.checked;
  autoCallSpeed = Number(ui.callSpeed.textContent);

  const players = [];
  // Player 0 is always the host/caller
  if (!isSpectator) {
    players.push({ id: "p1", name, isBot: false });
  }
  for (let i = 0; i < botCount; i++) {
    players.push({ id: `bot${i + 1}`, name: `Bot ${i + 1}`, isBot: true });
  }
  // Ensure at least 2 players
  if (players.length < 2) {
    players.push({ id: "bot_extra", name: "Bot Extra", isBot: true });
  }

  localState = createGame({ players, options: {} });
  myPlayerId = isSpectator ? null : "p1";
  lastCurrentNumber = null;
  setStatus(isSpectator ? "Spectating" : "Single Player");
  ui.setupPanel.classList.add("hidden");
  render();
  scheduleAutoCall();
}

// ================================================
// Reset to Setup
// ================================================
function resetToSetup() {
  clearAutoCall();
  localState = null;
  onlineState = null;
  lastCurrentNumber = null;
  ui.setupPanel.classList.remove("hidden");
  ui.gamePanel.classList.add("hidden");
  ui.winnerBanner.classList.add("hidden");
  ui.toast.classList.remove("visible");
}

// ================================================
// Online Mode
// ================================================
function connectOnline({ create }) {
  const name = ui.onlineName.value.trim() || "Player";
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = ui.serverUrl.value.trim() || `${wsProtocol}//${location.host}`;
  const rawCode = ui.roomCode.value.trim();

  if (!create && !rawCode) {
    showNotice("Enter a room code to join.");
    return;
  }

  const code = (rawCode || generateRoomCode()).toUpperCase();
  roomCode = code;
  ui.roomCode.value = code;

  if (socket) socket.close();
  socket = new WebSocket(url);
  setStatus("Connecting...");

  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        type: "hello",
        name,
        room: code,
        create,
        gameType: "bingo",
        options: {},
      })
    );
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "welcome") {
      myPlayerId = message.playerId;
      setStatus("Connected");
    }

    if (message.type === "room_state") {
      roomCode = message.room;
      isHost = message.hostId === myPlayerId;
      ui.roomDisplay.textContent = message.room;
      ui.onlineLobby.classList.remove("hidden");
      ui.lobbyPlayers.innerHTML = "";
      message.players.forEach((player) => {
        const line = document.createElement("div");
        line.textContent = player.name + (player.isBot ? " (Bot)" : "");
        ui.lobbyPlayers.appendChild(line);
      });
      ui.startOnline.disabled = !isHost;
      ui.addBot.disabled = !isHost;
      ui.hostHint.textContent = isHost
        ? "You are the host. Start when everyone is ready."
        : "Waiting for the host to start.";
    }

    if (message.type === "game_state") {
      onlineState = message.state;
      lastCurrentNumber = null;
      ui.setupPanel.classList.add("hidden");
      render();
    }

    if (message.type === "error") {
      showNotice(message.message);
    }
  });

  socket.addEventListener("close", () => {
    setStatus("Offline");
    isHost = false;
  });
}

function leaveRoom() {
  if (socket) {
    socket.send(JSON.stringify({ type: "leave" }));
    socket.close();
  }
  socket = null;
  onlineState = null;
  ui.onlineLobby.classList.add("hidden");
  setStatus("Offline");
}

// ================================================
// Event Listeners
// ================================================
ui.startLocal.addEventListener("click", startLocalGame);

ui.callNumberBtn.addEventListener("click", () => {
  const state = currentState();
  if (!state) return;
  const callerId = state.players[state.currentPlayerIndex]?.id;
  if (mode === "local") {
    // In local mode, anyone can trigger a call via the caller
    clearAutoCall();
    if (callerId) {
      dispatchAction({ type: "call_number", playerId: callerId });
    }
  } else {
    // Online mode - send as current player
    dispatchAction({ type: "call_number", playerId: myPlayerId });
  }
});

ui.claimBingoBtn.addEventListener("click", () => {
  const viewingId = currentViewingPlayerId();
  if (viewingId) {
    dispatchAction({ type: "claim_bingo", playerId: viewingId });
  }
});

ui.restartBtn.addEventListener("click", resetToSetup);
ui.winnerNewGame.addEventListener("click", resetToSetup);

ui.createRoom.addEventListener("click", () => connectOnline({ create: true }));
ui.joinRoom.addEventListener("click", () => connectOnline({ create: false }));

ui.copyRoom.addEventListener("click", () => {
  if (roomCode) {
    navigator.clipboard?.writeText(roomCode);
    showNotice("Room code copied.");
  }
});

ui.shareLan.addEventListener("click", () => {
  if (roomCode) {
    const url = window.location.origin + window.location.pathname + "?room=" + roomCode;
    navigator.clipboard?.writeText(url);
    showNotice("LAN Game Link copied!");
  }
});

ui.addBot.addEventListener("click", () => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "add_bot" }));
  }
});

ui.startOnline.addEventListener("click", () => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "start_game",
        options: {},
      })
    );
  }
});

ui.leaveRoom.addEventListener("click", leaveRoom);

// Auto-fill room from URL
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get("room");
if (roomParam) {
  ui.roomCode.value = roomParam.toUpperCase();
  setMode("online");
} else {
  setMode("local");
}
