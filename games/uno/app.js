import {
  applyAction,
  createGame,
  getCurrentColor,
  getPlayableCards,
  getTopCard,
  getBotMove,
} from "./game.js";

const ui = {
  connectionStatus: document.getElementById("connectionStatus"),
  setupPanel: document.getElementById("setupPanel"),
  localSetup: document.getElementById("localSetup"),
  onlineSetup: document.getElementById("onlineSetup"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  playerMinus: document.getElementById("playerMinus"),
  playerPlus: document.getElementById("playerPlus"),
  playerCount: document.getElementById("playerCount"),
  ruleUnoPenalty: document.getElementById("ruleUnoPenalty"),
  ruleStrictWild: document.getElementById("ruleStrictWild"),
  ruleMustDraw: document.getElementById("ruleMustDraw"),
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
  onlineRuleUnoPenalty: document.getElementById("onlineRuleUnoPenalty"),
  onlineRuleStrictWild: document.getElementById("onlineRuleStrictWild"),
  onlineRuleMustDraw: document.getElementById("onlineRuleMustDraw"),
  onlineSpectator: document.getElementById("onlineSpectator"),
  gamePanel: document.getElementById("gamePanel"),
  turnName: document.getElementById("turnName"),
  turnHint: document.getElementById("turnHint"),
  drawBtn: document.getElementById("drawBtn"),
  passBtn: document.getElementById("passBtn"),
  unoBtn: document.getElementById("unoBtn"),
  callUnoBtn: document.getElementById("callUnoBtn"),
  restartLocal: document.getElementById("restartLocal"),
  drawCount: document.getElementById("drawCount"),
  drawPile: document.getElementById("drawPile"),
  discardPile: document.getElementById("discardPile"),
  colorIndicator: document.getElementById("colorIndicator"),
  seatTop: document.getElementById("seatTop"),
  seatLeft: document.getElementById("seatLeft"),
  seatRight: document.getElementById("seatRight"),
  hand: document.getElementById("hand"),
  handPlayerInfo: document.getElementById("handPlayerInfo"),
  handMeta: document.getElementById("handMeta"),
  sidebar: document.getElementById("sidebar"),
  sidebarLogs: document.getElementById("sidebarLogs"),
  toggleLogs: document.getElementById("toggleLogs"),
  closeSidebar: document.getElementById("closeSidebar"),
  timerProgress: document.getElementById("timerProgress"),
  timerText: document.getElementById("timerText"),
  circularTimer: document.getElementById("circularTimer"),
  lastActionText: document.getElementById("lastActionText"),
  colorOverlay: document.getElementById("colorOverlay"),
  colorChoices: document.querySelectorAll(".color-choice"),
  autoPlayToggle: document.getElementById("autoPlayToggle"),
  directionIndicator: document.getElementById("directionIndicator"),
  toast: document.getElementById("toast"),
  winnerBanner: document.getElementById("winnerBanner"),
  winnerName: document.getElementById("winnerName"),
  winnerNewGame: document.getElementById("winnerNewGame"),
};

const PLAYER_AVATARS = ["🦊", "🐼", "🦁", "🐸", "🐵", "🐯", "🐰", "🐻", "🦄", "🐲"];
const playerAvatarMap = new Map();

function getPlayerAvatar(playerId) {
  if (!playerAvatarMap.has(playerId)) {
    const usedAvatars = new Set(playerAvatarMap.values());
    const available = PLAYER_AVATARS.filter(a => !usedAvatars.has(a));
    const avatar = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : PLAYER_AVATARS[Math.floor(Math.random() * PLAYER_AVATARS.length)];
    playerAvatarMap.set(playerId, avatar);
  }
  return playerAvatarMap.get(playerId);
}

let mode = "local";
let localState = null;
let onlineState = null;
let myPlayerId = null;
let socket = null;
let roomCode = null;
let isHost = false;
let notice = null;
let noticeTimeout = null;
let autoPlay = false;
let localTurnTimer = null;
const LOCAL_TURN_MS = 15000;

function showNotice(message) {
  notice = message;
  if (noticeTimeout) {
    clearTimeout(noticeTimeout);
    noticeTimeout = null;
  }
  // Show toast notification
  ui.toast.textContent = message;
  ui.toast.classList.add("visible");
  noticeTimeout = setTimeout(() => {
    notice = null;
    noticeTimeout = null;
    ui.toast.classList.remove("visible");
  }, 2200);
}

function clearNotice() {
  if (noticeTimeout) {
    clearTimeout(noticeTimeout);
    noticeTimeout = null;
  }
  notice = null;
  ui.toast.classList.remove("visible");
}

function clearLocalTurnTimer() {
  if (localTurnTimer) {
    clearTimeout(localTurnTimer);
    localTurnTimer = null;
  }
}

function autoMoveForHuman() {
  if (mode !== "local" || !localState || localState.phase !== "playing") return;
  const viewingId = currentViewingPlayerId(localState);
  const currentPlayer = localState.players[localState.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== viewingId) return;
  const meIndex = localState.players.findIndex(p => p.id === viewingId);
  if (meIndex < 0) return;
  const botAction = getBotMove(localState, meIndex);
  if (botAction) dispatchAction(botAction);
}

function startLocalTurnTimer() {
  clearLocalTurnTimer();
  if (mode !== "local" || !localState || localState.phase !== "playing") return;
  const currentPlayer = localState.players[localState.currentPlayerIndex];
  const viewingId = currentViewingPlayerId(localState);
  if (!currentPlayer || currentPlayer.isBot || currentPlayer.id !== viewingId) return;
  localState.turnEndTime = Date.now() + LOCAL_TURN_MS;
  localTurnTimer = setTimeout(() => {
    if (mode !== "local" || !localState || localState.phase !== "playing") return;
    const cp = localState.players[localState.currentPlayerIndex];
    if (cp && cp.id === viewingId) {
      showNotice("Time's up! Auto-playing...");
      autoMoveForHuman();
    }
  }, LOCAL_TURN_MS);
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function setStatus(text) {
  ui.connectionStatus.textContent = text;
}

function setMode(nextMode) {
  mode = nextMode;
  ui.modeButtons.forEach((button) => {
    const active = button.dataset.mode === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  ui.localSetup.classList.toggle("hidden", nextMode !== "local");
  ui.onlineSetup.classList.toggle("hidden", nextMode !== "online");
  ui.restartLocal.classList.toggle("hidden", nextMode !== "local");
  setStatus(nextMode === "local" ? "Local" : "Offline");
}

function currentState() {
  return mode === "online" ? onlineState : localState;
}

function currentViewingPlayerId(state) {
  if (!state) return null;
  if (mode === "online") return myPlayerId;
  // If human exists, human is p1. If spectator mode, human has no ID.
  const human = state.players.find(p => !p.isBot);
  return human ? human.id : null;
}

function cardSymbol(card) {
  if (card.type === "number") return String(card.value);
  if (card.type === "skip") return "Skip";
  if (card.type === "reverse") return "REV";
  if (card.type === "draw2") return "+2";
  if (card.type === "wild") return "Wild";
  if (card.type === "wild4") return "+4";
  return card.label || "?";
}

function cardColorClass(card) {
  if (card.type === "wild" || card.type === "wild4") return "wild";
  return card.color || "wild";
}

function createCardElement(card, { playable = false, disabled = false } = {}) {
  const el = document.createElement("div");
  el.className = `card ${cardColorClass(card)}`;
  if (playable) el.classList.add("playable");
  if (disabled) el.classList.add("disabled");

  const inner = document.createElement("div");
  inner.className = "inner";

  const top = document.createElement("span");
  top.className = "corner";
  top.textContent = cardSymbol(card);

  const center = document.createElement("span");
  center.className = "center";
  center.textContent = cardSymbol(card);

  const bottom = document.createElement("span");
  bottom.className = "corner bottom";
  bottom.textContent = cardSymbol(card);

  inner.appendChild(top);
  inner.appendChild(center);
  inner.appendChild(bottom);
  el.appendChild(inner);

  el.title = card.label || cardSymbol(card);
  return el;
}

function createBackCard() {
  const el = document.createElement("div");
  el.className = "card back";
  const inner = document.createElement("div");
  inner.className = "inner";
  const logo = document.createElement("span");
  logo.className = "logo";
  logo.textContent = "UNO";
  inner.appendChild(logo);
  el.appendChild(inner);
  return el;
}

let lastTopCardId = null;

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 20; // r=20, ~125.66

function updateTimer() {
  const state = currentState();
  if (state && state.phase === "playing" && state.turnEndTime) {
    const now = Date.now();
    const total = mode === "local" ? LOCAL_TURN_MS : 30000;
    const remaining = Math.max(0, state.turnEndTime - now);
    const fraction = remaining / total;
    const offset = TIMER_CIRCUMFERENCE * (1 - fraction);
    const seconds = Math.ceil(remaining / 1000);
    ui.timerProgress.style.strokeDashoffset = offset;
    ui.timerProgress.style.stroke = fraction < 0.2 ? "var(--system-red)" : fraction < 0.5 ? "var(--system-yellow)" : "var(--system-blue)";
    ui.timerText.textContent = seconds;
    ui.circularTimer.style.opacity = "1";
  } else {
    ui.timerProgress.style.strokeDashoffset = TIMER_CIRCUMFERENCE;
    ui.timerText.textContent = "";
    ui.circularTimer.style.opacity = "0.3";
  }
  requestAnimationFrame(updateTimer);
}
updateTimer();

function render() {
  const state = currentState();
  if (!state) {
    ui.gamePanel.classList.add("hidden");

    ui.colorOverlay.classList.add("hidden");
    ui.winnerBanner.classList.add("hidden");
    return;
  }

  ui.gamePanel.classList.remove("hidden");

  // Direction indicator
  if (ui.directionIndicator) {
    ui.directionIndicator.classList.toggle("reverse", state.direction === -1);
  }

  const viewingPlayerId = currentViewingPlayerId(state);
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = currentPlayer && currentPlayer.id === viewingPlayerId;
  const meIndex = state.players.findIndex(p => p.id === viewingPlayerId);
  const me = meIndex >= 0 ? state.players[meIndex] : null;
  const topCard = getTopCard(state);
  const currentColor = getCurrentColor(state);
  const playableCards = meIndex >= 0 ? getPlayableCards(state, meIndex) : [];

  if (state.log && state.log.length > 0) {
    ui.lastActionText.textContent = state.log[0];
  }

  ui.turnName.textContent = isMyTurn ? "Your Turn" : `${currentPlayer?.name}'s Turn`;
  document.querySelector(".turn-card").classList.toggle("my-turn", isMyTurn);
  document.querySelector(".hand-area").classList.toggle("my-turn", isMyTurn);

  // Winner banner
  if (state.phase === "finished" && state.winnerId) {
    const winner = state.players.find(p => p.id === state.winnerId);
    ui.winnerBanner.classList.remove("hidden");
    ui.winnerName.textContent = `${winner?.name || "Someone"} Wins!`;
  } else {
    ui.winnerBanner.classList.add("hidden");
  }

  if (notice) {
    ui.turnHint.textContent = notice;
  } else if (state.phase === "finished" && state.winnerId) {
    const winner = state.players.find(p => p.id === state.winnerId);
    ui.turnHint.textContent = winner ? `${winner.name} won!` : "Game over.";
  } else if (state.awaitingColor) {
    ui.turnHint.textContent = isMyTurn ? "Pick a color" : "Choosing a color...";
  } else if (isMyTurn) {
    if (state.drawRestriction && state.drawRestriction.playerId === viewingPlayerId) {
      ui.turnHint.textContent = "Play the drawn card or pass";
    } else if (playableCards.length > 0) {
      ui.turnHint.textContent = "Play a card or draw";
    } else {
      ui.turnHint.textContent = "No playable cards - draw one";
    }
  } else {
    ui.turnHint.textContent = "Waiting...";
  }

  ui.drawCount.textContent = String(state.drawPileCount ?? state.drawPile.length);

  ui.discardPile.querySelectorAll('.card').forEach(c => c.remove());
  if (topCard) {
    const cardEl = createCardElement(topCard);
    cardEl.classList.add("disabled");
    if (topCard.id !== lastTopCardId) {
      cardEl.classList.add("new-play");
      lastTopCardId = topCard.id;
    }
    ui.discardPile.appendChild(cardEl);
  }

  if (currentColor) {
    ui.colorIndicator.innerHTML = `<span class="color-label">Active Color</span><span class="color-dot" style="background:var(--${currentColor})"></span><span class="color-name">${currentColor}</span>`;
    ui.colorIndicator.style.color = currentColor === "yellow" ? "#3a3000" : "#fff";
    ui.colorIndicator.classList.add("visible");
  } else {
    ui.colorIndicator.innerHTML = "";
    ui.colorIndicator.classList.remove("visible");
  }

  // Render opponents around the table edges
  ui.seatTop.innerHTML = "";
  ui.seatLeft.innerHTML = "";
  ui.seatRight.innerHTML = "";
  const opponents = state.players.filter(p => p.id !== viewingPlayerId);

  // Distribute opponents into seat containers
  function getSeats(count) {
    if (count === 1) return [["top"]];
    if (count === 2) return [["top"], ["top"]];
    if (count === 3) return [["left"], ["top"], ["right"]];
    if (count === 4) return [["left"], ["top"], ["top"], ["right"]];
    // 5+
    return opponents.map((_, i) => {
      if (i === 0) return ["left"];
      if (i === count - 1) return ["right"];
      return ["top"];
    });
  }
  const seats = getSeats(opponents.length);

  opponents.forEach((player, i) => {
    const playerIdx = state.players.findIndex(p => p.id === player.id);
    const card = document.createElement("div");
    card.className = "opponent-card";
    if (player.id === currentPlayer?.id) card.classList.add("active");
    const cardCount = player.handCount ?? player.hand.length;

    // Left side: avatar + tag
    const left = document.createElement("div");
    left.className = "opponent-left";
    const avatar = document.createElement("div");
    avatar.className = "player-avatar";
    avatar.textContent = getPlayerAvatar(player.id);
    const numTag = document.createElement("span");
    numTag.className = "player-tag";
    numTag.textContent = `P${playerIdx + 1}`;
    left.appendChild(avatar);
    left.appendChild(numTag);

    // Right side: name + count + mini fan
    const right = document.createElement("div");
    right.className = "opponent-right";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = player.name;
    const count = document.createElement("div");
    count.className = "count";
    count.textContent = `${cardCount} card${cardCount !== 1 ? "s" : ""}`;
    const fan = document.createElement("div");
    fan.className = "mini-fan";
    const displayCount = Math.min(cardCount, 7);
    for (let j = 0; j < displayCount; j++) {
      const miniCard = document.createElement("div");
      miniCard.className = "mini-card";
      const centerOffset = j - (displayCount - 1) / 2;
      miniCard.style.transform = `rotate(${centerOffset * 6}deg)`;
      fan.appendChild(miniCard);
    }
    right.appendChild(name);
    right.appendChild(count);
    right.appendChild(fan);

    card.appendChild(left);
    card.appendChild(right);

    if (cardCount === 1) {
      const badge = document.createElement("div");
      badge.className = "uno-badge";
      badge.textContent = "UNO!";
      card.appendChild(badge);
    }
    const seatTarget = seats[i][0];
    if (seatTarget === "left") ui.seatLeft.appendChild(card);
    else if (seatTarget === "right") ui.seatRight.appendChild(card);
    else ui.seatTop.appendChild(card);
  });

  // Render current player info near hand
  ui.handPlayerInfo.innerHTML = "";
  if (me) {
    const avatar = document.createElement("div");
    avatar.className = "player-avatar small";
    avatar.textContent = getPlayerAvatar(me.id);
    const numTag = document.createElement("span");
    numTag.className = "player-tag";
    numTag.textContent = `P${meIndex + 1}`;
    const nameEl = document.createElement("h2");
    nameEl.textContent = me.name;
    nameEl.className = "hand-player-name";
    if (isMyTurn) nameEl.classList.add("my-turn");
    ui.handPlayerInfo.appendChild(avatar);
    ui.handPlayerInfo.appendChild(numTag);
    ui.handPlayerInfo.appendChild(nameEl);
  } else {
    const nameEl = document.createElement("h2");
    nameEl.textContent = viewingPlayerId ? "Hand" : "Spectating";
    nameEl.className = "hand-player-name";
    ui.handPlayerInfo.appendChild(nameEl);
  }

  ui.hand.innerHTML = "";

  if (me) {
    const playableSet = new Set(playableCards.map(c => c.id));
    if (me.hand.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.textContent = "No cards";
      placeholder.className = "muted";
      ui.hand.appendChild(placeholder);
    } else {
      me.hand.forEach((card, idx) => {
        const isPlayableNow = playableSet.has(card.id);
        const restricted = state.drawRestriction && state.drawRestriction.playerId === viewingPlayerId && state.drawRestriction.cardId !== card.id;
        const disabled = !isMyTurn || state.phase === "finished" || state.awaitingColor || restricted || !isPlayableNow;
        const cardEl = createCardElement(card, { playable: isMyTurn && isPlayableNow && !restricted, disabled });
        const centerOffset = idx - (me.hand.length - 1) / 2;
        const rotation = centerOffset * 2.5;
        const distFromCenter = Math.abs(centerOffset);
        const yOffset = distFromCenter * distFromCenter * 1.5;
        cardEl.style.transform = `rotate(${rotation}deg) translateY(${yOffset}px)`;
        if (!disabled) {
          cardEl.addEventListener("click", () => {
            dispatchAction({ type: "play_card", playerId: viewingPlayerId, cardId: card.id });
          });
        }
        ui.hand.appendChild(cardEl);
      });
    }
  } else if (!viewingPlayerId) {
    const placeholder = document.createElement("div");
    placeholder.textContent = "Spectating - AI vs AI";
    placeholder.className = "muted";
    ui.hand.appendChild(placeholder);
  }

  ui.handMeta.textContent = meIndex >= 0 ? `${me.hand.length} card${me.hand.length !== 1 ? "s" : ""} \u00B7 ${state.drawPileCount ?? state.drawPile.length} in deck` : "";

  const canDraw = isMyTurn && state.phase !== "finished" && !state.awaitingColor && !state.drawRestriction && (!state.options.mustDrawOnlyIfNoPlay || playableCards.length === 0);
  const canPass = isMyTurn && state.phase !== "finished" && !state.awaitingColor && !!state.drawRestriction;

  ui.drawPile.classList.toggle("disabled", !canDraw);
  ui.drawBtn.disabled = !canDraw;
  ui.passBtn.disabled = !canPass;

  ui.unoBtn.classList.toggle("hidden", !(state.unoPendingPlayerId && state.unoPendingPlayerId === viewingPlayerId));
  ui.callUnoBtn.classList.toggle("hidden", !(state.unoPendingPlayerId && state.unoPendingPlayerId !== viewingPlayerId));

  ui.sidebarLogs.innerHTML = "";
  (state.log || []).forEach((entry) => {
    const div = document.createElement("div");
    div.className = "log-entry";
    div.textContent = entry;
    ui.sidebarLogs.appendChild(div);
  });

  if (state.awaitingColor && viewingPlayerId === state.awaitingColorPlayerId) {
    ui.colorOverlay.classList.remove("hidden");
  } else {
    ui.colorOverlay.classList.add("hidden");
  }

  // Local Bot Automation + Auto-play + Turn timer
  if (mode === "local" && state.phase === "playing") {
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer && currentPlayer.isBot) {
      clearLocalTurnTimer();
      setTimeout(() => {
        if (mode !== "local" || !localState) return;
        const botAction = getBotMove(localState, localState.currentPlayerIndex);
        if (botAction) dispatchAction(botAction);
      }, 1500);
    } else if (currentPlayer && currentPlayer.id === viewingPlayerId) {
      if (autoPlay) {
        clearLocalTurnTimer();
        setTimeout(() => {
          if (mode !== "local" || !localState || localState.phase !== "playing") return;
          autoMoveForHuman();
        }, 800);
      } else {
        startLocalTurnTimer();
      }
    }
  }
}

ui.toggleLogs.addEventListener("click", () => {
  ui.sidebar.classList.toggle("open");
  document.querySelector(".uno").classList.toggle("sidebar-open", ui.sidebar.classList.contains("open"));
});

ui.closeSidebar.addEventListener("click", () => {
  ui.sidebar.classList.remove("open");
  document.querySelector(".uno").classList.remove("sidebar-open");
});

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
  clearLocalTurnTimer();
  clearNotice();
  const result = applyAction(localState, action);
  if (result.error) {
    showNotice(result.error);
    return;
  }
  localState = result.state;
  render();
}

function startLocalGame() {
  const name = document.getElementById("localName").value.trim() || "Player";
  const botCount = Number(ui.playerCount.textContent);
  const isSpectator = ui.localSpectator.checked;
  const players = [];
  if (!isSpectator) players.push({ id: "p1", name, isBot: false });
  for (let i = 0; i < botCount; i += 1) {
    players.push({ id: `bot${i + 1}`, name: `Bot ${i + 1}`, isBot: true });
  }
  if (players.length < 2) players.push({ id: `bot_extra`, name: `Bot Extra`, isBot: true });
  const options = {
    unoPenalty: ui.ruleUnoPenalty.checked,
    enforceWildDrawFour: ui.ruleStrictWild.checked,
    mustDrawOnlyIfNoPlay: ui.ruleMustDraw.checked,
  };
  notice = null;
  localState = createGame({ players, options });
  myPlayerId = isSpectator ? null : "p1";
  setStatus(isSpectator ? "Spectating" : "Single Player");
  ui.setupPanel.classList.add("hidden");
  render();
}

function resetToSetup() {
  clearLocalTurnTimer();
  clearNotice();
  playerAvatarMap.clear();
  localState = null; onlineState = null; notice = null;
  autoPlay = false;
  ui.autoPlayToggle.checked = false;
  ui.setupPanel.classList.remove("hidden");
  ui.gamePanel.classList.add("hidden");
  ui.colorOverlay.classList.add("hidden");
  ui.winnerBanner.classList.add("hidden");
  ui.toast.classList.remove("visible");
}

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
  roomCode = code; ui.roomCode.value = code;
  if (socket) socket.close();
  socket = new WebSocket(url);
  setStatus("Connecting...");
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "hello", name, room: code, create,
      options: {
        unoPenalty: ui.onlineRuleUnoPenalty.checked,
        enforceWildDrawFour: ui.onlineRuleStrictWild.checked,
        mustDrawOnlyIfNoPlay: ui.onlineRuleMustDraw.checked,
      },
    }));
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
      ui.hostHint.textContent = isHost ? "You are the host. Start when everyone is ready." : "Waiting for the host to start.";
    }
    if (message.type === "game_state") {
      onlineState = message.state;
      notice = null;
      ui.setupPanel.classList.add("hidden");
      render();
    }
    if (message.type === "error") showNotice(message.message);
  });
  socket.addEventListener("close", () => { setStatus("Offline"); isHost = false; });
}

