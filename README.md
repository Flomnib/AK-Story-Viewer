# Rhodes Archive: offline Arknights story reader

A Home Screen web app for iPhone. Download story chapters on wifi, and it plays them later with no connection. You get the backgrounds, CGs, character sprites, music, sound effects, fades, camera shakes and choices.

## Put it online (one time, about 5 minutes)

1. Create a free GitHub account if you don't have one, then make a new **public** repository, e.g. `rhodes-archive`.
2. Click **Add file → Upload files**, drag in everything in this folder (`index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `asset-index.json`, the three `.png` icons), and commit.
3. Go to **Settings → Pages**, set Source to **Deploy from a branch**, pick `main` / `(root)`, and save.
4. After a minute your app is live at `https://<your-username>.github.io/rhodes-archive/`.

## Install on iPhone

1. Open that URL in **Safari** and tap **Share → Add to Home Screen**.
2. Open **Rhodes Archive from the new icon**. Do your downloads there. The Home Screen app has its own storage, separate from Safari.
3. Pick a story, tap **Download for offline**, and keep the app open until it finishes.
4. Switch on Airplane Mode and open a chapter to confirm it plays.

## Notes

- Sizes vary a lot: an early main episode is about 25 MB, while a big recent event can be 300 MB or more because of its music and CGs.
- Tap to advance. **Auto** reads hands-free, **Skip** fast-forwards to the next choice, and **Log** shows the backlog. The app remembers where you stopped in each chapter.
- Landscape gives the full stage. In portrait the text sits under the picture.
- Music keeps playing with the silent switch on (iOS 16.4+).
- **Check for new stories** refreshes the chapter list. If a brand-new event shows missing art, rebuild the index with `python3 tools/build_index.py > asset-index.json` (needs git), re-upload it, and bump `VERSION` in `sw.js`.
- Not rendered: Spine-animated sprites, particle effects (`Effect`/`bgEffect`) and the rare in-story video. Those parts fall back to static art or are skipped.

## Data sources

Fan-maintained GitHub mirrors, loaded on demand: story text from Kengxxiao/ArknightsGameData_YoStar (EN), images from fexli/ArknightsResource with Aceship/Arknight-Images as a fallback, and audio from ThiagoVsky/arknights-sound. Arknights and its assets belong to Hypergryph / Yostar. This is a personal fan reader.
