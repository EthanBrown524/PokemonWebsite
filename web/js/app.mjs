import {
  buildMatchupForPlayer,
  buildRoulettePool,
  chooseAiMove,
  determineTurnActions,
  getWinnerMessage,
  getWinningSide,
  performAttack,
} from "./battle.mjs";
import { loadGameAssets } from "./data.mjs";
import { predictBattle } from "./predictor.mjs";

const AUTO_BATTLE_DELAY_MS = 700;
const MOVE_RESULT_DELAY_MS = 550;
const HP_ANIMATION_DELAY_MS = 35;
const ROULETTE_SLOT_COUNT = 8;
const ROULETTE_BASE_SPIN_STEPS = 22;
const ROULETTE_RESULT_DELAY_MS = 1000;
const INITIAL_WALLET = 100;
const DEFAULT_BET = 10;

const state = {
  gameData: null,
  player: null,
  opponent: null,
  displayHp: { player: 0, opponent: 0 },
  pendingTurnActions: [],
  battleReady: false,
  autoPlaying: false,
  currentPrediction: null,
  wallet: INITIAL_WALLET,
  currentBet: DEFAULT_BET,
  currentBetSide: "player",
  activeBet: null,
  roulettePool: [],
  rouletteOffset: 0,
  rouletteFinalIndex: 0,
  rouletteStepsRemaining: 0,
  rouletteSelectedPokemon: null,
  timers: {
    turn: null,
    hp: null,
    roulette: null,
  },
  hpAnimationCallback: null,
  sessionActive: false,
  stats: {
    rounds: 0,
    wins: 0,
    correctBets: 0,
  },
};

const screens = {};
const dom = {};

function cacheDom() {
  screens.start = document.querySelector("#start-screen");
  screens.roulette = document.querySelector("#roulette-screen");
  screens.game = document.querySelector("#game-screen");
  screens.summary = document.querySelector("#summary-screen");

  dom.statusBanner = document.querySelector("#status-banner");
  dom.startRunButton = document.querySelector("#start-run-button");
  dom.startPikachu = document.querySelector("#start-pikachu");
  dom.rouletteWalletAmount = document.querySelector("#roulette-wallet-amount");
  dom.rouletteHint = document.querySelector("#roulette-hint");
  dom.rouletteResult = document.querySelector("#roulette-result");
  dom.rouletteSlots = [...document.querySelectorAll(".roulette-slot")];

  dom.matchupLabel = document.querySelector("#matchup-label");
  dom.walletAmount = document.querySelector("#wallet-amount");
  dom.walletInlineAmount = document.querySelector("#wallet-inline-amount");
  dom.randomMatchupButton = document.querySelector("#random-matchup-button");
  dom.startBattleButton = document.querySelector("#start-battle-button");
  dom.cashOutButton = document.querySelector("#cash-out-button");
  dom.playerName = document.querySelector("#player-name");
  dom.opponentName = document.querySelector("#opponent-name");
  dom.playerSprite = document.querySelector("#player-sprite");
  dom.opponentSprite = document.querySelector("#opponent-sprite");
  dom.playerHpFill = document.querySelector("#player-hp-fill");
  dom.opponentHpFill = document.querySelector("#opponent-hp-fill");
  dom.playerHpLabel = document.querySelector("#player-hp-label");
  dom.opponentHpLabel = document.querySelector("#opponent-hp-label");
  dom.predictionText = document.querySelector("#prediction-text");
  dom.betPlayerButton = document.querySelector("#bet-player-button");
  dom.betOpponentButton = document.querySelector("#bet-opponent-button");
  dom.betAmount = document.querySelector("#bet-amount");
  dom.betMaxButton = document.querySelector("#bet-max-button");
  dom.betSummary = document.querySelector("#bet-summary");
  dom.roundSummary = document.querySelector("#round-summary");
  dom.battleLog = document.querySelector("#battle-log");

  dom.summaryTitle = document.querySelector("#summary-title");
  dom.summaryCopy = document.querySelector("#summary-copy");
  dom.summaryWallet = document.querySelector("#summary-wallet");
  dom.summaryRounds = document.querySelector("#summary-rounds");
  dom.summaryWins = document.querySelector("#summary-wins");
  dom.summaryBets = document.querySelector("#summary-bets");
  dom.restartRunButton = document.querySelector("#restart-run-button");
}

