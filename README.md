# Prickly Panic

A pixel-art desert flying game starring the cactus wren, Arizona's state bird. Fly over saguaros, cholla,
agave, ocotillo, yucca and windmills from Tucson to Bisbee to Tombstone through spring, monsoon, fall and winter.

Made by Abhiman Gupta. An independent, non-commercial game.

## Play

The game will be available at [pricklypanic.abhimangupta.com](https://pricklypanic.abhimangupta.com/).
To play locally, serve the game directory from any static web server. There is no build step.

```bash
python3 -m http.server 8137
```

Then visit [localhost:8137](http://localhost:8137/).

## Controls

- Tap, click, Space, ↑ or W to flap
- P or Esc to pause, M to mute

## Notes

- All scenery, sprites and sound effects are drawn and synthesized in code inside `index.html`.
- Scores and your player name are stored only in your own browser.
- Font: Silkscreen by Jason Kottke (SIL Open Font License), loaded from Google Fonts.
- Add `?debug` to the URL to expose test hooks on `window.__waa`.
- The game was first called Wren in Arizona, then Southwest Skies; browser storage keys keep the old `waa.` prefix so saved bests and names carry over.
