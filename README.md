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

The game can be installed as an app (`manifest.webmanifest` + `sw.js`) and plays offline once loaded. After your first run,
the game-over card offers to install it: a real install prompt in Chrome, Edge and Android, and Share > Add to Home Screen
steps on iPhone and iPad. The card shows one offer at a time. Where the browser can send pings (Android, computers),
"Ping me" comes first, and the install offer takes its place at the next game over once pings are on, turned down or put off.
The page is fetched network-first, so updates show up right away; bump `CACHE` in `sw.js` when you change icons or other
cached files.

iPhone and iPad keep a Home Screen app's storage apart from Safari's, so in their browsers the nickname, best and player ID
also go in a cookie (`waa_carry`). iOS copies cookies into the app when it's added (iOS 17.2+), and the app takes them over on
its first launch. iOS skips this for `localhost`, so to try it in the iOS Simulator, open the game at
`http://pp.localtest.me:8137/` (a hostname that points back to your Mac). Pings need HTTPS, so try those on the live site.

## Controls

- Tap, click, Space, ↑ or W to flap
- P or Esc to pause, M to mute

## Notes

- All scenery, sprites and sound effects are drawn and synthesized in code inside `index.html`.
- Your best, settings and run history stay in your browser. The world leaderboard (the Cloudflare Worker in `api/`)
  keeps your nickname, a random player ID and each run's score, plus your push subscription if you turn on pings.
  In an iPhone or iPad browser, the nickname, best and player ID are also kept in a cookie so they carry over to the Home Screen app.
- "Ping me" uses web push. Android phones and computers can turn it on right in the browser. iPhone and iPad only allow it in
  the Home Screen app, so their browsers (and the browser inside apps like Instagram) only offer the app, and the app offers
  pings once it's opened.
- Font: Silkscreen by Jason Kottke (SIL Open Font License), loaded from Google Fonts.
- Add `?debug` to the URL to expose test hooks on `window.__waa`.
- The game was first called Wren in Arizona, then Southwest Skies; browser storage keys keep the old `waa.` prefix so saved bests and names carry over.