function attachEvents() {
  dom.startRunButton.addEventListener("click", () => startSession());
  dom.restartRunButton.addEventListener("click", () => startSession());
  dom.randomMatchupButton.addEventListener("click", () => {
    if (!state.autoPlaying && state.sessionActive) {
      beginRouletteFlow();
    }
  });
  dom.startBattleButton.addEventListener("click", () => startBattle());
  dom.cashOutButton.addEventListener("click", () => {
    if (!state.autoPlaying && state.sessionActive) {
      endSession("cashout");
    }
  });
  dom.betPlayerButton.addEventListener("click", () => {
    state.currentBetSide = "player";
    updateBetControls();
  });
  dom.betOpponentButton.addEventListener("click", () => {
    state.currentBetSide = "opponent";
    updateBetControls();
  });
  dom.betAmount.addEventListener("input", () => {
    state.currentBet = normalizeBetAmount();
    updateBetControls();
  });
  dom.betAmount.addEventListener("blur", () => {
    state.currentBet = normalizeBetAmount();
    dom.betAmount.value = String(state.currentBet);
    updateBetControls();
  });
  dom.betMaxButton.addEventListener("click", () => {
    state.currentBet = Math.max(1, state.wallet);
    dom.betAmount.value = String(state.currentBet);
    updateBetControls();
  });
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => {
    screen.classList.toggle("is-active", key === name);
  });
}

function setStatus(message, tone = "") {
  dom.statusBanner.textContent = message;
  dom.statusBanner.className = "status-banner";
  if (tone) {
    dom.statusBanner.classList.add(tone);
  }
}

function updateWalletDisplays() {
  const walletText = formatMoney(state.wallet);
  dom.walletAmount.textContent = walletText;
  dom.walletInlineAmount.textContent = walletText;
  dom.rouletteWalletAmount.textContent = walletText;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, amount));
}

function showRoundSummary(message) {
  dom.roundSummary.textContent = message;
}

function clearLog() {
  dom.battleLog.innerHTML = "";
}

function appendLog(message) {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = message;
  dom.battleLog.append(entry);
  dom.battleLog.scrollTop = dom.battleLog.scrollHeight;
}

function setTimer(key, delay, callback) {
  clearTimer(key);
  state.timers[key] = window.setTimeout(() => {
    state.timers[key] = null;
    callback();
  }, delay);
}

function clearTimer(key) {
  if (state.timers[key] !== null) {
    window.clearTimeout(state.timers[key]);
    state.timers[key] = null;
  }
}

function clearAllTimers() {
  clearTimer("turn");
  clearTimer("hp");
  clearTimer("roulette");
}

function stopBattle() {
  state.autoPlaying = false;
  state.battleReady = false;
  state.pendingTurnActions = [];
  state.hpAnimationCallback = null;
  clearTimer("turn");
  clearTimer("hp");
  updateActionButtons();
}

function startSession() {
  clearAllTimers();
  state.wallet = INITIAL_WALLET;
  state.currentBet = DEFAULT_BET;
  state.currentBetSide = "player";
  state.activeBet = null;
  state.sessionActive = true;
  state.stats = { rounds: 0, wins: 0, correctBets: 0 };
  state.player = null;
  state.opponent = null;
  state.currentPrediction = null;
  updateWalletDisplays();
  beginRouletteFlow();
}

