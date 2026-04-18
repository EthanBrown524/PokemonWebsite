export const TYPE_CHART = {
  Normal: { Rock: 0.5, Ghost: 0.0, Steel: 0.5 },
  Fire: { Grass: 2.0, Ice: 2.0, Bug: 2.0, Steel: 2.0, Fire: 0.5, Water: 0.5, Rock: 0.5, Dragon: 0.5 },
  Water: { Fire: 2.0, Ground: 2.0, Rock: 2.0, Water: 0.5, Grass: 0.5, Dragon: 0.5 },
  Electric: { Water: 2.0, Flying: 2.0, Electric: 0.5, Grass: 0.5, Dragon: 0.5, Ground: 0.0 },
  Grass: { Water: 2.0, Ground: 2.0, Rock: 2.0, Fire: 0.5, Grass: 0.5, Poison: 0.5, Flying: 0.5, Bug: 0.5, Dragon: 0.5, Steel: 0.5 },
  Ice: { Grass: 2.0, Ground: 2.0, Flying: 2.0, Dragon: 2.0, Fire: 0.5, Water: 0.5, Ice: 0.5, Steel: 0.5 },
  Fighting: { Normal: 2.0, Ice: 2.0, Rock: 2.0, Dark: 2.0, Steel: 2.0, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Fairy: 0.5, Ghost: 0.0 },
  Poison: { Grass: 2.0, Fairy: 2.0, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0.0 },
  Ground: { Fire: 2.0, Electric: 2.0, Poison: 2.0, Rock: 2.0, Steel: 2.0, Grass: 0.5, Bug: 0.5, Flying: 0.0 },
  Flying: { Grass: 2.0, Fighting: 2.0, Bug: 2.0, Electric: 0.5, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2.0, Poison: 2.0, Psychic: 0.5, Steel: 0.5, Dark: 0.0 },
  Bug: { Grass: 2.0, Psychic: 2.0, Dark: 2.0, Fire: 0.5, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Ghost: 0.5, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2.0, Ice: 2.0, Flying: 2.0, Bug: 2.0, Fighting: 0.5, Ground: 0.5, Steel: 0.5 },
  Ghost: { Psychic: 2.0, Ghost: 2.0, Dark: 0.5, Normal: 0.0 },
  Dragon: { Dragon: 2.0, Steel: 0.5, Fairy: 0.0 },
  Dark: { Psychic: 2.0, Ghost: 2.0, Fighting: 0.5, Dark: 0.5, Fairy: 0.5 },
  Steel: { Ice: 2.0, Rock: 2.0, Fairy: 2.0, Fire: 0.5, Water: 0.5, Electric: 0.5, Steel: 0.5, Poison: 0.0 },
  Fairy: { Fighting: 2.0, Dragon: 2.0, Dark: 2.0, Fire: 0.5, Poison: 0.5, Steel: 0.5 },
};

const MOVE_COUNT = 4;

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

function randomChoice(values) {
  return values[randomIndex(values.length)];
}

function randomBetween(minimum, maximum) {
  return minimum + (Math.random() * (maximum - minimum));
}

function sampleWithoutReplacement(values, count) {
  const pool = [...values];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    picked.push(pool.splice(randomIndex(pool.length), 1)[0]);
  }
  return picked;
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function statTotal(species) {
  return species.hp + species.attack + species.defense + species.spAttack + species.spDefense + species.speed;
}

function getAttackAndDefenseStats(attacker, defender, move) {
  if (move.damageClass === "Special") {
    return [attacker.species.spAttack, defender.species.spDefense];
  }
  return [attacker.species.attack, defender.species.defense];
}

function moveScore(move) {
  const accuracy = move.accuracy === null ? 1.0 : move.accuracy / 100;
  return [move.power * accuracy, move.priority, move.name];
}

function isUsableMove(move) {
  return move.isDamaging && !move.effectText.toLowerCase().includes("user faints");
}

function addMoveIfNew(selectedMoves, move) {
  if (selectedMoves.every((existingMove) => existingMove.id !== move.id)) {
    selectedMoves.push(move);
  }
}

