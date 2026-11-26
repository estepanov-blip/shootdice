# Claude Code implementation brief
You are the senior TypeScript game developer. Read README.md, GDD.md, ART.md, TECH.md and references. Inspect existing repository before editing; if empty, scaffold Vite React TypeScript. Do not assume compatibility with other GAMEZ projects. Build only offline Practice vertical slice first. Do not implement payments, wagers, multiplayer or production backend in this milestone.
1. Implement pure rules engine and injectable RNG; write tests first.
2. Implement practice controller with alternating shooter, three rounds, bot timer and animation lock.
3. Build responsive React HUD and Phaser scene; create simple original placeholders for missing assets; keep art replaceable. Show dice, point, current turn, score, rules and replay. Use the visual references as direction only, remove all dollar and bet controls.
4. Add Telegram bridge with ready/expand where supported, safe area handling and browser fallback. No token or secrets.
5. Run npm install, npm run test, npm run build. Fix failures. Document npm run dev and deployment prerequisites. Provide screenshots or manual QA checklist if browser capture unavailable.
6. Report files changed, test results, remaining blockers and next steps. Do not claim deployment unless verified. Do not commit or push without explicit permission.
Acceptance: fresh install runs; full three-round match playable; bot and human turns work; point persists correctly; dice match result; double clicks cannot duplicate scores; replay resets; 360x640 and 390x844 layouts usable; no real-money UI; tests and build pass.