function beginRouletteFlow() {
  stopBattle();
  state.rouletteSelectedPokemon = randomChoice(state.gameData.pokemon);
  const rouletteSetup = buildRoulettePool(state.gameData.pokemon, state.rouletteSelectedPokemon, ROULETTE_SLOT_COUNT);
  state.roulettePool = rouletteSetup.pool;
  state.rouletteFinalIndex = rouletteSetup.finalIndex;
  state.rouletteOffset = Math.floor(Math.random() * ROULETTE_SLOT_COUNT);

  const stepGoal = ROULETTE_BASE_SPIN_STEPS + Math.floor(Math.random() * ROULETTE_SLOT_COUNT);
  const rotationCorrection = (state.rouletteFinalIndex - ((state.rouletteOffset + stepGoal) % ROULETTE_SLOT_COUNT) + ROULETTE_SLOT_COUNT) % ROULETTE_SLOT_COUNT;
  state.rouletteStepsRemaining = stepGoal + rotationCorrection;

  dom.rouletteResult.textContent = "";
  dom.rouletteHint.textContent = "Spinning to choose your Pokemon...";
  updateWalletDisplays();
  redrawRouletteWheel();
  showScreen("roulette");
  advanceRoulette();
}

function advanceRoulette() {
  if (state.rouletteStepsRemaining <= 0) {
    finishRouletteSpin();
    return;
  }

  state.rouletteOffset = (state.rouletteOffset + 1) % ROULETTE_SLOT_COUNT;
  state.rouletteStepsRemaining -= 1;
  redrawRouletteWheel();

  const delay = state.rouletteStepsRemaining > 12 ? 65 : state.rouletteStepsRemaining > 6 ? 95 : 130;
  setTimer("roulette", delay, advanceRoulette);
}

function redrawRouletteWheel() {
  state.roulettePool.forEach((_, slotIndex) => {
    const displayedPokemon = state.roulettePool[(state.rouletteOffset + slotIndex) % state.roulettePool.length];
    const slot = dom.rouletteSlots[slotIndex];
    const image = slot.querySelector("img");
    const label = slot.querySelector("span");
    image.src = displayedPokemon.frontSprite;
    image.alt = `${displayedPokemon.name} sprite`;
    label.textContent = displayedPokemon.name;
  });
}

function finishRouletteSpin() {
  state.rouletteOffset = state.rouletteFinalIndex;
  redrawRouletteWheel();
  dom.rouletteResult.textContent = `You got ${state.rouletteSelectedPokemon.name}!`;
  dom.rouletteHint.textContent = "Getting the battle ready...";
  setTimer("roulette", ROULETTE_RESULT_DELAY_MS, () => prepareMatchupForPlayer(state.rouletteSelectedPokemon));
}

function prepareMatchupForPlayer(playerSpecies) {
  const matchup = buildMatchupForPlayer(state.gameData, playerSpecies);
  state.player = matchup.player;
  state.opponent = matchup.opponent;
  state.displayHp = {
    player: state.player.currentHp,
    opponent: state.opponent.currentHp,
  };
  state.battleReady = true;
  state.autoPlaying = false;
  state.pendingTurnActions = [];
  state.activeBet = null;
  state.currentPrediction = predictBattle(state.gameData.battleModel, state.player, state.opponent);

  dom.matchupLabel.textContent = `${state.player.name} vs ${state.opponent.name}`;
  clearLog();
  appendLog(`Roulette selected ${state.player.name}.`);
  appendLog(`Opponent chosen: ${state.opponent.name}.`);
  appendLog(predictionMessage());
  appendLog("Lock in a bet, then press Start Battle to watch the fight play out.");
  showRoundSummary("Bet on either side before the battle starts. Winnings pay even money.");

  syncBetWithWallet();
  updateBattlefield();
  updateBetControls();
  updateActionButtons();
  showScreen("game");
}

function predictionMessage() {
  if (!state.currentPrediction) {
    return "ML prediction unavailable.";
  }
  return `ML prediction: ${state.currentPrediction.predictedWinner} has a ${(state.currentPrediction.confidence * 100).toFixed(1)}% chance to win.`;
}

