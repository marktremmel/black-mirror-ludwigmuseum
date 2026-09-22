# Black Mirror · Pocket Guide

A phone-first web app for the Ludwig Museum exhibition *Black Mirror. The Long Shadow of the Future*
(until 11 Oct 2026), built for the grade 10–11 visit in case there's no English tour.

- **Map:** one crisp floor plan (vectorised from the five printed path maps, which all share the same floor).
  Paths A–E are highlighted and numbered in walking order. Pins stay put at any screen size.
- **Listen:** every wall text, the five room intros and the entrance wall text, read by neural voices.
  The text follows along sentence by sentence; tap any sentence to jump there. Speed defaults to 1.1×.
- **Podcast mode:** plays a whole path: room intro → "next stop, a few steps away" → artwork → …,
  with a walking pause between stops.
- **Where am I?** Point the camera at a work. An on-device vision model (DINOv2-small) recognises it and
  combines that with where you were last. It shows a glowing guess on the map, the top 3 guesses, and
  an AR-style label. You can also long-press the map, or tap "I'm here" on any work.
- **Threads:** 11 cross-path connections (e.g. *Lenin, again and again*, *Maps that lie*).
- **Music (opt-in):** a generated soft-piano arpeggio that changes mood per section and dips under the
  voice, or the *Her* score if you add it (see below).
- **Remix Lab:** photo → mood filter → stickers + caption, saved on the phone.
- **Tap-to-explain:** ~90 tricky words and references (dystopia, agitprop, Ceaușescu, non-places…) get a dotted underline the first time they appear, with a friendly one-liner.
- **Show-around tour:** runs on first start, replayable from ⚙ or My picks.
- **Reflection + hand-in:** top 3, vibe check, one of three opinion questions, six words, remix. Makes a one-page PDF with a visible code and hidden answers.
- **Teacher mode** (`teacher.html`): drop the PDFs in (or paste codes) for a class leaderboard, mood mix, average hope and a wall of six-word reviews. Offline, nothing uploaded.

Nothing is uploaded anywhere; everything runs in the browser.

## Voices

| Mode | What it is | Good for |
| --- | --- | --- |
| Studio (default) | Kokoro-82M, pre-rendered here as small MP3s (~40 kbps) with sentence timings | phones: instant, offline, low battery |
| Live on device | the same Kokoro model generating in the browser (~92 MB one-time download) | laptops, curious students, 13 voices |
| Phone voice | the built-in system speech | fallback |

Text size is adjustable in ⚙: five steps from 0.9x to 1.5x that scale the whole interface, not just the article text.

Studio voices, named by sound rather than gender: **Halo** (bright, US), **Linen** (clear, UK),
**Basalt** (deeper, US), **Oak** (deepest, UK). Each has a "try" button.

## Run it locally

```bash
node tools/serve.mjs 8765
```

Then open http://localhost:8765. This server supports audio seeking and sends the headers the
on-device models need for multi-threading.

## Put it online (needs https for the camera)

**This repo is the site.** The app lives at the repo root (`index.html`, `js/`, `audio/`, …) so GitHub Pages
publishes it straight from the `main` branch, no settings to change. Every push goes live at
https://marktremmel.github.io/black-mirror-ludwigmuseum/ a minute or so later. `.nojekyll` keeps Pages from
running Jekyll over it.

Any other static host works too: drop the whole folder onto Netlify Drop, or use Cloudflare Pages.
The service worker adds the cross-origin-isolation headers by itself.
The `site/` folder is about 140 MB (132 MB of it is audio, ~33 MB per voice); delete any voice folder in `site/audio/` you don’t need.

## Before the visit (tell students)

1. Open the link at school or home **on Wi-Fi**. Optionally "Add to Home Screen".
2. ⚙ → **Save for offline** (one voice, about 40 MB for everything).
3. Bring headphones.

## After the visit

Students hand in a PDF (email or Classroom). Open `teacher.html` (My picks → Teacher mode), drop the PDFs
in and you get the tally plus a CSV. Give students [STUDENT_GUIDE.md](STUDENT_GUIDE.md) beforehand (put your
link in where it says LINK HERE).

## Changing content

- Texts, positions, threads, pronunciations: `tools/build_data.py` → `python3 tools/build_data.py`
  (the tools write into the repo root, which is the site)
- Re-record changed bits only: `node tools/render_audio.mjs af_heart` (per voice; skips unchanged segments)
- Recognition references after changing photos: `DT=q4 node tools/embed.mjs && DT=fp32 node tools/embed.mjs`
- Stickers: `python3 tools/build_stickers.py` (152 in 10 packs; cyber cutouts live in `stickers/cyber-cutout/`)
- Explanations: edit `site/data/glossary.json` (no rebuild needed)
- Tool dependencies: `cd tools && npm install`

## The *Her* soundtrack

A transcoded copy (96 kbps, 29 MB) is in `music-optional/music/`, **outside** `site/` on purpose: it's
copyrighted, so don't put it on a public URL. For private or local use, copy `music-optional/music` into
`site/music` and a "Her soundtrack" option appears under Music.

## What is not in this repo

`.gitignore` keeps these out of a public repo on purpose:

- `stickers/` — the original asset packs (276 MB of source files and zips). Using them in this app is fine
  (the Designsoup licence explicitly covers educational projects); what the licence rules out is passing the
  raw pack along as a pack. All 152 stickers, graffiti included, ship with the app in `site/img/stickers/`.
- `music-optional/` and the *Her* album — copyrighted music. Keep it off any public URL.
- The full-size original artwork photos and `Ludwig.pages`. The app ships web-sized copies in `site/img/art/`.

So a fresh clone can rebuild the texts and audio, but not the artwork images, the stickers or the
recognition references: for those you need the original files from the working folder.

## Honest limits

- Recognition was tested on synthetic "phone photos" of the press images: 77% top-1 and 92% top-3
  on phones (q4), and about 83% with the map prior. Real gallery light, reflections and video works will differ,
  so **test it in the museum** before relying on it. The top-3 picker and long-press on the map are the fallbacks.
- Live on-device voice is slow on older phones. Studio voices are the default for that reason.
- Hungarian names are respelled for the English voice (e.g. "Zhofia Keresstesh"). Check a few, and fix
  any in the `SAY` list in `build_data.py`.
- Nam June Paik had no wall text in our handout; the app gives two general sentences instead.
- Path A's printed map marks an extra Société Réaliste stop that isn't in the texts; it links to their two works.

## Credits

Texts: Ludwig Museum (curators Borbála Kálmán, József Készman). Voices: Kokoro-82M (Apache-2.0).
Vision: DINOv2-small (Meta, Apache-2.0) via transformers.js. Stickers: Designsoup Urban Grunge decals,
Ash N Ink "Cursed" set, erikari lovely stickers, plus the capybara, cyber-beast, manga, Aria, bubloo and planet packs.
Used for a school project and not redistributed as packs.
