const COLORS = ["red", "yellow", "green", "blue"];
const ACTIONS = ["skip", "reverse", "draw2"];
const WILDS = ["wild", "wild4"];

let cardCounter = 0;

function nextCardId() {
  cardCounter += 1;
  return `c${cardCounter}`;
}

function makeCard({ color = null, type, value, label }) {
  return {
    id: nextCardId(),
    color,
    type,
    value,
    label,
  };
}

export function createDeck() {
  const deck = [];

  COLORS.forEach((color) => {
    deck.push(makeCard({ color, type: "number", value: 0, label: "0" }));
    for (let value = 1; value <= 9; value += 1) {
      deck.push(makeCard({ color, type: "number", value, label: String(value) }));
      deck.push(makeCard({ color, type: "number", value, label: String(value) }));
    }
    ACTIONS.forEach((action) => {
      const label =
        action === "skip"
          ? "Skip"
          : action === "reverse"
            ? "Reverse"
            : "+2";
      deck.push(makeCard({ color, type: action, value: action, label }));
      deck.push(makeCard({ color, type: action, value: action, label }));
    });
  });

  for (let i = 0; i < 4; i += 1) {
    deck.push(makeCard({ type: "wild", value: "wild", label: "Wild" }));
    deck.push(makeCard({ type: "wild4", value: "wild4", label: "+4" }));
  }

  return deck;
}

