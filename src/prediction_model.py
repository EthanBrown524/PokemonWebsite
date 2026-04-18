from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from statistics import pstdev


@dataclass(frozen=True)
class TrainingExample:
    features: tuple[float, ...]
    label: float


@dataclass(frozen=True)
class LogisticModel:
    feature_names: tuple[str, ...]
    means: tuple[float, ...]
    scales: tuple[float, ...]
    weights: tuple[float, ...]
    bias: float

    def predict_probability(self, features: tuple[float, ...]) -> float:
        standardized = tuple(
            (value - mean) / scale
            for value, mean, scale in zip(features, self.means, self.scales, strict=True)
        )
        score = self.bias + sum(weight * value for weight, value in zip(self.weights, standardized, strict=True))
        return _sigmoid(score)

    def save(self, path: Path, metadata: dict[str, int | float | str] | None = None) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "feature_names": list(self.feature_names),
            "means": list(self.means),
            "scales": list(self.scales),
            "weights": list(self.weights),
            "bias": self.bias,
            "metadata": metadata or {},
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "LogisticModel":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            feature_names=tuple(payload["feature_names"]),
            means=tuple(float(value) for value in payload["means"]),
            scales=tuple(float(value) for value in payload["scales"]),
            weights=tuple(float(value) for value in payload["weights"]),
            bias=float(payload["bias"]),
        )


def train_logistic_model(
    examples: list[TrainingExample],
    feature_names: tuple[str, ...],
    learning_rate: float = 0.08,
    epochs: int = 450,
    l2_penalty: float = 0.001,
) -> LogisticModel:
    if not examples:
        raise ValueError("Cannot train a logistic model without any examples.")

    means = tuple(
        sum(example.features[index] for example in examples) / len(examples)
        for index in range(len(feature_names))
    )
    scales = tuple(
        _safe_scale(tuple(example.features[index] for example in examples), mean)
        for index, mean in enumerate(means)
    )
    standardized_examples = [
        TrainingExample(
            features=tuple(
                (value - mean) / scale
                for value, mean, scale in zip(example.features, means, scales, strict=True)
            ),
            label=example.label,
        )
        for example in examples
    ]

    weights = [0.0] * len(feature_names)
    bias = 0.0

    for _ in range(epochs):
        gradient_weights = [0.0] * len(feature_names)
        gradient_bias = 0.0

        for example in standardized_examples:
            prediction = _sigmoid(bias + sum(weight * value for weight, value in zip(weights, example.features, strict=True)))
            error = prediction - example.label
            gradient_bias += error
            for index, value in enumerate(example.features):
                gradient_weights[index] += error * value

        sample_count = len(standardized_examples)
        for index in range(len(weights)):
            regularized_gradient = (gradient_weights[index] / sample_count) + (l2_penalty * weights[index])
            weights[index] -= learning_rate * regularized_gradient
        bias -= learning_rate * (gradient_bias / sample_count)

    return LogisticModel(
        feature_names=feature_names,
        means=means,
        scales=scales,
        weights=tuple(weights),
        bias=bias,
    )


def measure_accuracy(model: LogisticModel, examples: list[TrainingExample]) -> float:
    if not examples:
        return 0.0

    correct_predictions = 0
    for example in examples:
        prediction = model.predict_probability(example.features)
        predicted_label = 1 if prediction >= 0.5 else 0
        expected_label = 1 if example.label >= 0.5 else 0
        if predicted_label == expected_label:
            correct_predictions += 1
    return correct_predictions / len(examples)


def _safe_scale(values: tuple[float, ...], mean: float) -> float:
    return max(pstdev(values, mu=mean), 1.0)


def _sigmoid(value: float) -> float:
    if value >= 0:
        exp_value = math.exp(-value)
        return 1 / (1 + exp_value)
    exp_value = math.exp(value)
    return exp_value / (1 + exp_value)
