# Pokemon Battle Simulator Website

This project is now a browser-based Pokemon battle website that keeps the same red battle-machine style from the Tkinter version, including roulette selection, the battle arena, the auto-battle log, and the machine-learning matchup prediction.

It also adds a betting loop:

- every run starts with `100` Pokedollars
- you can bet on either Pokemon before each battle
- correct bets pay even money
- the run ends when you cash out or hit `0`

## Run The Website

Because the site loads local CSV and JSON files with `fetch`, open it through a web server instead of double-clicking `index.html`.

```powershell
cd "D:\ClassProjects\ActualProj4 - Copy"
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Website Flow

- Press `Start` to begin a new run with `100` Pokedollars.
- Watch the roulette choose your Pokemon.
- Review the matchup and ML prediction.
- Pick a side, enter a bet, and press `Start Battle`.
- Spin another matchup or `Cash Out` after each battle.

## Data And Assets

- `index.html` is the website entry point.
- `styles.css` recreates the original red simulator look for the browser.
- `web/js/` contains the browser logic for data loading, battle simulation, roulette flow, prediction, and betting.
- `assets/sprites/battle_background.png` is still used for the battlefield art.
- `assets/icons/pokedollar.svg` is the local wallet icon used for the betting UI.

## Original Python Files

The original Python source is still in `src/` as the source logic this site was ported from. That includes the battle rules and the predictor training utilities.

## Train The Predictor

If you want to retrain the model used by the website:

```powershell
cd "D:\ClassProjects\ActualProj4 - Copy"
python .\src\prediction.py --train
```

This rewrites `data/battle_model.json`, which the website loads directly.