function normalizeBetAmount() {
  const parsed = Number.parseInt(dom.betAmount.value, 10);
  if (!Number.isFinite(parsed)) {
    return clampBet(DEFAULT_BET);
  }
  return clampBet(parsed);
}

function clampBet(value) {
  const walletCap = Math.max(1, state.wallet);
  return Math.min(walletCap, Math.max(1, value));
}

function syncBetWithWallet() {
  state.currentBet = clampBet(state.currentBet);
  dom.betAmount.value = String(state.currentBet);
}

function betTargetName(side) {
  if (side === "opponent") {
    return state.opponent?.name ?? "Opponent";
  }
  return state.player?.name ?? "Your Pokemon";
}

function updateBetControls() {
  syncBetWithWallet();
  dom.betAmount.max = String(Math.max(1, state.wallet));
  dom.betPlayerButton.classList.toggle("is-selected", state.currentBetSide === "player");
  dom.betOpponentButton.classList.toggle("is-selected", state.currentBetSide === "opponent");
  dom.betPlayerButton.textContent = state.player ? `Bet ${state.player.name}` : "Your Pokemon";
  dom.betOpponentButton.textContent = state.opponent ? `Bet ${state.opponent.name}` : "Opponent";
  dom.predictionText.textContent = predictionMessage();
  dom.betSummary.textContent = `Bet ${formatMoney(state.currentBet)} on ${betTargetName(state.currentBetSide)}. A correct pick wins the same amount.`;
}

function updateActionButtons() {
  const canSpin = state.sessionActive && !state.autoPlaying && state.wallet > 0;
  const canStartBattle = state.battleReady && !state.autoPlaying && state.wallet > 0;

  dom.randomMatchupButton.disabled = !canSpin;
  dom.startBattleButton.disabled = !canStartBattle;
  dom.cashOutButton.disabled = !state.sessionActive || state.autoPlaying || state.wallet <= 0;
  dom.betAmount.disabled = !canStartBattle;
  dom.betPlayerButton.disabled = !canStartBattle;
  dom.betOpponentButton.disabled = !canStartBattle;
  dom.betMaxButton.disabled = !canStartBattle;
}

function hpFillColor(percentage) {
  if (percentage > 0.5) {
    return "var(--ok)";
  }
  if (percentage > 0.2) {
    return "var(--warn)";
  }
  return "var(--bad)";
}

function applyPokemonToField(side, pokemon, shownHp) {
  const isPlayer = side === "player";
  const nameNode = isPlayer ? dom.playerName : dom.opponentName;
  const spriteNode = isPlayer ? dom.playerSprite : dom.opponentSprite;
  const hpFillNode = isPlayer ? dom.playerHpFill : dom.opponentHpFill;
  const hpLabelNode = isPlayer ? dom.playerHpLabel : dom.opponentHpLabel;

  if (!pokemon) {
    nameNode.textContent = isPlayer ? "Player" : "Opponent";
    spriteNode.removeAttribute("src");
    hpFillNode.style.width = "0%";
    hpLabelNode.textContent = "0/0";
    return;
  }

  nameNode.textContent = pokemon.name;
  spriteNode.src = isPlayer ? pokemon.species.backSprite : pokemon.species.frontSprite;
  const ratio = pokemon.maxHp <= 0 ? 0 : Math.max(0, Math.min(1, shownHp / pokemon.maxHp));
  hpFillNode.style.width = `${ratio * 100}%`;
  hpFillNode.style.backgroundColor = hpFillColor(ratio);
  hpLabelNode.textContent = `${Math.round(shownHp)}/${pokemon.maxHp}`;
}

function updateBattlefield() {
  applyPokemonToField("player", state.player, state.displayHp.player);
  applyPokemonToField("opponent", state.opponent, state.displayHp.opponent);
}

