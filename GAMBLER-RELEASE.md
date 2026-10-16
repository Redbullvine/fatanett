# The Gambler integration

Playable route: `/games/the-gambler/`. The homepage featured card links to the game, not the animation preview.

The release includes the existing approved engine, shared 5,000x event cap, credit settlement, free spins, Showdown, optional sound, win effects, two themes, and the new mechanical control console. Only virtual credits are available; no deposits or cash redemption.

The engine, game-session, reel-motion, card-art, app and win-effects modules were copied byte-for-byte from the tested Gambler project. Existing Fatanett functions and pages were not changed. Homepage changes are one featured card plus scoped CSS. Game assets and styles are isolated beneath its route. `.netlify` remains ignored.

Validation on 2026-10-16:
- `node --test test/gambler/*.test.mjs test/solve.test.js`: 27 passing tests.
- `netlify build --offline`: success, including solve function bundling.
- Original Gambler suite: 26 passing tests, including independent cap/settlement reference checks.
- Local integrated browser checks: homepage PLAY NOW, ten cap-fixture free spins ending at 50,990 credits, Showdown selection/reveal/collection, sound toggle, both themes, reduced motion, existing service pages.
- Chrome viewports: 320, 390, 768, 1024, 1440 pixels; no horizontal overflow.
- WebKit with an iPhone viewport: loading, spinning and responsive layout passed. Physical iPhone/iPad/Android hardware and subjective sound quality were not tested.
- Console keyboard activation, meter synchronization, secondary controls and reduced motion passed. Win-effects checks passed for seven sequences, skip, duplicate suppression and overlap cleanup.

Pipeline: GitHub `Redbullvine/fatanett`, production branch `main`, existing Netlify project `fatanett`. Netlify preview and production results are reported separately after remote verification.