function chooseMovesForPokemon(species, availableMoves, moveCount = MOVE_COUNT) {
  const damagingMoves = availableMoves.filter((move) => isUsableMove(move));
  if (damagingMoves.length === 0) {
    throw new Error(`${species.name} does not have any usable damaging moves.`);
  }

  const sortedByScore = (moves) => [...moves].sort((left, right) => {
    const [leftScore, leftPriority, leftName] = moveScore(left);
    const [rightScore, rightPriority, rightName] = moveScore(right);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }
    return leftName.localeCompare(rightName);
  });

  const sameTypeMoves = sortedByScore(damagingMoves.filter((move) => species.types.includes(move.type)));
  const otherMoves = sortedByScore(damagingMoves.filter((move) => !species.types.includes(move.type)));
  const selectedMoves = [];

  for (const move of sameTypeMoves.slice(0, 2)) {
    addMoveIfNew(selectedMoves, move);
  }

  for (const move of otherMoves) {
    if (selectedMoves.length >= moveCount) {
      break;
    }
    addMoveIfNew(selectedMoves, move);
  }

  for (const move of sortedByScore(damagingMoves)) {
    if (selectedMoves.length >= moveCount) {
      break;
    }
    addMoveIfNew(selectedMoves, move);
  }

  return selectedMoves.slice(0, moveCount);
}

export function buildBattlePokemon(species, pokemonMovesById) {
  const availableMoves = pokemonMovesById.get(species.id) ?? [];
  const moves = chooseMovesForPokemon(species, availableMoves);
  return {
    species,
    moves,
    currentHp: species.hp,
    maxHp: species.hp,
    get name() {
      return species.name;
    },
    get types() {
      return species.types;
    },
    get isFainted() {
      return this.currentHp <= 0;
    },
  };
}

export function buildMatchupForPlayer(gameData, playerSpecies) {
  const availableOpponents = gameData.pokemon.filter((pokemon) => pokemon.id !== playerSpecies.id);
  const opponentSpecies = randomChoice(availableOpponents);
  return {
    player: buildBattlePokemon(playerSpecies, gameData.pokemonMoves),
    opponent: buildBattlePokemon(opponentSpecies, gameData.pokemonMoves),
  };
}

export function scoreMove(move, attacker, defender) {
  if (!move.isDamaging) {
    return 0;
  }
  const accuracy = move.accuracy === null ? 1.0 : move.accuracy / 100;
  const stabBonus = attacker.types.includes(move.type) ? 1.5 : 1.0;
  return move.power * accuracy * stabBonus * typeMultiplier(move.type, defender.types);
}

export function typeMultiplier(moveType, defenderTypes) {
  return defenderTypes.reduce(
    (multiplier, defenderType) => multiplier * (TYPE_CHART[moveType]?.[defenderType] ?? 1.0),
    1.0,
  );
}

export function chooseAiMove(attacker, defender) {
  const bestScore = Math.max(...attacker.moves.map((move) => scoreMove(move, attacker, defender)));
  const bestMoves = attacker.moves.filter((move) => scoreMove(move, attacker, defender) === bestScore);
  return randomChoice(bestMoves);
}

export function determineTurnActions(playerPokemon, opponentPokemon, playerMove, opponentMove) {
  const playerAction = [playerPokemon, opponentPokemon, playerMove];
  const opponentAction = [opponentPokemon, playerPokemon, opponentMove];

  if (playerMove.priority !== opponentMove.priority) {
    return playerMove.priority > opponentMove.priority
      ? [playerAction, opponentAction]
      : [opponentAction, playerAction];
  }

  if (playerPokemon.species.speed !== opponentPokemon.species.speed) {
    return playerPokemon.species.speed > opponentPokemon.species.speed
      ? [playerAction, opponentAction]
      : [opponentAction, playerAction];
  }

  return shuffle([playerAction, opponentAction]);
}

