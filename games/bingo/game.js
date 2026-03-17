// Bingo Game Engine — pure functional logic, no DOM dependencies

const COLUMNS = ["B", "I", "N", "G", "O"];
const COLUMN_RANGES = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
};

function shuffle(array, rng = Math.random) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCard() {
  const card = [];
  for (let col = 0; col < 5; col++) {
    const letter = COLUMNS[col];
    const [min, max] = COLUMN_RANGES[letter];
    const pool = [];
    for (let n = min; n <= max; n++) pool.push(n);
    const picked = shuffle(pool).slice(0, 5);
    card.push(picked);
  }
  return card;
}

function generateNumberPool() {
  const pool = [];
  for (let n = 1; n <= 75; n++) pool.push(n);
  return shuffle(pool);
}

function pushLog(state, message) {
  state.log = state.log || [];
  state.log.unshift(message);
  if (state.log.length > 50) {
    state.log.length = 50;
  }
}

function getColumnLetter(num) {
  if (num >= 1 && num <= 15) return "B";
  if (num >= 16 && num <= 30) return "I";
  if (num >= 31 && num <= 45) return "N";
  if (num >= 46 && num <= 60) return "G";
  if (num >= 61 && num <= 75) return "O";
  return "?";
}

function checkBingo(marked) {
  // Check rows
  for (let row = 0; row < 5; row++) {
    let complete = true;
    for (let col = 0; col < 5; col++) {
      if (!marked[col][row]) { complete = false; break; }
    }
    if (complete) return { type: "row", index: row };
  }
  // Check columns
  for (let col = 0; col < 5; col++) {
    let complete = true;
    for (let row = 0; row < 5; row++) {
      if (!marked[col][row]) { complete = false; break; }
    }
    if (complete) return { type: "column", index: col };
  }
  // Check diagonal top-left to bottom-right
  {
    let complete = true;
    for (let i = 0; i < 5; i++) {
      if (!marked[i][i]) { complete = false; break; }
    }
    if (complete) return { type: "diagonal", index: 0 };
  }
  // Check diagonal top-right to bottom-left
  {
    let complete = true;
    for (let i = 0; i < 5; i++) {
      if (!marked[i][4 - i]) { complete = false; break; }
    }
    if (complete) return { type: "diagonal", index: 1 };
  }
  return null;
}

export function createGame({ players, options = {} }) {
  const numberPool = generateNumberPool();

  const gamePlayers = players.map((player) => {
    const card = generateCard();
    // marked[col][row] — center is always marked (FREE)
    const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
    marked[2][2] = true; // FREE space
    return {
      id: player.id,
      name: player.name,
      isBot: Boolean(player.isBot),
      card,
      marked,
    };
  });

  const state = {
    players: gamePlayers,
    numberPool,
    calledNumbers: [],
    currentNumber: null,
    currentPlayerIndex: 0, // the caller / host
    direction: 1,
    phase: "playing",
    winnerId: null,
    winPattern: null,
    options: { ...options },
    log: [],
  };

  pushLog(state, `Bingo! ${gamePlayers[0].name} is the caller. Let's play!`);

  return state;
}

export function applyAction(state, action) {
  if (!state) {
    return { state, error: "Game not started." };
  }
  if (state.phase === "finished") {
    return { state, error: "Game finished." };
  }

  const { type, playerId } = action;
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  if (playerIndex < 0) {
    return { state, error: "Unknown player." };
  }

  if (type === "call_number") {
    // Only the current player (caller/host) can call numbers
    const caller = state.players[state.currentPlayerIndex];
    if (!caller || caller.id !== playerId) {
      return { state, error: "Only the caller can draw numbers." };
    }

    if (state.numberPool.length === 0) {
      state.phase = "finished";
      pushLog(state, "All 75 numbers have been called! No winner.");
      return { state };
    }

    const number = state.numberPool.pop();
    state.currentNumber = number;
    state.calledNumbers.push(number);

    const letter = getColumnLetter(number);
    pushLog(state, `${caller.name} calls ${letter}-${number}!`);

    // Auto-mark all player cards
    const colIndex = COLUMNS.indexOf(letter);
    state.players.forEach((player) => {
      for (let row = 0; row < 5; row++) {
        if (player.card[colIndex][row] === number) {
          player.marked[colIndex][row] = true;
        }
      }
    });

    return { state };
  }

  if (type === "claim_bingo") {
    const player = state.players[playerIndex];
    const result = checkBingo(player.marked);
    if (result) {
      state.winnerId = playerId;
      state.winPattern = result;
      state.phase = "finished";
      pushLog(state, `BINGO! ${player.name} wins with a ${result.type}!`);
      return { state };
    } else {
      pushLog(state, `${player.name} claims Bingo but doesn't have one! False alarm.`);
      return { state, error: "You don't have Bingo yet!" };
    }
  }

  return { state, error: "Unknown action." };
}

export function sanitizeStateForPlayer(state, playerId) {
  return {
    ...state,
    numberPool: [],
    numberPoolCount: state.numberPool.length,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      isBot: player.isBot,
      card: player.id === playerId ? player.card : player.card, // cards are public in bingo
      marked: player.id === playerId ? player.marked : undefined, // hide other players' marks
      markedCount: player.marked.flat().filter(Boolean).length,
    })),
  };
}

export function getBotMove(state, playerIndex) {
  const player = state.players[playerIndex];
  if (!player) return null;

  // If the bot is the caller, call a number
  if (playerIndex === state.currentPlayerIndex) {
    return { type: "call_number", playerId: player.id };
  }

  // Check if bot has bingo and should claim
  const result = checkBingo(player.marked);
  if (result) {
    return { type: "claim_bingo", playerId: player.id };
  }

  return null;
}

// Compatibility stubs for the arena framework
export function getPlayableCards() {
  return [];
}

export function getCurrentColor() {
  return null;
}

export function getTopCard() {
  return null;
}

// Export utilities for the client
export { COLUMNS, COLUMN_RANGES, getColumnLetter, checkBingo };