function startBattle() {
  if (!state.battleReady || !state.player || !state.opponent || state.wallet <= 0) {
    return;
  }

  state.currentBet = normalizeBetAmount();
  dom.betAmount.value = String(state.currentBet);
  state.activeBet = {
    amount: state.currentBet,
    side: state.currentBetSide,
    targetName: betTargetName(state.currentBetSide),
  };
  state.battleReady = false;
  state.autoPlaying = true;
  state.pendingTurnActions = [];
  state.hpAnimationCallback = null;

  appendLog(`Bet locked: ${formatMoney(state.activeBet.amount)} on ${state.activeBet.targetName}.`);
  appendLog("Battle started.");
  showRoundSummary(`Battle in progress. Current bet: ${formatMoney(state.activeBet.amount)} on ${state.activeBet.targetName}.`);
  updateActionButtons();
  setTimer("turn", AUTO_BATTLE_DELAY_MS, autoPlayStep);
}

function autoPlayStep() {
  if (!state.autoPlaying || !state.player || !state.opponent) {
    return;
  }

  if (battleOver()) {
    finishAutoBattle();
    return;
  }

  if (state.pendingTurnActions.length === 0) {
    const playerMove = chooseAiMove(state.player, state.opponent);
    const opponentMove = chooseAiMove(state.opponent, state.player);
    state.pendingTurnActions = determineTurnActions(state.player, state.opponent, playerMove, opponentMove);
  }

  playNextTurnAction();
}

function playNextTurnAction() {
  if (!state.autoPlaying || !state.player || !state.opponent) {
    return;
  }

  if (battleOver()) {
    finishAutoBattle();
    return;
  }

  while (state.pendingTurnActions.length > 0) {
    const [attacker, defender, move] = state.pendingTurnActions.shift();
    if (attacker.isFainted || defender.isFainted) {
      continue;
    }

    for (const note of performAttack(attacker, defender, move)) {
      appendLog(note);
    }

    updateBattlefield();
    if (hpAnimationNeeded()) {
      state.hpAnimationCallback = afterMoveResolution;
      scheduleHpAnimation();
    } else {
      setTimer("turn", MOVE_RESULT_DELAY_MS, afterMoveResolution);
    }
    return;
  }

  if (battleOver()) {
    finishAutoBattle();
    return;
  }

  setTimer("turn", AUTO_BATTLE_DELAY_MS, autoPlayStep);
}

function afterMoveResolution() {
  state.hpAnimationCallback = null;
  if (!state.autoPlaying) {
    return;
  }

  if (battleOver()) {
    finishAutoBattle();
    return;
  }

  if (state.pendingTurnActions.length > 0) {
    setTimer("turn", MOVE_RESULT_DELAY_MS, playNextTurnAction);
    return;
  }

  setTimer("turn", AUTO_BATTLE_DELAY_MS, autoPlayStep);
}

function scheduleHpAnimation() {
  if (state.timers.hp !== null || !hpAnimationNeeded()) {
    return;
  }
  setTimer("hp", HP_ANIMATION_DELAY_MS, animateHpStep);
}

function hpAnimationNeeded() {
  if (!state.player || !state.opponent) {
    return false;
  }
  return Math.abs(state.displayHp.player - state.player.currentHp) > 0.25
    || Math.abs(state.displayHp.opponent - state.opponent.currentHp) > 0.25;
}

