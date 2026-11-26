# SHOOT DICE — Street Dice Club

Вертикальная Telegram Mini App: уличные кости (крэпс) в стилистике графической новеллы.
**v0.2 — тренировка против бота + дуэли с друзьями в Telegram (PvP).** Только очки: без денег, ставок и покупок.

Дуэли: «Вызвать друга» → карточка в чат → друг принимает → бросаете по очереди, бот пишет «твой бросок», 24 ч на бросок, реванш, «Мои дуэли», «Чемпион чата». Подробно и как включить: [`docs/DUELS.md`](docs/DUELS.md).

Исходное ТЗ (Production Pack v0.1): [`docs/brief/`](docs/brief/) — GDD, ART, TECH, CLAUDE_TASK, референсы.

## Быстрый старт

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # Vitest: правила, RNG, контроллер
npm run build      # tsc + vite build -> dist/
npm run preview    # раздать dist/ локально (http://localhost:4173)
```

Требуется Node.js LTS (≥ 20).

## Что внутри

| Путь | Что делает |
|---|---|
| `src/game/rules.ts` | Чистая машина состояний: come-out / point / roundEnd / matchEnd, валидация хода, защита от дубля по `rollId` |
| `src/game/rng.ts` | Внедряемый RNG: Web Crypto с rejection sampling (практика), seeded/scripted (тесты) |
| `src/game/PracticeController.ts` | Единственный владелец состояния матча: бот через 800 мс, блокировка ввода на время анимации, пауза без переброса, отмена таймеров |
| `src/game/PracticeScene.ts` | Phaser 3: фон, персонажи, площадка, анимация броска. Только показывает заранее выпавший результат |
| `src/ui/` | React: меню, HUD, баннеры, правила, итоги; RU/EN |
| `server/` | Cloudflare Worker + Durable Object: API дуэлей, кубики на сервере, бот, таймауты, «Чемпион чата» |
| `src/online/` | Протокол, повтор игры из журнала бросков, клиент API, контроллер дуэли |
| `src/platform/telegram.ts` | Мост Telegram: ready/expand, цвета, safe area, BackButton, haptics; браузерный fallback |
| `src/assets/manifest.ts` | Карта ассетов арт-пакета v1.0 (`src/assets/art/`). Отчёт и недостающие ассеты — `docs/ART_INTEGRATION.md` |
| `scripts/gen-placeholders.mjs` | Генератор оригинальных SVG-заглушек |
| `scripts/qa/` | Playwright-смоук тренировки, API- и UI-e2e дуэлей (wrangler dev + mock Bot API) |
| `docs/` | QA, отчёт, бэклог, changelog, скриншоты |

Правила: 7/11 на первом броске — шутер выиграл, 2/3/12 — проиграл, иначе пойнт; дальше пойнт — выиграл, 7 — проиграл. Победителю раунда +100, шутер меняется каждый раунд, матч — 3 раунда.

## Деплой (как Dog Fight)

Cloudflare Worker `shootdice` (`wrangler.toml`): статика `dist/` + сервер дуэлей (`server/worker.ts`, Durable Object `GameStore`). Секрет `BOT_TOKEN` — см. [`docs/DUELS.md`](docs/DUELS.md).

Одноразовая настройка в Cloudflare Dashboard → Workers & Pages → Create → Import a repository:
- репозиторий `estepanov-blip/shootdice`, production-ветка `main`;
- Build command: `npm run build`; Deploy command: `npx wrangler deploy`;
- ветки ≠ main получают превью-URL.

После этого каждый push в `main` = production: **https://shootdice.e-stepanov.workers.dev**.
Ручной деплой: `npx wrangler login && npm run deploy`.

Telegram: @BotFather → Bot Settings → Configure Mini App → URL игры; для дуэлей ещё `BOT_TOKEN` и `/api/setup` (docs/DUELS.md). Токен только в секретах Cloudflare, не в репозитории и не на клиенте.

## Ограничения

Нет платежей, ставок, валюты, аудио. Арт — временные оригинальные заглушки; мокапы из `docs/brief/references` использованы только как направление.
