from __future__ import annotations

from battle import BattlePokemon, score_move, type_multiplier
from data_loader import Pokemon


FEATURE_NAMES = (
    "hp_diff",
    "attack_diff",
    "defense_diff",
    "sp_attack_diff",
    "sp_defense_diff",
    "speed_diff",
    "stat_total_diff",
    "best_move_score_diff",
    "average_move_score_diff",
    "best_effectiveness_diff",
    "stab_move_count_diff",
)


def build_feature_vector(first_pokemon: BattlePokemon, second_pokemon: BattlePokemon) -> tuple[float, ...]:
    first_move_scores = tuple(score_move(move, first_pokemon, second_pokemon) for move in first_pokemon.moves)
    second_move_scores = tuple(score_move(move, second_pokemon, first_pokemon) for move in second_pokemon.moves)
    first_effectiveness = tuple(type_multiplier(move.type, second_pokemon.types) for move in first_pokemon.moves)
    second_effectiveness = tuple(type_multiplier(move.type, first_pokemon.types) for move in second_pokemon.moves)

    return (
        float(first_pokemon.species.hp - second_pokemon.species.hp),
        float(first_pokemon.species.attack - second_pokemon.species.attack),
        float(first_pokemon.species.defense - second_pokemon.species.defense),
        float(first_pokemon.species.sp_attack - second_pokemon.species.sp_attack),
        float(first_pokemon.species.sp_defense - second_pokemon.species.sp_defense),
        float(first_pokemon.species.speed - second_pokemon.species.speed),
        float(_stat_total(first_pokemon.species) - _stat_total(second_pokemon.species)),
        max(first_move_scores) - max(second_move_scores),
        _average(first_move_scores) - _average(second_move_scores),
        max(first_effectiveness) - max(second_effectiveness),
        float(_stab_move_count(first_pokemon) - _stab_move_count(second_pokemon)),
    )


def _stat_total(species: Pokemon) -> int:
    return species.hp + species.attack + species.defense + species.sp_attack + species.sp_defense + species.speed


def _stab_move_count(pokemon: BattlePokemon) -> int:
    return sum(1 for move in pokemon.moves if move.type in pokemon.types)


def _average(values: tuple[float, ...]) -> float:
    return sum(values) / len(values)
