# Technical specification
## Stack
Vite + React + TypeScript + Phaser 3; npm; Vitest. Node.js LTS. MVP backend Node + Socket.IO + PostgreSQL. Redis only when multi-instance scaling requires it. GitHub repository; static HTTPS frontend. Telegram SDK bridge with browser fallback.
## Structure
src/game/rules.ts (pure state machine), src/game/rng.ts, src/game/PracticeScene.ts, src/ui/, src/platform/telegram.ts, src/assets/, tests/. React owns navigation and HUD; Phaser owns rendering and animation; one controller owns match state. Destroy Phaser instance on unmount. Use seeded injectable RNG in tests and Web Crypto in practice. Animation only displays predetermined result.
## State
phase: comeOut|point|roundEnd|matchEnd; point: null or 4/5/6/8/9/10; shooter: player|bot; roundIndex; scores; lastDice; rollId. Validate transitions, lock input during animation, resolve each roll exactly once. Preserve in-memory state when tab hidden. Reset on explicit new match. Bot timers cancel on exit.
## Online later
Server validates Telegram initData signature and freshness; never trust initDataUnsafe. Server generates dice with crypto.randomInt(1,7), owns state and score, validates turn and membership. Events room:join, room:ready, roll:request (requestId), match:state (revision), match:result. Reject duplicates, stale revisions, unauthorized actions. Rejoin with authenticated session and latest snapshot. Rate limit. Never expose bot token to client. Persist completed matches transactionally; no real-money or transferable balances.
## Tests
All 36 dice pairs, all come-out totals, each point win/7 loss/neutral, invalid phase, duplicate click, shooter rotation, three-round completion, draw handling (if rules later permit), replay reset, bot cancellation, resize and browser fallback. Verify Android/iOS Telegram webviews manually before launch.
## Performance targets
Initial compressed payload <=5 MB, interactive <=3s on representative mid-range device/network (measure), stable 30 FPS minimum. Lazy load audio and secondary art. No external asset hotlinks. Respect reduced motion and mute.
