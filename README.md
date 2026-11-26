# SHOOT DICE — Street Dice Club

Вертикальная Telegram Mini App: уличные кости (крэпс) в стилистике графической новеллы.
**Milestone v0.1 — офлайн-тренировка против бота.** Только очки: без денег, ставок, покупок и онлайна.

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
| `src/platform/telegram.ts` | Мост Telegram: ready/expand, цвета, safe area, BackButton, haptics; браузерный fallback |
| `src/assets/manifest.ts` | Карта ассетов. Заменить URL здесь, когда придёт продакшн-арт |
| `scripts/gen-placeholders.mjs` | Генератор оригинальных SVG-заглушек |
| `scripts/qa/` | Playwright-смоук: полный матч на 360×640 и 390×844, стаб Telegram |
| `docs/` | QA, отчёт, бэклог, changelog, скриншоты |

Правила: 7/11 на первом броске — шутер выиграл, 2/3/12 — проиграл, иначе пойнт; дальше пойнт — выиграл, 7 — проиграл. Победителю раунда +100, шутер меняется каждый раунд, матч — 3 раунда.

## Деплой (как Dog Fight)

Статика из `dist/` на Cloudflare Workers (`wrangler.toml`, без Worker-скрипта и секретов).

Одноразовая настройка в Cloudflare Dashboard → Workers & Pages → Create → Import a repository:
- репозиторий `estepanov-blip/shootdice`, production-ветка `main`;
- Build command: `npm run build`; Deploy command: `npx wrangler deploy`;
- ветки ≠ main получают превью-URL.

После этого каждый push в `main` = production (`https://shootdice.<account>.workers.dev`).
Ручной деплой: `npx wrangler login && npm run deploy`.

Telegram: в @BotFather → `/newapp` (или Bot Settings → Menu Button) указать HTTPS-URL игры. Токен бота клиенту не нужен и в репозитории не хранится.

## Ограничения milestone

Нет онлайна, сервера, платежей, ставок, валюты, аудио. Арт — временные оригинальные заглушки; мокапы из `docs/brief/references` использованы только как направление.
