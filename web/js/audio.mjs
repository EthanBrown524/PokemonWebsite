const TYPE_ORDER = [
  "Normal",
  "Fire",
  "Water",
  "Electric",
  "Grass",
  "Ice",
  "Fighting",
  "Poison",
  "Ground",
  "Flying",
  "Psychic",
  "Bug",
  "Rock",
  "Ghost",
  "Dragon",
  "Dark",
  "Steel",
  "Fairy",
];

let audioContext = null;
let masterGain = null;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.06;
    masterGain.connect(audioContext.destination);
  }

  return audioContext;
}

function connectVoice(oscillator, gainNode, pan = 0) {
  const context = getAudioContext();
  if (!context || !masterGain) {
    return;
  }

  if (typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    oscillator.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(masterGain);
    return;
  }

  oscillator.connect(gainNode);
  gainNode.connect(masterGain);
}

function scheduleVoice({
  type = "square",
  startFrequency,
  endFrequency,
  startTime,
  duration,
  peakGain = 0.03,
  pan = 0,
}) {
  const context = getAudioContext();
  if (!context || context.state !== "running") {
    return;
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(40, startFrequency), startTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), startTime + duration);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.018);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  connectVoice(oscillator, gainNode, pan);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function waveformForType(typeName = "") {
  switch (typeName) {
    case "Electric":
    case "Steel":
      return "square";
    case "Water":
    case "Ice":
    case "Fairy":
      return "sine";
    case "Ghost":
    case "Psychic":
    case "Dragon":
      return "triangle";
    default:
      return "sawtooth";
  }
}

function typeOffset(typeName = "") {
  const index = TYPE_ORDER.indexOf(typeName);
  return index < 0 ? 0 : index;
}

function pokemonSeed(pokemon) {
  return pokemon?.species?.id ?? pokemon?.id ?? 25;
}

function pokemonTypes(pokemon) {
  return pokemon?.types ?? pokemon?.species?.types ?? [];
}

function sidePan(side) {
  if (side === "player") {
    return -0.32;
  }
  if (side === "opponent") {
    return 0.32;
  }
  return 0;
}

export async function unlockSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    await context.resume();
  }
}

export function playPokemonCry(pokemon, side = "center") {
  const context = getAudioContext();
  if (!context || context.state !== "running" || !pokemon) {
    return;
  }

  const seed = pokemonSeed(pokemon);
  const [primaryType = "Normal", secondaryType = primaryType] = pokemonTypes(pokemon);
  const wave = waveformForType(primaryType);
  const pan = sidePan(side);
  const base = 180 + (seed % 170) + (typeOffset(primaryType) * 4);
  const now = context.currentTime + 0.01;

  scheduleVoice({
    type: wave,
    startFrequency: base,
    endFrequency: base * 1.26,
    startTime: now,
    duration: 0.09,
    peakGain: 0.028,
    pan,
  });
  scheduleVoice({
    type: waveformForType(secondaryType),
    startFrequency: base * 1.22,
    endFrequency: base * 0.88,
    startTime: now + 0.065,
    duration: 0.12,
    peakGain: 0.024,
    pan,
  });
  scheduleVoice({
    type: wave,
    startFrequency: base * 0.92,
    endFrequency: base * 1.36,
    startTime: now + 0.14,
    duration: 0.08,
    peakGain: 0.018,
    pan,
  });
}

export function playMoveSound(move, side = "center") {
  const context = getAudioContext();
  if (!context || context.state !== "running" || !move) {
    return;
  }

  const typeName = move.type ?? "Normal";
  const pan = sidePan(side);
  const wave = waveformForType(typeName);
  const typeStep = typeOffset(typeName);
  const power = Math.max(30, move.power ?? 40);
  const base = 220 + (typeStep * 14) + (power * 1.25);
  const now = context.currentTime + 0.01;

  scheduleVoice({
    type: wave,
    startFrequency: base * 1.05,
    endFrequency: base * 0.6,
    startTime: now,
    duration: 0.08,
    peakGain: 0.026,
    pan,
  });
  scheduleVoice({
    type: "triangle",
    startFrequency: base * 1.45,
    endFrequency: base * 0.9,
    startTime: now + 0.04,
    duration: 0.07,
    peakGain: 0.017,
    pan,
  });
}

export function playFaintSound(pokemon, side = "center") {
  const context = getAudioContext();
  if (!context || context.state !== "running") {
    return;
  }

  const seed = pokemonSeed(pokemon);
  const pan = sidePan(side);
  const base = 200 + (seed % 90);
  const now = context.currentTime + 0.01;

  scheduleVoice({
    type: "triangle",
    startFrequency: base,
    endFrequency: base * 0.7,
    startTime: now,
    duration: 0.12,
    peakGain: 0.024,
    pan,
  });
  scheduleVoice({
    type: "triangle",
    startFrequency: base * 0.72,
    endFrequency: base * 0.46,
    startTime: now + 0.09,
    duration: 0.14,
    peakGain: 0.02,
    pan,
  });
  scheduleVoice({
    type: "sawtooth",
    startFrequency: base * 0.42,
    endFrequency: base * 0.24,
    startTime: now + 0.2,
    duration: 0.18,
    peakGain: 0.015,
    pan,
  });
}
