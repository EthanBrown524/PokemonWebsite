from __future__ import annotations
from collections.abc import Sequence
from dataclasses import dataclass
from data_loader import GameData, Move, Pokemon
import random

TYPE_CHART: dict[str, dict[str, float]] = {
    "Normal": {"Rock": 0.5, "Ghost": 0.0, "Steel": 0.5},
    "Fire": {"Grass": 2.0, "Ice": 2.0, "Bug": 2.0, "Steel": 2.0, "Fire": 0.5, "Water": 0.5, "Rock": 0.5, "Dragon": 0.5},
    "Water": {"Fire": 2.0, "Ground": 2.0, "Rock": 2.0, "Water": 0.5, "Grass": 0.5, "Dragon": 0.5},
    "Electric": {"Water": 2.0, "Flying": 2.0, "Electric": 0.5, "Grass": 0.5, "Dragon": 0.5, "Ground": 0.0},
    "Grass": {"Water": 2.0, "Ground": 2.0, "Rock": 2.0, "Fire": 0.5, "Grass": 0.5, "Poison": 0.5, "Flying": 0.5, "Bug": 0.5, "Dragon": 0.5, "Steel": 0.5},
    "Ice": {"Grass": 2.0, "Ground": 2.0, "Flying": 2.0, "Dragon": 2.0, "Fire": 0.5, "Water": 0.5, "Ice": 0.5, "Steel": 0.5},
    "Fighting": {"Normal": 2.0, "Ice": 2.0, "Rock": 2.0, "Dark": 2.0, "Steel": 2.0, "Poison": 0.5, "Flying": 0.5, "Psychic": 0.5, "Bug": 0.5, "Fairy": 0.5, "Ghost": 0.0},
    "Poison": {"Grass": 2.0, "Fairy": 2.0, "Poison": 0.5, "Ground": 0.5, "Rock": 0.5, "Ghost": 0.5, "Steel": 0.0},
    "Ground": {"Fire": 2.0, "Electric": 2.0, "Poison": 2.0, "Rock": 2.0, "Steel": 2.0, "Grass": 0.5, "Bug": 0.5, "Flying": 0.0},
    "Flying": {"Grass": 2.0, "Fighting": 2.0, "Bug": 2.0, "Electric": 0.5, "Rock": 0.5, "Steel": 0.5},
    "Psychic": {"Fighting": 2.0, "Poison": 2.0, "Psychic": 0.5, "Steel": 0.5, "Dark": 0.0},
    "Bug": {"Grass": 2.0, "Psychic": 2.0, "Dark": 2.0, "Fire": 0.5, "Fighting": 0.5, "Poison": 0.5, "Flying": 0.5, "Ghost": 0.5, "Steel": 0.5, "Fairy": 0.5},
    "Rock": {"Fire": 2.0, "Ice": 2.0, "Flying": 2.0, "Bug": 2.0, "Fighting": 0.5, "Ground": 0.5, "Steel": 0.5},
    "Ghost": {"Psychic": 2.0, "Ghost": 2.0, "Dark": 0.5, "Normal": 0.0},
    "Dragon": {"Dragon": 2.0, "Steel": 0.5, "Fairy": 0.0},
    "Dark": {"Psychic": 2.0, "Ghost": 2.0, "Fighting": 0.5, "Dark": 0.5, "Fairy": 0.5},
    "Steel": {"Ice": 2.0, "Rock": 2.0, "Fairy": 2.0, "Fire": 0.5, "Water": 0.5, "Electric": 0.5, "Steel": 0.5, "Poison": 0.0},
    "Fairy": {"Fighting": 2.0, "Dragon": 2.0, "Dark": 2.0, "Fire": 0.5, "Poison": 0.5, "Steel": 0.5},
}

MOVE_COUNT = 4

