import { createGame, applyAction } from './game.js';

const players = [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }];
let state = createGame({ players, options: { unoPenalty: true } });

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('PASS:', message);
}

console.log('--- E2E LOGIC VERIFICATION ---');

// 1. Initial State
assert(state.players.length === 2, 'Two players joined');

// 2. Play a card (ensure it is NOT a special card that skips)
state.discardPile = [{ id: 'c-top', color: 'red', type: 'number', value: 5, label: '5' }];
state.currentColor = 'red';
state.players[0].hand = [{ id: 'c-num', color: 'red', type: 'number', value: 1, label: '1' }];
state.currentPlayerIndex = 0;
state.pendingSkip = false;
state.pendingDraw = 0;

console.log('Alice playing Red 1...');
let res = applyAction(state, { type: 'play_card', playerId: 'u1', cardId: 'c-num' });
console.log('State after play:', {
    currentPlayerIndex: state.currentPlayerIndex,
    pendingSkip: state.pendingSkip,
    log: state.log[0]
});

assert(state.currentPlayerIndex === 1, `Current player should be Bob (Index 1). Actual: ${state.currentPlayerIndex}`);

console.log('--- E2E LOGIC VERIFICATION COMPLETE ---');
