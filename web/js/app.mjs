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
  lastOutcome: null,
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
    betStreak: 0,
    bestBetStreak: 0,
    bestWallet: INITIAL_WALLET,
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
  dom.battleStateCard = document.querySelector("#battle-state-card");
  dom.battleStateLabel = document.querySelector("#battle-state-label");
  dom.hudRound = document.querySelector("#hud-round");
  dom.hudWins = document.querySelector("#hud-wins");
  dom.hudBets = document.querySelector("#hud-bets");
  dom.hudStreak = document.querySelector("#hud-streak");
  dom.arenaTitle = document.querySelector("#arena-title");

  dom.predictionFavored = document.querySelector("#prediction-favored");
  dom.predictionPlayerName = document.querySelector("#prediction-player-name");
  dom.predictionOpponentName = document.querySelector("#prediction-opponent-name");
  dom.predictionPlayerChance = document.querySelector("#prediction-player-chance");
  dom.predictionOpponentChance = document.querySelector("#prediction-opponent-chance");
  dom.predictionBarFill = document.querySelector("#prediction-bar-fill");
  dom.predictionText = document.querySelector("#prediction-text");
  dom.betPlayerButton = document.querySelector("#bet-player-button");
  dom.betOpponentButton = document.querySelector("#bet-opponent-button");
  dom.betAmount = document.querySelector("#bet-amount");
  dom.betMaxButton = document.querySelector("#bet-max-button");
  dom.quickBetButtons = [...document.querySelectorAll(".quick-bet-button")];
  dom.betSummary = document.querySelector("#bet-summary");
  dom.phasePill = document.querySelector("#phase-pill");
  dom.betLockLabel = document.querySelector("#bet-lock-label");
  dom.roundSummary = document.querySelector("#round-summary");
  dom.battleLog = document.querySelector("#battle-log");

  dom.previewCards = {
    player: {
      card: document.querySelector("#matchup-card-player"),
      sprite: document.querySelector("#preview-player-sprite"),
      name: document.querySelector("#preview-player-name"),
      types: document.querySelector("#preview-player-types"),
      hp: document.querySelector("#preview-player-hp"),
      attack: document.querySelector("#preview-player-attack"),
      speed: document.querySelector("#preview-player-speed"),
      total: document.querySelector("#preview-player-total"),
    },
    opponent: {
      card: document.querySelector("#matchup-card-opponent"),
      sprite: document.querySelector("#preview-opponent-sprite"),
      name: document.querySelector("#preview-opponent-name"),
      types: document.querySelector("#preview-opponent-types"),
      hp: document.querySelector("#preview-opponent-hp"),
      attack: document.querySelector("#preview-opponent-attack"),
      speed: document.querySelector("#preview-opponent-speed"),
      total: document.querySelector("#preview-opponent-total"),
    },
  };

  dom.summaryTitle = document.querySelector("#summary-title");
  dom.summaryCopy = document.querySelector("#summary-copy");
  dom.summaryWallet = document.querySelector("#summary-wallet");
  dom.summaryNet = document.querySelector("#summary-net");
  dom.summaryRounds = document.querySelector("#summary-rounds");
  dom.summaryWins = document.querySelector("#summary-wins");
  dom.summaryBets = document.querySelector("#summary-bets");
  dom.summaryAccuracy = document.querySelector("#summary-accuracy");
  dom.summaryBestWallet = document.querySelector("#summary-best-wallet");
  dom.summaryBestStreak = document.querySelector("#summary-best-streak");
  dom.restartRunButton = document.querySelector("#restart-run-button");
}

function attachEvents() {
  dom.startRunButton.addEventListener("click", () => startSession());
  dom.restartRunButton.addEventListener("click", () => startSession());
  dom.randomMatchupButton.addEventListener("click", () => {
    if (!state.autoPlaying && state.sessionActive && !state.battleReady) {
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
    refreshInterface();
  });
  dom.betOpponentButton.addEventListener("click", () => {
    state.currentBetSide = "opponent";
    refreshInterface();
  });
  dom.betAmount.addEventListener("input", () => {
    state.currentBet = normalizeBetAmount();
    refreshInterface();
  });
  dom.betAmount.addEventListener("blur", () => {
    state.currentBet = normalizeBetAmount();
    dom.betAmount.value = String(state.currentBet);
    refreshInterface();
  });
  dom.betMaxButton.addEventListener("click", () => {
    state.currentBet = Math.max(0, state.wallet);
    dom.betAmount.value = String(state.currentBet);
    refreshInterface();
  });

  for (const button of dom.quickBetButtons) {
    button.addEventListener("click", () => {
      const amount = Number.parseInt(button.dataset.betAmount ?? "", 10);
      if (!Number.isFinite(amount)) {
        return;
      }
      state.currentBet = clampBet(amount);
      dom.betAmount.value = String(state.currentBet);
      refreshInterface();
    });
  }
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

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(amount)));
}

