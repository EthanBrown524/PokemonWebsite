from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path

from battle import BattleEngine, BattlePokemon, build_battle_pokemon, choose_ai_move, score_move
from data_loader import GameData, Pokemon, PROJECT_ROOT, load_game_data
from prediction_features import FEATURE_NAMES, build_feature_vector
from prediction_model import LogisticModel, TrainingExample, measure_accuracy, train_logistic_model


MODEL_PATH = PROJECT_ROOT / "data" / "battle_model.json"
DEFAULT_BATTLE_COUNT = 1200
DEFAULT_REPEAT_COUNT = 3
DEFAULT_RANDOM_SEED = 7
MAX_SIMULATION_TURNS = 120


@dataclass(frozen=True)
class MatchPrediction:
    first_name: str
    second_name: str
    first_win_probability: float

    @property
    def second_win_probability(self) -> float:
        return 1.0 - self.first_win_probability

    @property
    def predicted_winner(self) -> str:
        if self.first_win_probability >= 0.5:
            return self.first_name
        return self.second_name

    @property
    def confidence(self) -> float:
        return max(self.first_win_probability, self.second_win_probability)


class BattlePredictor:
    def __init__(self, model: LogisticModel) -> None:
        self.model = model

    @classmethod
    def load(cls, model_path: Path = MODEL_PATH) -> "BattlePredictor | None":
        if not model_path.exists():
            return None
        return cls(LogisticModel.load(model_path))

    def predict_battle(self, first_pokemon: BattlePokemon, second_pokemon: BattlePokemon) -> MatchPrediction:
        probability = self.model.predict_probability(build_feature_vector(first_pokemon, second_pokemon))
        return MatchPrediction(
            first_name=first_pokemon.name,
            second_name=second_pokemon.name,
            first_win_probability=probability,
        )

    def predict_species(
        self,
        game_data: GameData,
        first_species: Pokemon,
        second_species: Pokemon,
    ) -> MatchPrediction:
        first_pokemon = build_battle_pokemon(first_species, game_data.pokemon_moves)
        second_pokemon = build_battle_pokemon(second_species, game_data.pokemon_moves)
        return self.predict_battle(first_pokemon, second_pokemon)


def train_and_save_model(
    game_data: GameData | None = None,
    model_path: Path = MODEL_PATH,
    battle_count: int = DEFAULT_BATTLE_COUNT,
    repeat_count: int = DEFAULT_REPEAT_COUNT,
    seed: int = DEFAULT_RANDOM_SEED,
) -> tuple[BattlePredictor, dict[str, int | float]]:
    if repeat_count <= 0:
        raise ValueError("repeat_count must be at least 1.")
    if battle_count <= 0:
        raise ValueError("battle_count must be at least 1.")

    loaded_data = game_data if game_data is not None else load_game_data()
    examples = _build_training_examples(loaded_data, battle_count=battle_count, repeat_count=repeat_count, seed=seed)

    shuffle_rng = random.Random(seed)
    shuffle_rng.shuffle(examples)
    split_index = max(1, int(len(examples) * 0.8))
    training_examples = examples[:split_index]
    validation_examples = examples[split_index:] or examples[-1:]

    model = train_logistic_model(training_examples, FEATURE_NAMES)
    metadata = {
        "battle_count": battle_count,
        "repeat_count": repeat_count,
        "seed": seed,
        "training_examples": len(training_examples),
        "validation_examples": len(validation_examples),
        "training_accuracy": round(measure_accuracy(model, training_examples), 4),
        "validation_accuracy": round(measure_accuracy(model, validation_examples), 4),
    }
    model.save(model_path, metadata=metadata)
    return BattlePredictor(model), metadata


def read_model_metadata(model_path: Path = MODEL_PATH) -> dict[str, int | float | str]:
    if not model_path.exists():
        return {}
    payload = json.loads(model_path.read_text(encoding="utf-8"))
    metadata = payload.get("metadata", {})
    if not isinstance(metadata, dict):
        return {}
    return metadata


def _build_training_examples(
    game_data: GameData,
    battle_count: int,
    repeat_count: int,
    seed: int,
) -> list[TrainingExample]:
    rng = random.Random(seed)
    available_species = list(game_data.pokemon)
    examples: list[TrainingExample] = []

    for _ in range(battle_count):
        first_species, second_species = rng.sample(available_species, 2)
        first_pokemon = build_battle_pokemon(first_species, game_data.pokemon_moves)
        second_pokemon = build_battle_pokemon(second_species, game_data.pokemon_moves)
        first_win_rate = _estimate_first_pokemon_win_rate(game_data, first_species, second_species, repeat_count, rng)

        examples.append(TrainingExample(build_feature_vector(first_pokemon, second_pokemon), first_win_rate))
        examples.append(TrainingExample(build_feature_vector(second_pokemon, first_pokemon), 1.0 - first_win_rate))

    return examples