export function calculateDamage(attacker, defender, move, effectiveness = null, criticalHit = false) {
  if (!move.isDamaging) {
    return 0;
  }

  const [attackStat, defenseStat] = getAttackAndDefenseStats(attacker, defender, move);
  const stabBonus = attacker.types.includes(move.type) ? 1.5 : 1.0;
  const typeBonus = effectiveness === null ? typeMultiplier(move.type, defender.types) : effectiveness;
  const criticalBonus = criticalHit ? 1.5 : 1.0;
  const randomBonus = randomBetween(0.85, 1.0);

  const baseDamage = ((((2 * 50) / 5 + 2) * move.power * attackStat / Math.max(defenseStat, 1)) / 50) + 2;
  const damage = Math.floor(baseDamage * stabBonus * typeBonus * criticalBonus * randomBonus);

  if (typeBonus <= 0) {
    return 0;
  }
  return Math.max(1, damage);
}

export function performAttack(attacker, defender, move) {
  const notes = [`${attacker.name} used ${move.name}.`];

  if (attacker.isFainted) {
    notes.push(`${attacker.name} has fainted and cannot move.`);
    return notes;
  }

  if (!move.isDamaging) {
    notes.push("Status moves are skipped in this version of the project.");
    return notes;
  }

  if (move.accuracy !== null && (Math.floor(Math.random() * 100) + 1) > move.accuracy) {
    notes.push("The attack missed.");
    return notes;
  }

  const effectiveness = typeMultiplier(move.type, defender.types);
  if (effectiveness === 0) {
    notes.push(`It had no effect on ${defender.name}.`);
    return notes;
  }

  const criticalHit = Math.random() < (1 / 16);
  const damage = calculateDamage(attacker, defender, move, effectiveness, criticalHit);
  const actualDamage = Math.max(0, Math.min(damage, defender.currentHp));
  defender.currentHp -= actualDamage;

  if (criticalHit) {
    notes.push("A critical hit!");
  }
  if (effectiveness > 1) {
    notes.push("It's super effective!");
  } else if (effectiveness > 0 && effectiveness < 1) {
    notes.push("It's not very effective.");
  }

  notes.push(`${defender.name} took ${actualDamage} damage.`);
  if (defender.isFainted) {
    notes.push(`${defender.name} fainted.`);
  } else {
    notes.push(`${defender.name} has ${defender.currentHp}/${defender.maxHp} HP left.`);
  }

  return notes;
}

export function getWinnerMessage(player, opponent) {
  if (!player || !opponent) {
    return null;
  }
  if (opponent.isFainted) {
    return `You win! ${opponent.name} fainted.`;
  }
  if (player.isFainted) {
    return `You lost. ${player.name} fainted.`;
  }
  return null;
}

export function getWinningSide(player, opponent) {
  if (opponent.isFainted && !player.isFainted) {
    return "player";
  }
  if (player.isFainted && !opponent.isFainted) {
    return "opponent";
  }

  const playerHpRatio = player.maxHp <= 0 ? 0 : player.currentHp / player.maxHp;
  const opponentHpRatio = opponent.maxHp <= 0 ? 0 : opponent.currentHp / opponent.maxHp;

  if (playerHpRatio !== opponentHpRatio) {
    return playerHpRatio > opponentHpRatio ? "player" : "opponent";
  }

  const playerBestMove = Math.max(...player.moves.map((move) => scoreMove(move, player, opponent)));
  const opponentBestMove = Math.max(...opponent.moves.map((move) => scoreMove(move, opponent, player)));
  if (playerBestMove !== opponentBestMove) {
    return playerBestMove > opponentBestMove ? "player" : "opponent";
  }

  return statTotal(player.species) >= statTotal(opponent.species) ? "player" : "opponent";
}

export function buildRoulettePool(pokemon, selectedPokemon, slotCount) {
  const others = pokemon.filter((entry) => entry.id !== selectedPokemon.id);
  const pool = sampleWithoutReplacement(others, Math.max(0, slotCount - 1));
  while (pool.length < slotCount - 1 && others.length > 0) {
    pool.push(randomChoice(others));
  }
  const finalIndex = randomIndex(slotCount);
  pool.splice(finalIndex, 0, selectedPokemon);
  return { pool, finalIndex };
}
