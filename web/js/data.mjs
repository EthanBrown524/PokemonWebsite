import { parseCsv } from "./csv.mjs";

function readRequiredInt(row, fieldName) {
  const rawValue = String(row[fieldName] ?? "").trim();
  if (rawValue === "") {
    throw new Error(`Missing required field ${fieldName}.`);
  }
  return Number.parseInt(rawValue, 10);
}

function readOptionalInt(row, fieldName) {
  const rawValue = String(row[fieldName] ?? "").trim();
  if (rawValue === "") {
    return null;
  }
  return Number.parseInt(rawValue, 10);
}

function normalizePokemon(row) {
  const type2 = String(row.type2 ?? "").trim() || null;
  const pokemon = {
    id: readRequiredInt(row, "id"),
    name: String(row.name ?? "").trim(),
    type1: String(row.type1 ?? "").trim(),
    type2,
    hp: readRequiredInt(row, "hp"),
    attack: readRequiredInt(row, "attack"),
    defense: readRequiredInt(row, "defense"),
    spAttack: readRequiredInt(row, "sp_attack"),
    spDefense: readRequiredInt(row, "sp_defense"),
    speed: readRequiredInt(row, "speed"),
    frontSprite: String(row.front_sprite ?? "").trim(),
    backSprite: String(row.back_sprite ?? "").trim(),
  };
  pokemon.types = type2 ? [pokemon.type1, type2] : [pokemon.type1];
  return pokemon;
}

function normalizeMove(row) {
  const move = {
    id: readRequiredInt(row, "id"),
    name: String(row.name ?? "").trim(),
    type: String(row.type ?? "").trim(),
    power: readRequiredInt(row, "power"),
    accuracy: readOptionalInt(row, "accuracy"),
    pp: readRequiredInt(row, "pp"),
    priority: readRequiredInt(row, "priority"),
    damageClass: String(row.damage_class ?? "").trim(),
    effectText: String(row.effect_text ?? "").trim(),
  };
  move.isDamaging = (move.damageClass === "Physical" || move.damageClass === "Special") && move.power > 0;
  return move;
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status}).`);
  }
  return response.text();
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status}).`);
  }
  return response.json();
}

export async function loadGameAssets() {
  const [pokemonCsv, movesCsv, pokemonMovesCsv, battleModel] = await Promise.all([
    fetchText("data/pokemon.csv"),
    fetchText("data/moves.csv"),
    fetchText("data/pokemon_moves.csv"),
    fetchJson("data/battle_model.json"),
  ]);

  const pokemon = parseCsv(pokemonCsv).map(normalizePokemon);
  const moves = parseCsv(movesCsv).map(normalizeMove);
  const moveById = new Map(moves.map((move) => [move.id, move]));

  const pokemonMoves = new Map();
  const seenMoveIdsByPokemon = new Map();

  for (const row of parseCsv(pokemonMovesCsv)) {
    const pokemonId = readRequiredInt(row, "pokemon_id");
    const moveId = readRequiredInt(row, "move_id");
    const move = moveById.get(moveId);
    if (!move) {
      continue;
    }

    if (!seenMoveIdsByPokemon.has(pokemonId)) {
      seenMoveIdsByPokemon.set(pokemonId, new Set());
    }

    const seenMoveIds = seenMoveIdsByPokemon.get(pokemonId);
    if (seenMoveIds.has(moveId)) {
      continue;
    }

    seenMoveIds.add(moveId);
    if (!pokemonMoves.has(pokemonId)) {
      pokemonMoves.set(pokemonId, []);
    }
    pokemonMoves.get(pokemonId).push(move);
  }

  const pokemonById = new Map(pokemon.map((entry) => [entry.id, entry]));
  const pokemonByName = new Map(pokemon.map((entry) => [entry.name.toLowerCase(), entry]));

  return {
    pokemon,
    pokemonById,
    pokemonByName,
    moves,
    pokemonMoves,
    battleModel,
  };
}