def _estimate_first_pokemon_win_rate(
    game_data: GameData,
    first_species: Pokemon,
    second_species: Pokemon,
    repeat_count: int,
    rng: random.Random,
) -> float:
    first_wins = 0
    for _ in range(repeat_count):
        first_pokemon = build_battle_pokemon(first_species, game_data.pokemon_moves)
        second_pokemon = build_battle_pokemon(second_species, game_data.pokemon_moves)
        if _simulate_auto_battle(first_pokemon, second_pokemon, rng):
            first_wins += 1
    return first_wins / repeat_count


def _simulate_auto_battle(first_pokemon: BattlePokemon, second_pokemon: BattlePokemon, rng: random.Random) -> bool:
    engine = BattleEngine(rng)

    for _ in range(MAX_SIMULATION_TURNS):
        if first_pokemon.is_fainted or second_pokemon.is_fainted:
            break
        first_move = choose_ai_move(first_pokemon, second_pokemon, rng)
        second_move = choose_ai_move(second_pokemon, first_pokemon, rng)
        engine.run_turn(first_pokemon, second_pokemon, first_move, second_move)

    if second_pokemon.is_fainted and not first_pokemon.is_fainted:
        return True
    if first_pokemon.is_fainted and not second_pokemon.is_fainted:
        return False
    return _first_pokemon_wins_stall_break(first_pokemon, second_pokemon)


def _first_pokemon_wins_stall_break(first_pokemon: BattlePokemon, second_pokemon: BattlePokemon) -> bool:
    first_hp_ratio = _hp_ratio(first_pokemon)
    second_hp_ratio = _hp_ratio(second_pokemon)
    if first_hp_ratio != second_hp_ratio:
        return first_hp_ratio > second_hp_ratio

    first_best_move = max(score_move(move, first_pokemon, second_pokemon) for move in first_pokemon.moves)
    second_best_move = max(score_move(move, second_pokemon, first_pokemon) for move in second_pokemon.moves)
    if first_best_move != second_best_move:
        return first_best_move > second_best_move

    first_total = _stat_total(first_pokemon.species)
    second_total = _stat_total(second_pokemon.species)
    if first_total != second_total:
        return first_total > second_total

    return first_pokemon.species.id < second_pokemon.species.id


def _hp_ratio(pokemon: BattlePokemon) -> float:
    if pokemon.max_hp <= 0:
        return 0.0
    return pokemon.current_hp / pokemon.max_hp


def _stat_total(species: Pokemon) -> int:
    return species.hp + species.attack + species.defense + species.sp_attack + species.sp_defense + species.speed


def _find_pokemon_by_name(game_data: GameData, name: str) -> Pokemon:
    normalized_name = name.strip().casefold()
    for pokemon in game_data.pokemon:
        if pokemon.name.casefold() == normalized_name:
            return pokemon
    raise ValueError(f"Could not find a Pokemon named {name!r}.")


def _build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train and use a simple Pokemon battle prediction model.")
    parser.add_argument("--train", action="store_true", help="Train a fresh model and save it to data/battle_model.json.")
    parser.add_argument("--battle-count", type=int, default=DEFAULT_BATTLE_COUNT, help="Number of random matchups to generate for training.")
    parser.add_argument("--repeat-count", type=int, default=DEFAULT_REPEAT_COUNT, help="How many battle simulations to run for each matchup label.")
    parser.add_argument("--seed", type=int, default=DEFAULT_RANDOM_SEED, help="Random seed used for training data generation.")
    parser.add_argument("--matchup", nargs=2, metavar=("FIRST", "SECOND"), help="Predict a matchup by Pokemon name.")
    return parser


def _print_training_summary(metadata: dict[str, int | float]) -> None:
    print(f"Saved model to {MODEL_PATH}")
    print(f"Training examples: {metadata['training_examples']}")
    print(f"Validation examples: {metadata['validation_examples']}")
    print(f"Training accuracy: {float(metadata['training_accuracy']):.1%}")
    print(f"Validation accuracy: {float(metadata['validation_accuracy']):.1%}")


def _print_matchup_prediction(prediction: MatchPrediction) -> None:
    print(f"Predicted winner: {prediction.predicted_winner}")
    print(f"{prediction.first_name} win chance: {prediction.first_win_probability:.1%}")
    print(f"{prediction.second_name} win chance: {prediction.second_win_probability:.1%}")


def main() -> None:
    parser = _build_argument_parser()
    args = parser.parse_args()

    if not args.train and args.matchup is None:
        parser.print_help()
        return

    if args.train:
        _, metadata = train_and_save_model(
            battle_count=args.battle_count,
            repeat_count=args.repeat_count,
            seed=args.seed,
        )
        _print_training_summary(metadata)

    if args.matchup is not None:
        predictor = BattlePredictor.load()
        if predictor is None:
            raise SystemExit("No trained model found. Run `python .\\src\\prediction.py --train` first.")

        game_data = load_game_data()
        first_species = _find_pokemon_by_name(game_data, args.matchup[0])
        second_species = _find_pokemon_by_name(game_data, args.matchup[1])
        _print_matchup_prediction(predictor.predict_species(game_data, first_species, second_species))


if __name__ == "__main__":
    main()