@dataclass
class BattlePokemon:
    species: Pokemon
    moves: tuple[Move, ...]
    current_hp: int | None = None

    def __post_init__(self) -> None:
        self.moves = tuple(self.moves)
        if not self.moves:
            raise ValueError("BattlePokemon needs at least one move.")
        if self.current_hp is None:
            self.current_hp = self.species.hp
        self.current_hp = max(0, min(self.current_hp, self.species.hp))

    @property
    def name(self) -> str:
        return self.species.name

    @property
    def types(self) -> tuple[str, ...]:
        return self.species.types

    @property
    def max_hp(self) -> int:
        return self.species.hp

    @property
    def is_fainted(self) -> bool:
        return self.current_hp <= 0

    def receive_damage(self, damage: int) -> int:
        actual_damage = max(0, min(damage, self.current_hp))
        self.current_hp -= actual_damage
        return actual_damage


class BattleEngine:
    def __init__(self, rng: random.Random | None = None, level: int = 50) -> None:
        self.rng = rng if rng is not None else random.Random()
        self.level = level

    def run_turn(
        self,
        player_pokemon: BattlePokemon,
        opponent_pokemon: BattlePokemon,
        player_move: Move,
        opponent_move: Move,
    ) -> list[str]:
        notes: list[str] = []
        for attacker, defender, move in self.determine_turn_actions(player_pokemon, opponent_pokemon, player_move, opponent_move):
            if attacker.is_fainted or defender.is_fainted:
                continue
            notes.extend(self.perform_attack(attacker, defender, move))
        return notes

    def determine_turn_actions(
        self,
        player_pokemon: BattlePokemon,
        opponent_pokemon: BattlePokemon,
        player_move: Move,
        opponent_move: Move,
    ) -> list[tuple[BattlePokemon, BattlePokemon, Move]]:
        return self._turn_order(player_pokemon, opponent_pokemon, player_move, opponent_move)

    def perform_attack(self, attacker: BattlePokemon, defender: BattlePokemon, move: Move) -> list[str]:
        notes = [f"{attacker.name} used {move.name}."]

        if attacker.is_fainted:
            notes.append(f"{attacker.name} has fainted and cannot move.")
            return notes

        if not move.is_damaging:
            notes.append("Status moves are skipped in this version of the project.")
            return notes

        if move.accuracy is not None and self.rng.randint(1, 100) > move.accuracy:
            notes.append("The attack missed.")
            return notes

        effectiveness = type_multiplier(move.type, defender.types)
        if effectiveness == 0:
            notes.append(f"It had no effect on {defender.name}.")
            return notes

        critical_hit = self.rng.random() < (1 / 16)
        damage = self.calculate_damage(attacker, defender, move, effectiveness, critical_hit)
        actual_damage = defender.receive_damage(damage)

        if critical_hit:
            notes.append("A critical hit!")
        if effectiveness > 1:
            notes.append("It's super effective!")
        elif 0 < effectiveness < 1:
            notes.append("It's not very effective.")

        notes.append(f"{defender.name} took {actual_damage} damage.")
        if defender.is_fainted:
            notes.append(f"{defender.name} fainted.")
        else:
            notes.append(f"{defender.name} has {defender.current_hp}/{defender.max_hp} HP left.")

        return notes

    def calculate_damage(
        self,
        attacker: BattlePokemon,
        defender: BattlePokemon,
        move: Move,
        effectiveness: float | None = None,
        critical_hit: bool = False,
    ) -> int:
        if not move.is_damaging:
            return 0

        attack_stat, defense_stat = _get_attack_and_defense_stats(attacker.species, defender.species, move)
        stab_bonus = 1.5 if move.type in attacker.types else 1.0
        type_bonus = effectiveness if effectiveness is not None else type_multiplier(move.type, defender.types)
        critical_bonus = 1.5 if critical_hit else 1.0
        random_bonus = self.rng.uniform(0.85, 1.0)

        base_damage = (((2 * self.level / 5 + 2) * move.power * attack_stat / max(defense_stat, 1)) / 50) + 2
        damage = int(base_damage * stab_bonus * type_bonus * critical_bonus * random_bonus)
        if type_bonus <= 0:
            return 0
        return max(1, damage)

    def _turn_order(
        self,
        player_pokemon: BattlePokemon,
        opponent_pokemon: BattlePokemon,
        player_move: Move,
        opponent_move: Move,
    ) -> list[tuple[BattlePokemon, BattlePokemon, Move]]:
        player_action = (player_pokemon, opponent_pokemon, player_move)
        opponent_action = (opponent_pokemon, player_pokemon, opponent_move)

        if player_move.priority != opponent_move.priority:
            if player_move.priority > opponent_move.priority:
                return [player_action, opponent_action]
            return [opponent_action, player_action]

        if player_pokemon.species.speed != opponent_pokemon.species.speed:
            if player_pokemon.species.speed > opponent_pokemon.species.speed:
                return [player_action, opponent_action]
            return [opponent_action, player_action]

        actions = [player_action, opponent_action]
        self.rng.shuffle(actions)
        return actions


