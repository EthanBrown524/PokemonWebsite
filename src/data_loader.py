from __future__ import annotations
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
import csv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
ASSETS_DIR = PROJECT_ROOT / "assets"
POKEMON_CSV = DATA_DIR / "pokemon.csv"
MOVES_CSV = DATA_DIR / "moves.csv"
POKEMON_MOVES_CSV = DATA_DIR / "pokemon_moves.csv"
SPRITE_CACHE_DIR = ASSETS_DIR / "sprites" / "cache"
BATTLE_BACKGROUND_PATH = ASSETS_DIR / "sprites" / "battle_background.png"


@dataclass(frozen=True)
class Pokemon:
    id: int
    name: str
    type1: str
    type2: str | None
    hp: int
    attack: int
    defense: int
    sp_attack: int
    sp_defense: int
    speed: int
    front_sprite: str
    back_sprite: str

    @property
    def types(self) -> tuple[str, ...]:
        if self.type2:
            return (self.type1, self.type2)
        return (self.type1,)


@dataclass(frozen=True)
class Move:
    id: int
    name: str
    type: str
    power: int
    accuracy: int | None
    pp: int
    priority: int
    damage_class: str
    effect_text: str

    @property
    def is_damaging(self) -> bool:
        return self.damage_class in {"Physical", "Special"} and self.power > 0


@dataclass(frozen=True)
class GameData:
    pokemon: tuple[Pokemon, ...]
    pokemon_moves: dict[int, tuple[Move, ...]]


def load_game_data(
) -> GameData:
    pokemon = tuple(_load_pokemon())
    pokemon_moves = _load_pokemon_moves(tuple(_load_moves()))
    return GameData(pokemon=pokemon, pokemon_moves=pokemon_moves)


def _load_pokemon(path: Path = POKEMON_CSV) -> list[Pokemon]:
    rows = _read_csv_rows(path)
    pokemon_list: list[Pokemon] = []
    for row in rows:
        pokemon_list.append(
            Pokemon(
                id=_read_required_int(row, "id", path),
                name=row["name"].strip(),
                type1=row["type1"].strip(),
                type2=row["type2"].strip() or None,
                hp=_read_required_int(row, "hp", path),
                attack=_read_required_int(row, "attack", path),
                defense=_read_required_int(row, "defense", path),
                sp_attack=_read_required_int(row, "sp_attack", path),
                sp_defense=_read_required_int(row, "sp_defense", path),
                speed=_read_required_int(row, "speed", path),
                front_sprite=row["front_sprite"].strip(),
                back_sprite=row["back_sprite"].strip(),
            )
        )
    return pokemon_list


def _load_moves(path: Path = MOVES_CSV) -> list[Move]:
    rows = _read_csv_rows(path)
    move_list: list[Move] = []
    for row in rows:
        move_list.append(
            Move(
                id=_read_required_int(row, "id", path),
                name=row["name"].strip(),
                type=row["type"].strip(),
                power=_read_required_int(row, "power", path),
                accuracy=_read_optional_int(row, "accuracy"),
                pp=_read_required_int(row, "pp", path),
                priority=_read_required_int(row, "priority", path),
                damage_class=row["damage_class"].strip(),
                effect_text=row["effect_text"].strip(),
            )
        )
    return move_list


def _load_pokemon_moves(
    moves: Sequence[Move],
    path: Path = POKEMON_MOVES_CSV,
) -> dict[int, tuple[Move, ...]]:
    rows = _read_csv_rows(path)
    move_lookup = {move.id: move for move in moves}
    move_lists_by_pokemon: dict[int, list[Move]] = {}
    seen_move_ids_by_pokemon: dict[int, set[int]] = {}

    for row in rows:
        pokemon_id = _read_required_int(row, "pokemon_id", path)
        move_id = _read_required_int(row, "move_id", path)
        move = move_lookup.get(move_id)
        if move is None:
            move_name = row.get("move_name", f"move id {move_id}")
            raise ValueError(f"Unknown move {move_name!r} in {path}")

        seen_move_ids = seen_move_ids_by_pokemon.setdefault(pokemon_id, set())
        if move_id in seen_move_ids:
            continue

        seen_move_ids.add(move_id)
        move_lists_by_pokemon.setdefault(pokemon_id, []).append(move)

    return {pokemon_id: tuple(move_list) for pokemon_id, move_list in move_lists_by_pokemon.items()}


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing data file: {path}")

    with path.open(newline="", encoding="utf-8") as csv_file:
        return list(csv.DictReader(csv_file))


def _read_required_int(row: dict[str, str], field_name: str, path: Path) -> int:
    raw_value = row[field_name].strip()
    if raw_value == "":
        row_name = row.get("name") or row.get("pokemon_name") or row.get("move_name") or "unknown row"
        raise ValueError(f"Missing required field {field_name!r} for {row_name!r} in {path}")
    return int(raw_value)


def _read_optional_int(row: dict[str, str], field_name: str) -> int | None:
    raw_value = row[field_name].strip()
    if raw_value == "":
        return None
    return int(raw_value)