function leaveRoom() {
  if (socket) { socket.send(JSON.stringify({ type: "leave" })); socket.close(); }
  socket = null; onlineState = null; ui.onlineLobby.classList.add("hidden"); setStatus("Offline");
}

ui.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

ui.playerMinus.addEventListener("click", () => {
  const count = Math.max(1, Number(ui.playerCount.textContent) - 1);
  ui.playerCount.textContent = String(count);
});

ui.playerPlus.addEventListener("click", () => {
  const count = Math.min(5, Number(ui.playerCount.textContent) + 1);
  ui.playerCount.textContent = String(count);
});

ui.startLocal.addEventListener("click", startLocalGame);
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
    socket.send(JSON.stringify({
      type: "start_game",
      options: {
        unoPenalty: ui.onlineRuleUnoPenalty.checked,
        enforceWildDrawFour: ui.onlineRuleStrictWild.checked,
        mustDrawOnlyIfNoPlay: ui.onlineRuleMustDraw.checked,
        spectator: ui.onlineSpectator.checked,
      },
    }));
  }
});

ui.leaveRoom.addEventListener("click", leaveRoom);
ui.drawBtn.addEventListener("click", () => dispatchAction({ type: "draw_card", playerId: currentViewingPlayerId(currentState()) }));
ui.drawPile.addEventListener("click", () => dispatchAction({ type: "draw_card", playerId: currentViewingPlayerId(currentState()) }));
ui.passBtn.addEventListener("click", () => dispatchAction({ type: "pass_turn", playerId: currentViewingPlayerId(currentState()) }));
ui.unoBtn.addEventListener("click", () => dispatchAction({ type: "declare_uno", playerId: currentViewingPlayerId(currentState()) }));
ui.callUnoBtn.addEventListener("click", () => dispatchAction({ type: "call_uno", playerId: currentViewingPlayerId(currentState()) }));
ui.restartLocal.addEventListener("click", resetToSetup);
ui.winnerNewGame.addEventListener("click", resetToSetup);

ui.colorChoices.forEach((button) => {
  button.addEventListener("click", () => {
    const color = button.dataset.color;
    const state = currentState();
    if (!state || !state.awaitingColor) return;
    dispatchAction({ type: "choose_color", playerId: currentViewingPlayerId(state), color });
  });
});

ui.autoPlayToggle.addEventListener("change", () => {
  autoPlay = ui.autoPlayToggle.checked;
  if (autoPlay && mode === "local" && localState && localState.phase === "playing") {
    clearLocalTurnTimer();
    const currentPlayer = localState.players[localState.currentPlayerIndex];
    const viewingId = currentViewingPlayerId(localState);
    if (currentPlayer && currentPlayer.id === viewingId) {
      setTimeout(() => autoMoveForHuman(), 400);
    }
  } else if (!autoPlay && mode === "local" && localState && localState.phase === "playing") {
    startLocalTurnTimer();
  }
});

// Auto-fill room from URL
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
  ui.roomCode.value = roomParam.toUpperCase();
  setMode("online");
}

setMode("local");