def choose_ai_move(attacker: BattlePokemon, defender: BattlePokemon, rng: random.Random | None = None) -> Move:
    chooser = rng if rng is not None else random.Random()
    best_score = max(score_move(move, attacker, defender) for move in attacker.moves)
    best_moves = [move for move in attacker.moves if score_move(move, attacker, defender) == best_score]
    return chooser.choice(best_moves)


def build_matchup_for_player(
    game_data: GameData,
    player_species: Pokemon,
    rng: random.Random | None = None,
) -> tuple[BattlePokemon, BattlePokemon]:
    chooser = rng if rng is not None else random.Random()
    available_opponents = [pokemon for pokemon in game_data.pokemon if pokemon.id != player_species.id]
    opponent_species = chooser.choice(available_opponents)
    return (
        build_battle_pokemon(player_species, game_data.pokemon_moves),
        build_battle_pokemon(opponent_species, game_data.pokemon_moves),
    )


def score_move(move: Move, attacker: BattlePokemon, defender: BattlePokemon) -> float:
    if not move.is_damaging:
        return 0.0

    accuracy = 1.0 if move.accuracy is None else move.accuracy / 100
    stab_bonus = 1.5 if move.type in attacker.types else 1.0
    return move.power * accuracy * stab_bonus * type_multiplier(move.type, defender.types)


def type_multiplier(move_type: str, defender_types: Sequence[str]) -> float:
    multiplier = 1.0
    for defender_type in defender_types:
        multiplier *= TYPE_CHART.get(move_type, {}).get(defender_type, 1.0)
    return multiplier


def _get_attack_and_defense_stats(attacker: Pokemon, defender: Pokemon, move: Move) -> tuple[int, int]:
    if move.damage_class == "Special":
        return attacker.sp_attack, defender.sp_defense
    return attacker.attack, defender.defense


def build_battle_pokemon(species: Pokemon, pokemon_moves: dict[int, tuple[Move, ...]]) -> BattlePokemon:
    return BattlePokemon(species=species, moves=tuple(_choose_moves_for_pokemon(species, pokemon_moves[species.id])))


def _choose_moves_for_pokemon(
    species: Pokemon,
    available_moves: Sequence[Move],
    move_count: int = MOVE_COUNT,
) -> list[Move]:
    damaging_moves = [move for move in available_moves if _is_usable_move(move)]
    if not damaging_moves:
        raise ValueError(f"{species.name} does not have any usable damaging moves.")

    same_type_moves = sorted((move for move in damaging_moves if move.type in species.types), key=_move_score, reverse=True)
    other_moves = sorted((move for move in damaging_moves if move.type not in species.types), key=_move_score, reverse=True)
    selected_moves: list[Move] = []

    for move in same_type_moves[:2]:
        _add_move_if_new(selected_moves, move)

    for move in other_moves:
        if len(selected_moves) >= move_count:
            break
        _add_move_if_new(selected_moves, move)

    for move in sorted(damaging_moves, key=_move_score, reverse=True):
        if len(selected_moves) >= move_count:
            break
        _add_move_if_new(selected_moves, move)

    return selected_moves[:move_count]


def _move_score(move: Move) -> tuple[float, int, str]:
    accuracy = 1.0 if move.accuracy is None else move.accuracy / 100
    return (move.power * accuracy, move.priority, move.name)


def _is_usable_move(move: Move) -> bool:
    return move.is_damaging and "user faints" not in move.effect_text.lower()


def _add_move_if_new(selected_moves: list[Move], move: Move) -> None:
    if all(existing_move.id != move.id for existing_move in selected_moves):
        selected_moves.append(move)
