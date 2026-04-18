from __future__ import annotations
from battle import BattleEngine, BattlePokemon, build_matchup_for_player, choose_ai_move
from data_loader import GameData, Pokemon, load_game_data
from prediction import BattlePredictor
from sprite_loader import SpriteCache, load_background_photo
import math
import random
import tkinter as tk

APP_COLORS = {
    "app_bg": "#b82528",
    "panel_bg": "#d84545",
    "button_bg": "#8f1d22",
    "button_active": "#a7262b",
    "border": "#303030",
    "log_bg": "#f9eee8",
    "text_dark": "#181818",
    "text_light": "#fff5f0",
    "canvas_fallback": "#7f1d1d",
}

WINDOW_SIZE = "980x920"
WINDOW_MIN_SIZE = (900, 820)
AUTO_BATTLE_DELAY_MS = 700
MOVE_RESULT_DELAY_MS = 550
HP_ANIMATION_DELAY_MS = 35
ROULETTE_SLOT_COUNT = 8
ROULETTE_BASE_SPIN_STEPS = 22
ROULETTE_RESULT_DELAY_MS = 1000


class PokemonBattleApp(tk.Tk):
    def __init__(self, game_data: GameData | None = None) -> None:
        super().__init__()
        self.title("Pokemon Battle Simulator")
        self.geometry(WINDOW_SIZE)
        self.minsize(*WINDOW_MIN_SIZE)
        self.configure(bg=APP_COLORS["app_bg"])
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)

        self.rng = random.Random()
        self.game_data = game_data if game_data is not None else load_game_data()
        self.engine = BattleEngine(self.rng)
        self.predictor = BattlePredictor.load()
        self.sprite_cache = SpriteCache(self)

        self.player: BattlePokemon | None = None
        self.opponent: BattlePokemon | None = None
        self.display_hp = {"player": None, "opponent": None}
        self.after_ids = {"turn": None, "hp": None, "roulette": None}
        self.screens: dict[str, tk.Frame] = {}
        self.side_items: dict[str, dict[str, int | str]] = {}
        self.roulette_photo_cache: dict[int, tk.PhotoImage] = {}

        self.matchup_label: tk.Label | None = None
        self.start_button: tk.Button | None = None
        self.battle_canvas: tk.Canvas | None = None
        self.log_text: tk.Text | None = None
        self.roulette_canvas: tk.Canvas | None = None
        self.roulette_result_label: tk.Label | None = None
        self.roulette_hint_label: tk.Label | None = None
        self.roulette_sprite_items: list[int] = []

        self.battle_ready = False
        self.auto_playing = False
        self.pending_turn_actions = []
        self._after_hp_callback = None
        self._roulette_pool: list[Pokemon] = []
        self._roulette_selected_species: Pokemon | None = None
        self._roulette_offset = 0
        self._roulette_final_index = 0
        self._roulette_steps_remaining = 0
        self._background_photo: tk.PhotoImage | None = None
        self._background_size = (0, 0)
        self._pikachu_photo: tk.PhotoImage | None = None

        self._build_start_screen()

    def _screen(self, name: str) -> tk.Frame:
        screen = tk.Frame(self, bg=APP_COLORS["app_bg"])
        screen.grid(row=0, column=0, sticky="nsew")
        screen.columnconfigure(0, weight=1)
        screen.rowconfigure(0, weight=1)
        self.screens[name] = screen
        return screen

    def _panel(self, parent: tk.Misc, row: int, column: int, *, padx=0, pady=0, sticky="", inner_bg="panel_bg", inner_pad=3) -> tk.Frame:
        border = tk.Frame(parent, bg=APP_COLORS["border"])
        border.grid(row=row, column=column, padx=padx, pady=pady, sticky=sticky)
        border.columnconfigure(0, weight=1)
        border.rowconfigure(0, weight=1)
        inner = tk.Frame(border, bg=APP_COLORS[inner_bg])
        inner.grid(row=0, column=0, sticky="nsew", padx=inner_pad, pady=inner_pad)
        return inner

    def _label(self, parent: tk.Misc, text: str, size: int, *, bg="panel_bg", fg="text_light") -> tk.Label:
        return tk.Label(parent, text=text, bg=APP_COLORS[bg], fg=APP_COLORS[fg], font=("Segoe UI", size, "bold"))

    def _button(self, parent: tk.Misc, text: str, command, *, state=tk.NORMAL) -> tk.Button:
        return tk.Button(
            parent,
            text=text,
            command=command,
            state=state,
            bg=APP_COLORS["button_bg"],
            fg=APP_COLORS["text_light"],
            activebackground=APP_COLORS["button_active"],
            activeforeground=APP_COLORS["text_light"],
            disabledforeground="#f0d6d0",
            relief="flat",
            bd=0,
            padx=12,
            pady=6,
            font=("Segoe UI", 10, "bold"),
            cursor="hand2",
        )

    def _show(self, name: str) -> None:
        for screen in self.screens.values():
            screen.grid_remove()
        self.screens[name].grid()

    def _build_start_screen(self) -> None:
        screen = self._screen("start")
        panel = self._panel(screen, 0, 0, padx=120, pady=90)
        panel.columnconfigure(0, weight=1)
        self._label(panel, "Pokemon Battle Simulator", 22).grid(row=0, column=0, padx=30, pady=(26, 8))
        self._label(panel, "Random battle mode", 11).grid(row=1, column=0, padx=30, pady=(0, 12))

        pikachu = next((pokemon for pokemon in self.game_data.pokemon if pokemon.name == "Pikachu"), None)
        self._pikachu_photo = self.sprite_cache.get_photo(pikachu, "front") if pikachu is not None else None
        tk.Label(panel, image=self._pikachu_photo, bg=APP_COLORS["panel_bg"], width=200, height=200).grid(row=2, column=0, padx=30, pady=(6, 16))

        self._button(panel, "Start", self._start_player_selection).grid(row=3, column=0, padx=30, pady=(0, 10), sticky="ew")
        self._button(panel, "Quit", self.destroy).grid(row=4, column=0, padx=30, pady=(0, 26), sticky="ew")

    def _build_roulette_screen(self) -> None:
        screen = self._screen("roulette")
        panel = self._panel(screen, 0, 0, padx=70, pady=70)
        panel.columnconfigure(0, weight=1)
        self._label(panel, "Pokemon Roulette", 22).grid(row=0, column=0, padx=28, pady=(24, 6))
        self.roulette_hint_label = self._label(panel, "Spinning to choose your Pokemon...", 11)
        self.roulette_hint_label.grid(row=1, column=0, padx=28, pady=(0, 10))

        canvas_frame = self._panel(panel, 2, 0, padx=28, pady=(4, 12), inner_bg="log_bg", inner_pad=2)
        self.roulette_canvas = tk.Canvas(canvas_frame, width=520, height=420, bg=APP_COLORS["log_bg"], bd=0, highlightthickness=0)
        self.roulette_canvas.grid(row=0, column=0)
        self.roulette_sprite_items = [self.roulette_canvas.create_image(0, 0, anchor="center") for _ in range(ROULETTE_SLOT_COUNT)]
        top_x, top_y = self._roulette_positions()[0]
        self.roulette_canvas.create_oval(top_x - 58, top_y - 58, top_x + 58, top_y + 58, outline=APP_COLORS["button_bg"], width=6)
        self.roulette_canvas.create_text(top_x, 26, text="YOUR POKEMON", fill=APP_COLORS["text_dark"], font=("Segoe UI", 10, "bold"))

        self.roulette_result_label = self._label(panel, "", 18)
        self.roulette_result_label.grid(row=3, column=0, padx=28, pady=(0, 24))

    def _build_main_screen(self) -> None:
        screen = self._screen("main")
        screen.rowconfigure(1, weight=1)

        toolbar = self._panel(screen, 0, 0, padx=14, pady=(14, 8), sticky="ew")
        toolbar.columnconfigure(1, weight=1)
        self._label(toolbar, "Random Pokemon Battle", 12).grid(row=0, column=0, padx=(12, 10), pady=10, sticky="w")
        self.matchup_label = self._label(toolbar, "Loading random matchup...", 11)
        self.matchup_label.grid(row=0, column=1, padx=8, pady=10, sticky="ew")
        self._button(toolbar, "Random Matchup", self._start_player_selection).grid(row=0, column=2, padx=(6, 6), pady=10)
        self.start_button = self._button(toolbar, "Start Battle", self.start_battle, state=tk.DISABLED)
        self.start_button.grid(row=0, column=3, padx=(0, 12), pady=10)

        arena = tk.Frame(screen, bg=APP_COLORS["app_bg"])
        arena.grid(row=1, column=0, sticky="nsew")
        arena.columnconfigure(0, weight=1)
        arena.rowconfigure(0, weight=5)
        arena.rowconfigure(1, weight=1)

        battlefield = self._panel(arena, 0, 0, padx=75, pady=(10, 6), sticky="nsew")
        battlefield.columnconfigure(0, weight=1)
        battlefield.rowconfigure(0, weight=1)
        self.battle_canvas = tk.Canvas(battlefield, bd=0, highlightthickness=0, bg=APP_COLORS["canvas_fallback"])
        self.battle_canvas.grid(row=0, column=0, sticky="nsew", padx=16, pady=16)
        self.battle_canvas.bind("<Configure>", self._draw_battlefield)
        self.background_rect = self.battle_canvas.create_rectangle(0, 0, 1, 1, fill=APP_COLORS["canvas_fallback"], outline="")
        self.background_image = self.battle_canvas.create_image(0, 0, anchor="nw")
        self.versus_text = self.battle_canvas.create_text(0, 0, text="VS", fill=APP_COLORS["text_light"], font=("Segoe UI", 24, "bold"))
        self.side_items = {"player": self._side_items("back"), "opponent": self._side_items("front")}

        log_frame = self._panel(arena, 1, 0, padx=12, pady=(0, 12), sticky="nsew")
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(1, weight=1)
        self._label(log_frame, "Battle Log", 11).grid(row=0, column=0, sticky="w", padx=10, pady=(10, 6))
        log_body = self._panel(log_frame, 1, 0, padx=10, pady=(0, 10), sticky="nsew", inner_bg="log_bg", inner_pad=1)
        log_body.columnconfigure(0, weight=1)
        log_body.rowconfigure(0, weight=1)
        self.log_text = tk.Text(
            log_body,
            height=9,
            wrap="word",
            state="disabled",
            bg=APP_COLORS["log_bg"],
            fg=APP_COLORS["text_dark"],
            insertbackground=APP_COLORS["text_dark"],
            selectbackground=APP_COLORS["button_bg"],
            selectforeground=APP_COLORS["text_light"],
            relief="flat",
            bd=0,
        )
        self.log_text.grid(row=0, column=0, sticky="nsew")
        scrollbar = tk.Scrollbar(log_body, orient="vertical", command=self.log_text.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.log_text.configure(yscrollcommand=scrollbar.set)

    def _side_items(self, side: str) -> dict[str, int | str]:
        return {
            "side": side,
            "sprite": self.battle_canvas.create_image(0, 0, anchor="center"),
            "name": self.battle_canvas.create_text(0, 0, text="", fill=APP_COLORS["text_light"], font=("Segoe UI", 12, "bold"), anchor="s"),
            "hp_bg": self.battle_canvas.create_rectangle(0, 0, 1, 1, fill="#262626", outline="#7a7a7a", width=1),
            "hp_fill": self.battle_canvas.create_rectangle(0, 0, 1, 1, fill="#38c65a", outline=""),
            "hp_label": self.battle_canvas.create_text(0, 0, text="", fill=APP_COLORS["text_light"], font=("Segoe UI", 9, "bold"), anchor="w"),
        }

    def _start_player_selection(self) -> None:
        self._stop_battle()
        self._cancel_after("roulette")
        if "roulette" not in self.screens:
            self._build_roulette_screen()
        self._show("roulette")
        self._begin_roulette_spin()

    def _roulette_positions(self) -> list[tuple[int, int]]:
        center_x, center_y, radius_x, radius_y = 260, 225, 155, 130
        return [
            (
                int(center_x + math.cos(math.radians(-90 + i * (360 / ROULETTE_SLOT_COUNT))) * radius_x),
                int(center_y + math.sin(math.radians(-90 + i * (360 / ROULETTE_SLOT_COUNT))) * radius_y),
            )
            for i in range(ROULETTE_SLOT_COUNT)
        ]

    def _begin_roulette_spin(self) -> None:
        if self.roulette_result_label is None or self.roulette_hint_label is None:
            return
        self._roulette_selected_species = self.rng.choice(list(self.game_data.pokemon))
        self._roulette_pool = self._roulette_pool_for(self._roulette_selected_species)
        self._roulette_offset = self.rng.randrange(ROULETTE_SLOT_COUNT)
        step_goal = ROULETTE_BASE_SPIN_STEPS + self.rng.randrange(ROULETTE_SLOT_COUNT)
        self._roulette_steps_remaining = step_goal + (self._roulette_final_index - (self._roulette_offset + step_goal)) % ROULETTE_SLOT_COUNT
        self.roulette_result_label.configure(text="")
        self.roulette_hint_label.configure(text="Spinning to choose your Pokemon...")
        self._redraw_roulette_wheel()
        self._advance_roulette()

    def _roulette_pool_for(self, selected: Pokemon) -> list[Pokemon]:
        others = [pokemon for pokemon in self.game_data.pokemon if pokemon.id != selected.id]
        pool = self.rng.sample(others, ROULETTE_SLOT_COUNT - 1) if len(others) >= ROULETTE_SLOT_COUNT - 1 else list(others)
        while len(pool) < ROULETTE_SLOT_COUNT - 1:
            pool.append(self.rng.choice(others))
        self._roulette_final_index = self.rng.randrange(ROULETTE_SLOT_COUNT)
        pool.insert(self._roulette_final_index, selected)
        return pool

    def _advance_roulette(self) -> None:
        if self._roulette_steps_remaining <= 0:
            self._finish_roulette_spin()
            return
        self._roulette_offset = (self._roulette_offset + 1) % ROULETTE_SLOT_COUNT
        self._roulette_steps_remaining -= 1
        self._redraw_roulette_wheel()
        delay = 65 if self._roulette_steps_remaining > 12 else 95 if self._roulette_steps_remaining > 6 else 130
        self._set_after("roulette", delay, self._advance_roulette)

    def _redraw_roulette_wheel(self) -> None:
        if self.roulette_canvas is None or not self._roulette_pool:
            return
        for slot, (x, y) in enumerate(self._roulette_positions()):
            pokemon = self._roulette_pool[(self._roulette_offset + slot) % len(self._roulette_pool)]
            if pokemon.id not in self.roulette_photo_cache:
                self.roulette_photo_cache[pokemon.id] = self.sprite_cache.get_photo(pokemon, "front").subsample(2, 2)
            self.roulette_canvas.coords(self.roulette_sprite_items[slot], x, y)
            self.roulette_canvas.itemconfigure(self.roulette_sprite_items[slot], image=self.roulette_photo_cache[pokemon.id])

    def _finish_roulette_spin(self) -> None:
        self.after_ids["roulette"] = None
        if self._roulette_selected_species is None or self.roulette_result_label is None or self.roulette_hint_label is None:
            return
        self._roulette_offset = self._roulette_final_index
        self._redraw_roulette_wheel()
        self.roulette_result_label.configure(text=f"You got {self._roulette_selected_species.name}!")
        self.roulette_hint_label.configure(text="Getting the battle ready...")
        self._set_after("roulette", ROULETTE_RESULT_DELAY_MS, self._show_selected_matchup)

    def _show_selected_matchup(self) -> None:
        self.after_ids["roulette"] = None
        if self._roulette_selected_species is None:
            return
        if "main" not in self.screens:
            self._build_main_screen()
        self._show("main")
        self.prepare_matchup_for_player(self._roulette_selected_species)

    def prepare_matchup_for_player(self, player_species: Pokemon) -> None:
        if self.matchup_label is None or self.log_text is None:
            return
        self._stop_battle()
        self.player, self.opponent = build_matchup_for_player(self.game_data, player_species, self.rng)
        self.display_hp = {"player": float(self.player.current_hp), "opponent": float(self.opponent.current_hp)}
        self.battle_ready = True
        self.matchup_label.configure(text=f"{self.player.name} vs {self.opponent.name}")
        self._clear_log()
        self._log(f"Roulette selected {self.player.name}.")
        self._log(f"Opponent chosen: {self.opponent.name}.")
        self._log(self._prediction_message())
        self._log("Press Start Battle to watch the fight play out.")
        self._update_buttons()
        self._draw_battlefield()

    def start_battle(self) -> None:
        if not self.battle_ready or self.player is None or self.opponent is None:
            return
        self.battle_ready = False
        self.auto_playing = True
        self.pending_turn_actions = []
        self._after_hp_callback = None
        self._update_buttons()
        self._log("Battle started.")
        self._set_after("turn", AUTO_BATTLE_DELAY_MS, self._auto_play_step)

    def _auto_play_step(self) -> None:
        self.after_ids["turn"] = None
        if not self.auto_playing or self.player is None or self.opponent is None:
            return
        if self._battle_over():
            self._finish_auto_battle()
            return

        if not self.pending_turn_actions:
            player_move = choose_ai_move(self.player, self.opponent, self.rng)
            opponent_move = choose_ai_move(self.opponent, self.player, self.rng)
            self.pending_turn_actions = self.engine.determine_turn_actions(self.player, self.opponent, player_move, opponent_move)

        self._play_next_turn_action()

    def _play_next_turn_action(self) -> None:
        if not self.auto_playing or self.player is None or self.opponent is None:
            return
        if self._battle_over():
            self._finish_auto_battle()
            return

        while self.pending_turn_actions:
            attacker, defender, move = self.pending_turn_actions.pop(0)
            if attacker.is_fainted or defender.is_fainted:
                continue

            for note in self.engine.perform_attack(attacker, defender, move):
                self._log(note)

            self._draw_battlefield()
            if self._hp_animation_needed():
                self._after_hp_callback = self._after_move_resolution
                self._schedule_hp_animation()
            else:
                self._set_after("turn", MOVE_RESULT_DELAY_MS, self._after_move_resolution)
            return

        if self._battle_over():
            self._finish_auto_battle()
            return
        self._set_after("turn", AUTO_BATTLE_DELAY_MS, self._auto_play_step)

    def _after_move_resolution(self) -> None:
        self._after_hp_callback = None
        if not self.auto_playing:
            return
        if self._battle_over():
            self._finish_auto_battle()
            return
        if self.pending_turn_actions:
            self._set_after("turn", MOVE_RESULT_DELAY_MS, self._play_next_turn_action)
            return
        self._set_after("turn", AUTO_BATTLE_DELAY_MS, self._auto_play_step)

    def _draw_battlefield(self, _event: tk.Event | None = None) -> None:
        if self.battle_canvas is None:
            return
        width = max(1, self.battle_canvas.winfo_width())
        height = max(1, self.battle_canvas.winfo_height())
        self._draw_background(width, height)
        self.battle_canvas.coords(self.versus_text, int(width * 0.50), int(height * 0.50))

        layouts = {
            "player": (self.player, int(width * 0.28), int(height * 0.71), max(24, int(height * 0.71) - 144), max(190, min(230, width // 3))),
            "opponent": (self.opponent, int(width * 0.80), int(height * 0.29), 28, max(155, min(190, width // 4))),
        }
        for key, (pokemon, x, y, top_y, bar_width) in layouts.items():
            items = self.side_items[key]
            self.battle_canvas.coords(items["sprite"], x, y)
            if pokemon is None:
                self.battle_canvas.itemconfigure(items["sprite"], image="")
                self.battle_canvas.itemconfigure(items["name"], text="")
                self.battle_canvas.itemconfigure(items["hp_label"], text="")
                continue
            self.battle_canvas.itemconfigure(items["sprite"], image=self.sprite_cache.get_photo(pokemon.species, str(items["side"])))
            self._place_status(items, pokemon, self.display_hp[key], x, top_y, bar_width, width)

    def _draw_background(self, width: int, height: int) -> None:
        self.battle_canvas.coords(self.background_rect, 0, 0, width, height)
        if self._background_size != (width, height):
            self._background_photo = load_background_photo(self, width, height)
            self._background_size = (width, height)
        self.battle_canvas.itemconfigure(self.background_image, image="" if self._background_photo is None else self._background_photo)
        if self._background_photo is not None:
            self.battle_canvas.coords(self.background_image, 0, 0)

    def _place_status(self, items: dict[str, int | str], pokemon: BattlePokemon, shown_hp: float | None, center_x: int, top_y: int, bar_width: int, canvas_width: int) -> None:
        hp_text_width, half_bar = 70, bar_width // 2
        min_x = half_bar + 14
        max_x = canvas_width - half_bar - hp_text_width - 14
        bar_x = canvas_width // 2 if max_x < min_x else max(min_x, min(center_x, max_x))
        bar_left, bar_right = bar_x - half_bar, bar_x + half_bar
        bar_top = max(8, top_y)
        hp_percent = 0.0 if pokemon.max_hp <= 0 else max(0.0, min(1.0, (float(pokemon.current_hp) if shown_hp is None else shown_hp) / pokemon.max_hp))
        fill_right = bar_left + 1 + int((bar_width - 2) * hp_percent)
        fill_color = "#38c65a" if hp_percent > 0.5 else "#f5c542" if hp_percent > 0.2 else "#d94141"

        self.battle_canvas.coords(items["name"], bar_x, bar_top - 4)
        self.battle_canvas.itemconfigure(items["name"], text=pokemon.name)
        self.battle_canvas.coords(items["hp_bg"], bar_left, bar_top, bar_right, bar_top + 8)
        self.battle_canvas.coords(items["hp_fill"], bar_left + 1, bar_top + 1, fill_right, bar_top + 7)
        self.battle_canvas.itemconfigure(items["hp_fill"], fill=fill_color)
        self.battle_canvas.coords(items["hp_label"], bar_right + 8, bar_top + 4)
        self.battle_canvas.itemconfigure(items["hp_label"], text=f"{int(round(shown_hp or 0))}/{pokemon.max_hp}")

    def _battle_over(self) -> bool:
        return bool(self.player and self.opponent and (self.player.is_fainted or self.opponent.is_fainted))

    def _winner_message(self) -> str | None:
        if self.player is None or self.opponent is None:
            return None
        if self.opponent.is_fainted:
            return f"You win! {self.opponent.name} fainted."
        if self.player.is_fainted:
            return f"You lost. {self.player.name} fainted."
        return None

    def _stop_battle(self) -> None:
        self.auto_playing = False
        self.battle_ready = False
        self.pending_turn_actions = []
        self._after_hp_callback = None
        self._cancel_after("turn")
        self._cancel_after("hp")
        self._update_buttons()

    def _finish_auto_battle(self) -> None:
        self.auto_playing = False
        self.pending_turn_actions = []
        self._after_hp_callback = None
        self._update_buttons()
        self._draw_battlefield()
        winner_message = self._winner_message()
        if winner_message is not None:
            self._log(winner_message)

    def _update_buttons(self) -> None:
        if self.start_button is not None:
            self.start_button.configure(state=tk.NORMAL if self.battle_ready and not self.auto_playing else tk.DISABLED)

    def _prediction_message(self) -> str:
        if self.player is None or self.opponent is None:
            return "ML prediction unavailable."
        if self.predictor is None:
            return "ML prediction unavailable. Train it with `python .\\src\\prediction.py --train`."

        prediction = self.predictor.predict_battle(self.player, self.opponent)
        return f"ML prediction: {prediction.predicted_winner} has a {prediction.confidence:.1%} chance to win."

    def _log(self, message: str) -> None:
        if self.log_text is None:
            return
        self.log_text.configure(state="normal")
        self.log_text.insert("end", f"{message}\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _clear_log(self) -> None:
        if self.log_text is None:
            return
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")

    def _schedule_hp_animation(self) -> None:
        if self.after_ids["hp"] is not None or not self._hp_animation_needed():
            return
        self._set_after("hp", HP_ANIMATION_DELAY_MS, self._animate_hp_step)

    def _hp_animation_needed(self) -> bool:
        pairs = [("player", self.player), ("opponent", self.opponent)]
        return any(pokemon is not None and self.display_hp[key] is not None and abs(self.display_hp[key] - pokemon.current_hp) > 0.25 for key, pokemon in pairs)

    def _animate_hp_step(self) -> None:
        self.after_ids["hp"] = None
        for key, pokemon in (("player", self.player), ("opponent", self.opponent)):
            if pokemon is not None:
                self.display_hp[key] = self._next_display_hp(self.display_hp[key], float(pokemon.current_hp))
        self._draw_battlefield()
        if self._hp_animation_needed():
            self._set_after("hp", HP_ANIMATION_DELAY_MS, self._animate_hp_step)
            return
        if self._after_hp_callback is not None:
            callback = self._after_hp_callback
            self._after_hp_callback = None
            callback()

    def _next_display_hp(self, current: float | None, target: float) -> float:
        current = target if current is None else current
        if abs(target - current) <= 0.25:
            return target
        step = max(1.0, abs(target - current) * 0.22)
        return min(target, current + step) if target > current else max(target, current - step)

    def _set_after(self, key: str, delay_ms: int, callback) -> None:
        self._cancel_after(key)
        self.after_ids[key] = self.after(delay_ms, callback)

    def _cancel_after(self, key: str) -> None:
        if self.after_ids[key] is not None:
            self.after_cancel(self.after_ids[key])
            self.after_ids[key] = None


def run_gui() -> None:
    app = PokemonBattleApp()
    app.mainloop()