function nextDisplayHp(current, target) {
  if (Math.abs(target - current) <= 0.25) {
    return target;
  }
  const step = Math.max(1, Math.abs(target - current) * 0.22);
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

function animateHpStep() {
  if (!state.player || !state.opponent) {
    return;
  }

  state.displayHp.player = nextDisplayHp(state.displayHp.player, state.player.currentHp);
  state.displayHp.opponent = nextDisplayHp(state.displayHp.opponent, state.opponent.currentHp);
  updateBattlefield();

  if (hpAnimationNeeded()) {
    setTimer("hp", HP_ANIMATION_DELAY_MS, animateHpStep);
    return;
  }

  if (state.hpAnimationCallback) {
    const callback = state.hpAnimationCallback;
    state.hpAnimationCallback = null;
    callback();
  }
}

function battleOver() {
  return Boolean(state.player && state.opponent && (state.player.isFainted || state.opponent.isFainted));
}

function finishAutoBattle() {
  state.autoPlaying = false;
  state.pendingTurnActions = [];
  state.hpAnimationCallback = null;
  clearTimer("turn");
  clearTimer("hp");
  updateBattlefield();

  const winnerMessage = getWinnerMessage(state.player, state.opponent);
  if (winnerMessage) {
    appendLog(winnerMessage);
  }
  settleBet();
  updateActionButtons();
}

function settleBet() {
  if (!state.player || !state.opponent || !state.activeBet) {
    return;
  }

  const winningSide = getWinningSide(state.player, state.opponent);
  const betWon = state.activeBet.side === winningSide;
  const winningPokemon = winningSide === "player" ? state.player.name : state.opponent.name;

  state.stats.rounds += 1;
  if (winningSide === "player") {
    state.stats.wins += 1;
  }
  if (betWon) {
    state.stats.correctBets += 1;
    state.wallet += state.activeBet.amount;
    appendLog(`Bet won! ${winningPokemon} paid out ${formatMoney(state.activeBet.amount)} Pokedollars.`);
    showRoundSummary(`You won the wager and now have ${formatMoney(state.wallet)} Pokedollars. Spin for the next matchup or cash out.`);
  } else {
    state.wallet = Math.max(0, state.wallet - state.activeBet.amount);
    appendLog(`Bet lost. ${formatMoney(state.activeBet.amount)} Pokedollars left your wallet.`);
    showRoundSummary(`The wager missed. Wallet now at ${formatMoney(state.wallet)} Pokedollars.`);
  }

  appendLog(`Wallet total: ${formatMoney(state.wallet)} Pokedollars.`);
  state.activeBet = null;
  updateWalletDisplays();
  syncBetWithWallet();
  updateBetControls();

  if (state.wallet <= 0) {
    showRoundSummary("You ran out of money. This run is over.");
    setTimer("turn", 1200, () => endSession("bankrupt"));
    return;
  }

  state.battleReady = false;
}

function endSession(reason) {
  clearAllTimers();
  state.sessionActive = false;
  state.autoPlaying = false;
  state.battleReady = false;
  updateActionButtons();
  updateSummary(reason);
  showScreen("summary");
}

function updateSummary(reason) {
  const walletText = `${formatMoney(state.wallet)} Pokedollars`;
  if (reason === "bankrupt") {
    dom.summaryTitle.textContent = "Out of Pokedollars";
    dom.summaryCopy.textContent = `The betting run ended because your wallet hit 0. You played ${state.stats.rounds} battle${state.stats.rounds === 1 ? "" : "s"} before the bankroll ran dry.`;
  } else {
    dom.summaryTitle.textContent = "You Cashed Out";
    dom.summaryCopy.textContent = `You backed out with ${walletText}. Jump back in for another run whenever you want.`;
  }

  dom.summaryWallet.textContent = walletText;
  dom.summaryRounds.textContent = String(state.stats.rounds);
  dom.summaryWins.textContent = String(state.stats.wins);
  dom.summaryBets.textContent = String(state.stats.correctBets);
}

function randomChoice(values) {
  return values[Math.floor(Math.random() * values.length)];
}

async function initialize() {
  cacheDom();
  attachEvents();
  updateWalletDisplays();
  updateActionButtons();

  try {
    state.gameData = await loadGameAssets();
    const pikachu = state.gameData.pokemonByName.get("pikachu");
    if (pikachu) {
      dom.startPikachu.src = pikachu.frontSprite;
    }
    dom.startRunButton.disabled = false;
    setStatus("Battle data loaded. Start your run when you're ready.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Could not load the website data files. Run this project from a local web server.", "error");
  }
}

initialize();
