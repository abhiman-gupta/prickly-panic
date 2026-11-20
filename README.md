# Wren in Arizona

A pixel-art desert flying game starring the cactus wren, Arizona's state bird. Fly over saguaros, cholla,
agave, ocotillo, yucca and windmills from Tucson to Bisbee to Tombstone through spring, monsoon, fall and winter.

Made by Abhiman Gupta. An independent, non-commercial game.

## Play

It's a single static page with no build step. Open `index.html` through any local web server, for example:

```bash
python3 -m http.server 8137
```

Then visit http://localhost:8137. Planned home: `wreninaz.abhimangupta.com`.

## Controls

- Tap, click, Space, ↑ or W to flap
- P or Esc to pause, M to mute

## Notes

- All scenery, sprites and sound effects are drawn and synthesized in code inside `index.html`.
- `assets/` holds the original high-resolution wren art (generated with ChatGPT) that the in-game sprite is based on.
- Scores and your player name are stored only in your own browser.
- Font: Silkscreen by Jason Kottke (SIL Open Font License), loaded from Google Fonts.
- Add `?debug` to the URL to expose test hooks on `window.__waa`.
