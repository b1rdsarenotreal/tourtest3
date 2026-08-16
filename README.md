# Fortnight — an alt-universe WTA Tour tracker

A small web app for running your own fictional women's tennis tour: add players,
schedule tournaments, log match results, and watch the rankings update automatically.

No build step, no backend, no login. It's a single static site. All data is stored
in your browser's `localStorage`, so it lives on whichever device/browser you use it in.

## Features

- **Players** — add fictional players (name, country code, handedness, turned-pro year, height). Edit any player's details after adding them.
- **Tournaments** — Grand Slam / WTA 1000 / 500 / 250 levels, each with its own
  ranking-points scale, plus surface (hard/clay/grass) and a real start date.
  Draw sizes match the actual pro tour: 28, 30, 32, 48, 56, 64, 96, or 128.
- **Real seeded draws** — assign seeds 1 through N and pick your unseeded
  entrants, then hit **Generate Draw**. It runs an actual tournament seeding
  algorithm: seed 1 and 2 anchor opposite ends of the bracket, seeds 3–4 land
  one per half, 5–8 one per quarter, and so on in pots, so same-pot seeds
  can't meet early. Draw sizes that aren't a power of two (28, 30, 48, 56, 96)
  automatically get the right number of byes, handed to the top seeds first —
  exactly how it works on tour. A manual per-slot override panel is there too,
  for one-off fixes.
- **Bracket play** — each ready match gets an inline "Enter Result" form;
  winners automatically advance to the next round. Clearing a result cascades
  forward and clears anything built on top of it, so the bracket never gets
  out of sync.
- **Rankings** — a rolling 52-week points total, just like the real tour,
  with weekly movement arrows (▲▼NEW) against the previous week. You can also
  view all-time totals or any single season.
- **Player profiles** — career titles, current & peak ranking, a ranking-history
  chart plotted across every tournament played, a surface-by-surface win/loss
  breakdown, full tournament-by-tournament results with a one-click link back
  into that tournament's bracket, and recent match results.
- **Match History** — every result, filterable by player or tournament, with
  a scoreboard-style score display. Delete mistaken entries any time.

## Running it locally

No install needed — it's plain HTML/CSS/JS. Just open `index.html` in a browser,
or serve the folder with any static server, e.g.:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Putting it on GitHub

1. Create a new repository on GitHub (e.g. `fortnight-tour`).
2. Push these three files (`index.html`, `style.css`, `app.js`) plus this README
   to the repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Fortnight WTA tour tracker"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

## Hosting it for free with GitHub Pages

1. In your repo on GitHub, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to "Deploy from a branch".
3. Set **Branch** to `main` and folder to `/ (root)`, then **Save**.
4. After a minute or two, GitHub will publish it at:
   `https://<your-username>.github.io/<your-repo>/`

That's it — no build pipeline required, since this is a static site.

## A note on data

Because everything is saved in your browser's local storage:
- Data does **not** sync between devices or browsers.
- Clearing your browser's site data/history for this page will erase your tour.
- There's no way to lose data by refreshing or closing the tab — it persists
  until you clear it.

If you outgrow this later and want data that syncs across devices, the natural
next step is adding a small backend (or a service like Supabase/Firebase) —
happy to help with that when you're ready.

## Customizing the points scale

The ranking-points table lives at the top of `app.js` as `POINTS_TABLE`, keyed
by tournament level and round. Edit the numbers there to rebalance your tour's
scoring — no other code needs to change.