export function shuffle(deck, rng = Math.random) {
  const array = [...deck];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function pushLog(state, message) {
  state.log = state.log || [];
  state.log.unshift(message);
  if (state.log.length > 30) {
    state.log.length = 30;
  }
}

function refillDrawPile(state) {
  if (state.drawPile.length > 0 || state.discardPile.length <= 1) {
    return;
  }
  const top = state.discardPile.pop();
  const shuffled = shuffle(state.discardPile);
  state.discardPile = [top];
  state.drawPile = shuffled;
}

function drawCards(state, playerIndex, count) {
  const drawn = [];
  for (let i = 0; i < count; i += 1) {
    if (state.drawPile.length === 0) {
      refillDrawPile(state);
    }
    if (state.drawPile.length === 0) {
      break;
    }
    const card = state.drawPile.pop();
    state.players[playerIndex].hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

function nextIndex(state, steps = 1) {
  const total = state.players.length;
  let idx = state.currentPlayerIndex;
  for (let i = 0; i < steps; i += 1) {
    idx = (idx + state.direction + total) % total;
  }
  return idx;
}

function resolveStartOfTurn(state) {
  let guard = 0;
  while (guard < state.players.length + 2) {
    if (state.pendingDraw > 0 || state.pendingSkip) {
      const target = state.currentPlayerIndex;
      if (state.pendingDraw > 0) {
        drawCards(state, target, state.pendingDraw);
        pushLog(
          state,
          `${state.players[target].name} draws ${state.pendingDraw} cards.`
        );
      }
      state.pendingDraw = 0;
      state.pendingSkip = false;
      state.currentPlayerIndex = nextIndex(state, 1);
      guard += 1;
      continue;
    }
    break;
  }
}

function applyAutoUnoPenalty(state, actingPlayerId) {
  if (!state.options.unoPenalty) {
    return;
  }
  if (
    state.unoPendingPlayerId &&
    !state.unoCalled &&
    actingPlayerId !== state.unoPendingPlayerId
  ) {
    const idx = state.players.findIndex(
      (player) => player.id === state.unoPendingPlayerId
    );
    if (idx >= 0) {
      drawCards(state, idx, 2);
      pushLog(state, `${state.players[idx].name} missed UNO and draws 2.`);
    }
    state.unoPendingPlayerId = null;
    state.unoCalled = false;
  } else if (state.unoPendingPlayerId === actingPlayerId && !state.unoCalled) {
    state.unoPendingPlayerId = null;
    state.unoCalled = false;
  }
}

export function createGame({ players, options = {} }) {
  const config = {
    enforceWildDrawFour: Boolean(options.enforceWildDrawFour),
    unoPenalty: options.unoPenalty !== false,
    mustDrawOnlyIfNoPlay: options.mustDrawOnlyIfNoPlay !== false,
  };

  const deck = shuffle(createDeck());
  const gamePlayers = players.map((player) => ({
    id: player.id,
    name: player.name,
    isBot: Boolean(player.isBot),
    hand: [],
  }));

  const state = {
    players: gamePlayers,
    drawPile: deck,
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: null,
    pendingDraw: 0,
    pendingSkip: false,
    awaitingColor: false,
    awaitingColorPlayerId: null,
    drawRestriction: null,
    unoPendingPlayerId: null,
    unoCalled: false,
    winnerId: null,
    phase: "playing",
    options: config,
    log: [],
  };

  for (let i = 0; i < 7; i += 1) {
    gamePlayers.forEach((_, idx) => drawCards(state, idx, 1));
  }

  let starter = state.drawPile.pop();
  while (starter && starter.type !== "number") {
    state.drawPile.unshift(starter);
    starter = state.drawPile.pop();
  }
  if (!starter) {
    starter = makeCard({ color: "red", type: "number", value: 0, label: "0" });
  }
  state.discardPile.push(starter);
  state.currentColor = starter.color;

  pushLog(
    state,
    `Game on! ${state.players[state.currentPlayerIndex].name} goes first.`
  );

  return state;
}

export function getTopCard(state) {
  return state.discardPile[state.discardPile.length - 1] || null;
}

export function getCurrentColor(state) {
  return state.currentColor || (getTopCard(state)?.color ?? null);
}

export function isPlayable(card, state, playerIndex) {
  if (!card) {
    return false;
  }
  if (state.awaitingColor) {
    return false;
  }
  if (WILDS.includes(card.type)) {
    if (
      card.type === "wild4" &&
      state.options.enforceWildDrawFour &&
      hasColorMatch(state, playerIndex)
    ) {
      return false;
    }
    return true;
  }
  const currentColor = getCurrentColor(state);
  const top = getTopCard(state);
  if (!top) {
    return true;
  }
  if (card.color === currentColor) {
    return true;
  }
  if (card.type === "number" && top.type === "number") {
    return card.value === top.value;
  }
  if (card.type !== "number" && top.type === card.type) {
    return true;
  }
  return false;
}

function hasColorMatch(state, playerIndex) {
  const currentColor = getCurrentColor(state);
  if (!currentColor) {
    return false;
  }
  return state.players[playerIndex].hand.some(
    (card) => card.color === currentColor
  );
}

export function getPlayableCards(state, playerIndex) {
  return state.players[playerIndex].hand.filter((card) =>
    isPlayable(card, state, playerIndex)
  );
}

function ensureTurn(state, playerId) {
  const current = state.players[state.currentPlayerIndex];
  return current && current.id === playerId;
}

function advanceTurn(state) {
  state.currentPlayerIndex = nextIndex(state, 1);
  resolveStartOfTurn(state);
}

export function getBotMove(state, playerIndex) {
  const player = state.players[playerIndex];
  if (!player) return null;

  // 1. If awaiting color
  if (state.awaitingColor && state.awaitingColorPlayerId === player.id) {
    const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
    player.hand.forEach((c) => {
      if (c.color) counts[c.color] += 1;
    });
    const bestColor = Object.keys(counts).reduce((a, b) =>
      counts[a] > counts[b] ? a : b
    );
    return { type: "choose_color", color: bestColor, playerId: player.id };
  }

  // 2. If pending UNO declaration
  if (state.unoPendingPlayerId === player.id && !state.unoCalled) {
    return { type: "declare_uno", playerId: player.id };
  }

  // 3. If restricted to playing drawn card
  if (state.drawRestriction && state.drawRestriction.playerId === player.id) {
    const cardId = state.drawRestriction.cardId;
    const card = player.hand.find((c) => c.id === cardId);
    if (isPlayable(card, state, playerIndex)) {
      return { type: "play_card", cardId, playerId: player.id };
    } else {
      return { type: "pass_turn", playerId: player.id };
    }
  }

  // 4. Normal play
  const playable = getPlayableCards(state, playerIndex);
  if (playable.length > 0) {
    // Basic priority: Action cards first
    const action = playable.find((c) => ACTIONS.includes(c.type));
    const cardToPlay = action || playable[Math.floor(Math.random() * playable.length)];
    return { type: "play_card", cardId: cardToPlay.id, playerId: player.id };
  }

  // 5. Must draw
  return { type: "draw_card", playerId: player.id };
}

export function applyAction(state, action) {
  if (!state) {
    return { state, error: "Game not started." };
  }
  if (state.phase === "finished") {
    return { state, error: "Game finished." };
  }

  const { type, playerId } = action;
  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) {
    return { state, error: "Unknown player." };
  }

  if (type === "declare_uno") {
    if (state.unoPendingPlayerId === playerId) {
      state.unoCalled = true;
      state.unoPendingPlayerId = null;
      pushLog(state, `${state.players[playerIndex].name} calls UNO!`);
    }
    return { state };
  }

  if (type === "call_uno") {
    if (state.unoPendingPlayerId && !state.unoCalled) {
      const idx = state.players.findIndex(
        (player) => player.id === state.unoPendingPlayerId
      );
      if (idx >= 0) {
        drawCards(state, idx, 2);
        pushLog(state, `${state.players[idx].name} was caught without UNO.`);
      }
      state.unoPendingPlayerId = null;
      state.unoCalled = false;
    }
    return { state };
  }

  if (type === "choose_color") {
    if (!state.awaitingColor || state.awaitingColorPlayerId !== playerId) {
      return { state, error: "No color choice pending." };
    }
    if (!COLORS.includes(action.color)) {
      return { state, error: "Invalid color." };
    }
    state.currentColor = action.color;
    state.awaitingColor = false;
    state.awaitingColorPlayerId = null;
    pushLog(state, `${state.players[playerIndex].name} chooses ${action.color}.`);
    if (state.phase !== "finished") {
      advanceTurn(state);
    }
    return { state };
  }

  if (!ensureTurn(state, playerId)) {
    return { state, error: "Not your turn." };
  }

  applyAutoUnoPenalty(state, playerId);

  if (state.awaitingColor) {
    return { state, error: "Choose a color first." };
  }

  if (type === "draw_card") {
    if (state.drawRestriction) {
      return { state, error: "Play or pass the drawn card." };
    }
    const playable = getPlayableCards(state, playerIndex);
    if (state.options.mustDrawOnlyIfNoPlay && playable.length > 0) {
      return { state, error: "You already have a playable card." };
    }
    const drawn = drawCards(state, playerIndex, 1);
    if (drawn.length === 0) {
      return { state, error: "No cards left to draw." };
    }
    const drawnCard = drawn[0];
    pushLog(state, `${state.players[playerIndex].name} draws a card.`);
    state.drawRestriction = { playerId, cardId: drawnCard.id };
    if (!isPlayable(drawnCard, state, playerIndex)) {
      pushLog(state, `${state.players[playerIndex].name} passes.`);
      state.drawRestriction = null;
      advanceTurn(state);
    }
    return { state };
  }

  if (type === "pass_turn") {
    if (!state.drawRestriction) {
      return { state, error: "You must draw a card first." };
    }
    state.drawRestriction = null;
    pushLog(state, `${state.players[playerIndex].name} passes.`);
    advanceTurn(state);
    return { state };
  }

  if (type === "play_card") {
    const cardIndex = state.players[playerIndex].hand.findIndex(
      (card) => card.id === action.cardId
    );
    if (cardIndex < 0) {
      return { state, error: "Card not found." };
    }

    if (
      state.drawRestriction &&
      state.drawRestriction.playerId === playerId &&
      state.drawRestriction.cardId !== action.cardId
    ) {
      return { state, error: "You can only play the drawn card." };
    }

    const card = state.players[playerIndex].hand[cardIndex];
    if (!isPlayable(card, state, playerIndex)) {
      return { state, error: "Card not playable." };
    }

    state.players[playerIndex].hand.splice(cardIndex, 1);
    state.discardPile.push(card);
    state.drawRestriction = null;

    if (card.type === "wild" || card.type === "wild4") {
      state.awaitingColor = true;
      state.awaitingColorPlayerId = playerId;
      state.currentColor = null;
      if (card.type === "wild4") {
        state.pendingDraw = 4;
        state.pendingSkip = true;
      }
    } else {
      state.currentColor = card.color;
      if (card.type === "draw2") {
        state.pendingDraw = 2;
        state.pendingSkip = true;
      } else if (card.type === "skip") {
        state.pendingSkip = true;
      } else if (card.type === "reverse") {
        if (state.players.length === 2) {
          state.pendingSkip = true;
        } else {
          state.direction *= -1;
        }
      }
    }

    pushLog(
      state,
      `${state.players[playerIndex].name} plays ${card.label}.`
    );

    if (state.players[playerIndex].hand.length === 1) {
      state.unoPendingPlayerId = playerId;
      state.unoCalled = false;
    } else if (state.players[playerIndex].hand.length === 0) {
      state.winnerId = playerId;
      state.phase = "finished";
      pushLog(state, `${state.players[playerIndex].name} wins!`);
      return { state };
    }

    if (!state.awaitingColor) {
      advanceTurn(state);
    }
    return { state };
  }

  return { state, error: "Unknown action." };
}

export function sanitizeStateForPlayer(state, playerId) {
  return {
    ...state,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      hand: player.id === playerId ? player.hand : [],
      handCount: player.hand.length,
    })),
    drawPile: [],
    drawPileCount: state.drawPile.length,
  };
}