function formatSignedMoney(amount) {
  const rounded = Math.round(amount);
  if (rounded === 0) {
    return "0";
  }
  return `${rounded > 0 ? "+" : "-"}${formatMoney(Math.abs(rounded))}`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function statTotal(species) {
  return species.hp + species.attack + species.defense + species.spAttack + species.spDefense + species.speed;
}

function currentRoundNumber() {
  if (!state.sessionActive) {
    return 0;
  }
  return state.stats.rounds + 1;
}

function updateWalletDisplays() {
  const walletText = formatMoney(state.wallet);
  dom.walletAmount.textContent = walletText;
  dom.walletInlineAmount.textContent = walletText;
  dom.rouletteWalletAmount.textContent = walletText;
}

function updateHudDisplays() {
  dom.hudRound.textContent = String(currentRoundNumber());
  dom.hudWins.textContent = String(state.stats.wins);
  dom.hudBets.textContent = String(state.stats.correctBets);
  dom.hudStreak.textContent = String(state.stats.betStreak);
}

function showRoundSummary(message) {
  dom.roundSummary.textContent = message;
}

function clearLog() {
  dom.battleLog.innerHTML = "";
}

function classifyLogKind(message) {
  const lowered = message.toLowerCase();
  if (lowered.includes("machine read") || lowered.includes("ml prediction")) {
    return "prediction";
  }
  if (lowered.includes("bet ") || lowered.includes("wallet")) {
    return "bet";
  }
  if (
    lowered.includes("used ")
    || lowered.includes("super effective")
    || lowered.includes("critical hit")
    || lowered.includes("damage")
    || lowered.includes("attack missed")
    || lowered.includes("the attack missed")
  ) {
    return "battle";
  }
  if (lowered.includes("you win") || lowered.includes("you lost") || lowered.includes("fainted")) {
    return "result";
  }
  return "system";
}

function appendLog(message, kind = "") {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.classList.add(`is-${kind || classifyLogKind(message)}`);
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
  updateBattleStateDisplay();
}

function refreshInterface() {
  updateWalletDisplays();
  updateHudDisplays();
  updatePredictionPanel();
  updateBetControls();
  updatePreviewCards();
  updateActionButtons();
  updateBattleStateDisplay();
}

function startSession() {
  clearAllTimers();
  state.wallet = INITIAL_WALLET;
  state.currentBet = DEFAULT_BET;
  state.currentBetSide = "player";
  state.activeBet = null;
  state.sessionActive = true;
  state.player = null;
  state.opponent = null;
  state.currentPrediction = null;
  state.lastOutcome = null;
  state.stats = {
    rounds: 0,
    wins: 0,
    correctBets: 0,
    betStreak: 0,
    bestBetStreak: 0,
    bestWallet: INITIAL_WALLET,
  };
  clearLog();
  refreshInterface();
  beginRouletteFlow();
}

function beginRouletteFlow() {
  stopBattle();
  state.activeBet = null;
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
  state.lastOutcome = null;
  state.currentPrediction = predictBattle(state.gameData.battleModel, state.player, state.opponent);

  dom.matchupLabel.textContent = `${state.player.name} vs ${state.opponent.name}`;
  clearLog();
  appendLog(`Roulette locked in ${state.player.name}.`, "system");
  appendLog(`Opponent drawn: ${state.opponent.name}.`, "system");
  appendLog(predictionMessage(), "prediction");
  appendLog("Pick a side, set your wager, and press Watch Battle to let the machine resolve the round.", "system");
  showRoundSummary("This matchup is locked. Set your wager, then press Watch Battle to start the auto battle.");

  syncBetWithWallet();
  updateBattlefield();
  refreshInterface();
  showScreen("game");
}

function predictionMessage() {
  if (!state.currentPrediction) {
    return "ML prediction unavailable.";
  }
  const playerChance = formatPercent(state.currentPrediction.firstWinProbability);
  const opponentChance = formatPercent(state.currentPrediction.secondWinProbability);
  return `Machine read: ${state.player.name} ${playerChance}, ${state.opponent.name} ${opponentChance}.`;
}

function normalizeBetAmount() {
  const parsed = Number.parseInt(dom.betAmount.value, 10);
  if (!Number.isFinite(parsed)) {
    return clampBet(DEFAULT_BET);
  }
  return clampBet(parsed);
}

function clampBet(value) {
  const walletCap = Math.max(0, state.wallet);
  if (walletCap === 0) {
    return 0;
  }
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

function selectedBetSide() {
  return state.activeBet?.side ?? state.currentBetSide;
}

function renderTypeChips(container, types) {
  container.replaceChildren();
  for (const type of types) {
    const chip = document.createElement("span");
    chip.className = `type-chip type-${String(type).toLowerCase()}`;
    chip.textContent = type;
    container.append(chip);
  }
}

function populatePreviewCard(side, pokemon) {
  const preview = dom.previewCards[side];
  preview.card.classList.toggle("is-selected", Boolean(pokemon) && selectedBetSide() === side);

  if (!pokemon) {
    preview.sprite.removeAttribute("src");
    preview.sprite.alt = "";
    preview.name.textContent = side === "player" ? "Waiting for a spin" : "Waiting for an opponent";
    preview.types.replaceChildren();
    preview.hp.textContent = "0";
    preview.attack.textContent = "0";
    preview.speed.textContent = "0";
    preview.total.textContent = "0";
    return;
  }

  preview.sprite.src = side === "player" ? pokemon.species.backSprite : pokemon.species.frontSprite;
  preview.sprite.alt = `${pokemon.name} preview sprite`;
  preview.name.textContent = pokemon.name;
  renderTypeChips(preview.types, pokemon.types);
  preview.hp.textContent = String(pokemon.species.hp);
  preview.attack.textContent = String(pokemon.species.attack);
  preview.speed.textContent = String(pokemon.species.speed);
  preview.total.textContent = String(statTotal(pokemon.species));
}

function updatePreviewCards() {
  populatePreviewCard("player", state.player);
  populatePreviewCard("opponent", state.opponent);
}

function updatePredictionPanel() {
  if (!state.player || !state.opponent || !state.currentPrediction) {
    dom.predictionFavored.textContent = "No matchup loaded";
    dom.predictionPlayerName.textContent = "Your Pokemon";
    dom.predictionOpponentName.textContent = "Opponent";
    dom.predictionPlayerChance.textContent = "50.0%";
    dom.predictionOpponentChance.textContent = "50.0%";
    dom.predictionBarFill.style.width = "50%";
    dom.predictionBarFill.style.background = "linear-gradient(90deg, rgba(62, 199, 111, 0.95), rgba(129, 212, 102, 0.92))";
    dom.predictionText.textContent = "ML prediction unavailable.";
    return;
  }

  const playerChance = state.currentPrediction.firstWinProbability;
  const opponentChance = state.currentPrediction.secondWinProbability;
  const favoredName = playerChance >= opponentChance ? state.player.name : state.opponent.name;

  dom.predictionFavored.textContent = `Machine leans ${favoredName}`;
  dom.predictionPlayerName.textContent = state.player.name;
  dom.predictionOpponentName.textContent = state.opponent.name;
  dom.predictionPlayerChance.textContent = formatPercent(playerChance);
  dom.predictionOpponentChance.textContent = formatPercent(opponentChance);
  dom.predictionBarFill.style.width = `${(playerChance * 100).toFixed(1)}%`;
  dom.predictionBarFill.style.background = playerChance >= opponentChance
    ? "linear-gradient(90deg, rgba(62, 199, 111, 0.95), rgba(129, 212, 102, 0.92))"
    : "linear-gradient(90deg, rgba(245, 197, 66, 0.95), rgba(230, 108, 68, 0.92))";
  dom.predictionText.textContent = `${state.currentPrediction.predictedWinner} is projected to win with ${formatPercent(state.currentPrediction.confidence)} confidence.`;
}

function updateQuickBetButtons() {
  for (const button of dom.quickBetButtons) {
    const amount = Number.parseInt(button.dataset.betAmount ?? "", 10);
    button.classList.toggle("is-selected", Number.isFinite(amount) && amount === state.currentBet);
  }
}

function updateBetControls() {
  syncBetWithWallet();
  dom.betAmount.min = state.wallet > 0 ? "1" : "0";
  dom.betAmount.max = String(Math.max(0, state.wallet));
  dom.betPlayerButton.classList.toggle("is-selected", selectedBetSide() === "player");
  dom.betOpponentButton.classList.toggle("is-selected", selectedBetSide() === "opponent");
  dom.betPlayerButton.textContent = state.player?.name ?? "Your Pokemon";
  dom.betOpponentButton.textContent = state.opponent?.name ?? "Opponent";
  updateQuickBetButtons();

  if (!state.player || !state.opponent) {
    dom.betSummary.textContent = "Roulette will lock in your Pokemon before the betting desk opens.";
    return;
  }

  if (state.activeBet) {
    dom.betSummary.textContent = `Locked ${formatMoney(state.activeBet.amount)} on ${state.activeBet.targetName}. Sit back and watch the auto battle resolve.`;
    return;
  }

  if (state.wallet <= 0) {
    dom.betSummary.textContent = "The wallet is empty. This run is finished.";
    return;
  }

  if (!state.battleReady && state.lastOutcome) {
    dom.betSummary.textContent = "Round settled. Spin the next matchup to open a new wager.";
    return;
  }

  dom.betSummary.textContent = `Bet ${formatMoney(state.currentBet)} on ${betTargetName(state.currentBetSide)}. A correct pick wins the same amount.`;
}

function phaseSnapshot() {
  if (!state.sessionActive) {
    return {
      label: "Idle",
      tone: "",
      arena: "Spin a matchup to open the betting desk.",
      lock: "No active wager",
    };
  }

  if (state.wallet <= 0 && !state.autoPlaying) {
    return {
      label: "Bankrupt",
      tone: "is-loss",
      arena: "The bankroll is empty. This run is about to close out.",
      lock: "Wallet empty",
    };
  }

  if (state.autoPlaying && state.activeBet) {
    return {
      label: "Battle Live",
      tone: "is-live",
      arena: `${state.player.name} and ${state.opponent.name} are fighting automatically.`,
      lock: `Locked: ${formatMoney(state.activeBet.amount)} on ${state.activeBet.targetName}`,
    };
  }

  if (state.battleReady && state.player && state.opponent) {
    return {
      label: "Bet Open",
      tone: "is-open",
      arena: "Review the matchup, set your wager, and press Watch Battle when you are ready.",
      lock: `Ready: ${formatMoney(state.currentBet)} on ${betTargetName(state.currentBetSide)}`,
    };
  }

  if (state.lastOutcome) {
    return {
      label: state.lastOutcome.betWon ? "Round Won" : "Round Lost",
      tone: state.lastOutcome.betWon ? "is-win" : "is-loss",
      arena: `${state.lastOutcome.winningPokemon} took the round. Spin the next matchup or cash out.`,
      lock: `${state.lastOutcome.betWon ? "Last payout" : "Last loss"}: ${formatMoney(state.lastOutcome.amount)}`,
    };
  }

  return {
    label: "Between Rounds",
    tone: "",
    arena: "Spin the next matchup to keep the run going.",
    lock: "No active wager",
  };
}

function updateBattleStateDisplay() {
  const snapshot = phaseSnapshot();
  dom.battleStateCard.className = "state-pill";
  dom.phasePill.className = "phase-pill";
  if (snapshot.tone) {
    dom.battleStateCard.classList.add(snapshot.tone);
    dom.phasePill.classList.add(snapshot.tone);
  }
  dom.battleStateLabel.textContent = snapshot.label;
  dom.phasePill.textContent = snapshot.label;
  dom.arenaTitle.textContent = snapshot.arena;
  dom.betLockLabel.textContent = snapshot.lock;
}

function updateActionButtons() {
  const canSpin = state.sessionActive && !state.autoPlaying && !state.battleReady && state.wallet > 0;
  const canStartBattle = state.battleReady && !state.autoPlaying && state.wallet > 0 && state.currentBet > 0;

  dom.randomMatchupButton.disabled = !canSpin;
  dom.startBattleButton.disabled = !canStartBattle;
  dom.cashOutButton.disabled = !state.sessionActive || state.autoPlaying || state.wallet <= 0;
  dom.betAmount.disabled = !canStartBattle;
  dom.betPlayerButton.disabled = !canStartBattle;
  dom.betOpponentButton.disabled = !canStartBattle;
  dom.betMaxButton.disabled = !canStartBattle;
  for (const button of dom.quickBetButtons) {
    button.disabled = !canStartBattle;
  }

  if (state.autoPlaying) {
    dom.randomMatchupButton.textContent = "Battle Running";
  } else if (state.battleReady) {
    dom.randomMatchupButton.textContent = "Matchup Locked";
  } else {
    dom.randomMatchupButton.textContent = state.stats.rounds > 0 ? "Next Matchup" : "Spin Matchup";
  }

  dom.startBattleButton.textContent = state.autoPlaying ? "Watching..." : "Watch Battle";
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
  if (state.currentBet <= 0) {
    return;
  }

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
  state.lastOutcome = null;

  appendLog(`Bet locked: ${formatMoney(state.activeBet.amount)} on ${state.activeBet.targetName}.`, "bet");
  appendLog("Battle started. Watching the machine resolve the round...", "system");
  showRoundSummary(`Auto battle in progress. Current wager: ${formatMoney(state.activeBet.amount)} on ${state.activeBet.targetName}.`);
  refreshInterface();
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
      appendLog(note, "battle");
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
    appendLog(winnerMessage, "result");
  }
  settleBet();
  refreshInterface();
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
    state.stats.betStreak += 1;
    state.stats.bestBetStreak = Math.max(state.stats.bestBetStreak, state.stats.betStreak);
    state.wallet += state.activeBet.amount;
    appendLog(`Bet won! ${winningPokemon} paid out ${formatMoney(state.activeBet.amount)} Pokedollars.`, "bet");
    showRoundSummary(`You hit the wager and now have ${formatMoney(state.wallet)} Pokedollars. Spin the next matchup or cash out.`);
  } else {
    state.stats.betStreak = 0;
    state.wallet = Math.max(0, state.wallet - state.activeBet.amount);
    appendLog(`Bet lost. ${formatMoney(state.activeBet.amount)} Pokedollars left your wallet.`, "bet");
    showRoundSummary(`The wager missed. Wallet now at ${formatMoney(state.wallet)} Pokedollars.`);
  }

  state.stats.bestWallet = Math.max(state.stats.bestWallet, state.wallet);
  state.lastOutcome = {
    winningSide,
    winningPokemon,
    betWon,
    amount: state.activeBet.amount,
  };

  appendLog(`Wallet total: ${formatMoney(state.wallet)} Pokedollars.`, "bet");
  state.activeBet = null;
  state.battleReady = false;

  if (state.wallet <= 0) {
    showRoundSummary("You ran out of money. This run is over.");
    refreshInterface();
    setTimer("turn", 1200, () => endSession("bankrupt"));
  }
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
  const netChange = state.wallet - INITIAL_WALLET;
  const accuracy = state.stats.rounds === 0 ? "0%" : `${Math.round((state.stats.correctBets / state.stats.rounds) * 100)}%`;

  if (reason === "bankrupt") {
    dom.summaryTitle.textContent = "Out of Pokedollars";
    dom.summaryCopy.textContent = `The cabinet cleaned out the bankroll after ${state.stats.rounds} battle${state.stats.rounds === 1 ? "" : "s"}.`;
  } else {
    dom.summaryTitle.textContent = "You Cashed Out";
    dom.summaryCopy.textContent = `You walked away with ${walletText} and a best streak of ${state.stats.bestBetStreak}.`;
  }

  dom.summaryWallet.textContent = walletText;
  dom.summaryNet.textContent = `${formatSignedMoney(netChange)} Pokedollars`;
  dom.summaryRounds.textContent = String(state.stats.rounds);
  dom.summaryWins.textContent = String(state.stats.wins);
  dom.summaryBets.textContent = String(state.stats.correctBets);
  dom.summaryAccuracy.textContent = accuracy;
  dom.summaryBestWallet.textContent = `${formatMoney(state.stats.bestWallet)} Pokedollars`;
  dom.summaryBestStreak.textContent = String(state.stats.bestBetStreak);
}

function randomChoice(values) {
  return values[Math.floor(Math.random() * values.length)];
}

async function initialize() {
  cacheDom();
  attachEvents();
  refreshInterface();
  updateBattlefield();

  try {
    state.gameData = await loadGameAssets();
    const pikachu = state.gameData.pokemonByName.get("pikachu");
    if (pikachu) {
      dom.startPikachu.src = pikachu.frontSprite;
      dom.startPikachu.alt = `${pikachu.name} preview sprite`;
    }
    dom.startRunButton.disabled = false;
    setStatus("Battle data loaded. Start your run when you're ready.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Could not load the website data files. Run this project from a local web server.", "error");
  }
}

initialize();
