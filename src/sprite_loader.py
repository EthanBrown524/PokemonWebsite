from __future__ import annotations
from pathlib import Path
from data_loader import BATTLE_BACKGROUND_PATH, Pokemon, SPRITE_CACHE_DIR
import tkinter as tk
import urllib.error
import urllib.request


class SpriteCache:
    def __init__(self, root: tk.Misc, cache_dir: Path = SPRITE_CACHE_DIR) -> None:
        self.root = root
        self.cache_dir = cache_dir
        self.photos: dict[tuple[int, str], tk.PhotoImage] = {}
        self.placeholder_photo: tk.PhotoImage | None = None

    def get_photo(self, pokemon: Pokemon, side: str) -> tk.PhotoImage:
        key = (pokemon.id, side)
        if key not in self.photos:
            sprite_path = self._ensure_sprite_file(pokemon, side)
            self.photos[key] = self._load_photo(sprite_path)
        return self.photos[key]

    def _ensure_sprite_file(self, pokemon: Pokemon, side: str) -> Path | None:
        sprite_url = pokemon.back_sprite if side == "back" else pokemon.front_sprite
        if not sprite_url:
            return None

        self.cache_dir.mkdir(parents=True, exist_ok=True)
        sprite_path = self.cache_dir / f"{pokemon.id}_{side}.png"
        if sprite_path.exists():
            return sprite_path

        request = urllib.request.Request(sprite_url, headers={"User-Agent": "PokemonBattleSimulator/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=4) as response:
                sprite_path.write_bytes(response.read())
        except (urllib.error.URLError, OSError):
            return None

        return sprite_path

    def _load_photo(self, sprite_path: Path | None) -> tk.PhotoImage:
        if sprite_path is None:
            return self._get_placeholder_photo()

        try:
            photo = tk.PhotoImage(master=self.root, file=str(sprite_path))
        except tk.TclError:
            return self._get_placeholder_photo()

        return photo.zoom(2, 2)

    def _get_placeholder_photo(self) -> tk.PhotoImage:
        if self.placeholder_photo is None:
            photo = tk.PhotoImage(master=self.root, width=160, height=160)
            photo.put("#d9e6f2", to=(0, 0, 160, 160))
            photo.put("#9eb8d1", to=(8, 8, 152, 152))
            photo.put("#edf4fb", to=(16, 16, 144, 144))
            self.placeholder_photo = photo
        return self.placeholder_photo


def load_background_photo(root: tk.Misc, width: int, height: int, path: Path = BATTLE_BACKGROUND_PATH) -> tk.PhotoImage | None:
    if not path.exists():
        return None

    try:
        from PIL import Image, ImageTk

        image = Image.open(path).convert("RGBA")
        resampling = Image.Resampling.BILINEAR if hasattr(Image, "Resampling") else Image.BILINEAR
        image = image.resize((width, height), resampling)
        return ImageTk.PhotoImage(image, master=root)
    except (ImportError, OSError, tk.TclError, AttributeError):
        try:
            return tk.PhotoImage(master=root, file=str(path))
        except tk.TclError:
            return None
