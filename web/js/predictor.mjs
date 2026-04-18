import { scoreMove, typeMultiplier } from "./battle.mjs";

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function statTotal(species) {
  return species.hp + species.attack + species.defense + species.spAttack + species.spDefense + species.speed;
}

function stabMoveCount(pokemon) {
  return pokemon.moves.filter((move) => pokemon.types.includes(move.type)).length;
}

export function buildFeatureVector(firstPokemon, secondPokemon) {
  const firstMoveScores = firstPokemon.moves.map((move) => scoreMove(move, firstPokemon, secondPokemon));
  const secondMoveScores = secondPokemon.moves.map((move) => scoreMove(move, secondPokemon, firstPokemon));
  const firstEffectiveness = firstPokemon.moves.map((move) => typeMultiplier(move.type, secondPokemon.types));
  const secondEffectiveness = secondPokemon.moves.map((move) => typeMultiplier(move.type, firstPokemon.types));

  return [
    firstPokemon.species.hp - secondPokemon.species.hp,
    firstPokemon.species.attack - secondPokemon.species.attack,
    firstPokemon.species.defense - secondPokemon.species.defense,
    firstPokemon.species.spAttack - secondPokemon.species.spAttack,
    firstPokemon.species.spDefense - secondPokemon.species.spDefense,
    firstPokemon.species.speed - secondPokemon.species.speed,
    statTotal(firstPokemon.species) - statTotal(secondPokemon.species),
    Math.max(...firstMoveScores) - Math.max(...secondMoveScores),
    average(firstMoveScores) - average(secondMoveScores),
    Math.max(...firstEffectiveness) - Math.max(...secondEffectiveness),
    stabMoveCount(firstPokemon) - stabMoveCount(secondPokemon),
  ];
}

export function predictBattle(model, firstPokemon, secondPokemon) {
  if (!model) {
    return null;
  }

  const features = buildFeatureVector(firstPokemon, secondPokemon);
  const standardized = features.map(
    (value, index) => (value - Number(model.means[index])) / Number(model.scales[index]),
  );
  const score = standardized.reduce(
    (sum, value, index) => sum + (Number(model.weights[index]) * value),
    Number(model.bias),
  );
  const firstWinProbability = sigmoid(score);

  return {
    firstName: firstPokemon.name,
    secondName: secondPokemon.name,
    firstWinProbability,
    secondWinProbability: 1 - firstWinProbability,
    predictedWinner: firstWinProbability >= 0.5 ? firstPokemon.name : secondPokemon.name,
    confidence: Math.max(firstWinProbability, 1 - firstWinProbability),
  };
}

function sigmoid(value) {
  if (value >= 0) {
    const expValue = Math.exp(-value);
    return 1 / (1 + expValue);
  }
  const expValue = Math.exp(value);
  return expValue / (1 + expValue);
}
