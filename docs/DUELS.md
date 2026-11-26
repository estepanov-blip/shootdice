# Дуэли с друзьями (PvP) — как работает и как включить

Схема та же, что в Dog Fight (v0.2 + таймауты v0.3), без валюты.

## Для игрока
1. Меню → **«Вызвать друга»** → Telegram открывает выбор чата → уходит карточка «Саня вызывает тебя в SHOOT DICE!» с кнопкой **«Принять вызов»**.
2. Друг жмёт кнопку → игра открывается сразу на вызове → **«Принять вызов»** → жребий решает, кто бросает первым.
3. Шутер бросает, пока раунд не решится (натурал / крэпс / пойнт / семёрка); потом кости переходят сопернику. 3 раунда, +100 за раунд.
4. Не в игре? Бот пишет «Теперь бросаешь ты» с кнопкой «Бросить кости». Напоминания через **1 ч** и **12 ч**; через **24 ч** без броска — техническое поражение.
5. Итог → **«Реванш»** у обоих ведёт в одну новую игру (первым бросает проигравший). Сдаться — «?» → «Сдаться».
6. **«Мои дуэли»**: список игр («твой бросок!» сверху) и **«Чемпион чата»** (неделя / всё время) для игр, принятых в группе.

Сообщения бота — только по согласию (`requestWriteAccess` спрашивается при вызове/принятии). Без Telegram или без сервера (превью веток без токена) кнопок дуэлей нет — тренировка работает.

## Архитектура
```
Cloudflare Worker "shootdice" (wrangler.toml)
├─ статика dist/                         GET /, /assets/*, /share.jpg
├─ API server/worker.ts                  /api/*  (Authorization: tma <initData>)
├─ webhook бота                          POST /tg/webhook (/start → кнопка «Играть»)
└─ Durable Object GameStore (SQLite, бесплатный тариф)
     duel:<id>   — игра; все броски выполняются здесь последовательно (атомарно)
     user:<id>   — список моих игр
     chat:<inst> — «Чемпион чата»
```
- **Сервер авторитетный:** кубики бросает Worker (`crypto.getRandomValues`, без modulo bias), клиент присылает только «хочу бросить» + `expected = rollId`. Повтор/двойной тап → `stale`, второго броска нет.
- **Один движок:** сервер и клиент используют один `src/game/rules.ts`; клиент восстанавливает игру из журнала бросков (`src/online/replay.ts`) и проигрывает новые броски той же анимацией.
- **Проверка личности:** подпись `initData` (HMAC-SHA256 с токеном бота), срок 48 ч; `initDataUnsafe` не доверяем.
- Будильник Durable Object: напоминания, таймаут, запись в «Чемпион чата», очередь сообщений бота (at-most-once).
- Клиент опрашивает игру раз в 2,5 с, пока ход соперника (10 с в свой ход, пауза в фоне).

## Включить в production (один раз, ~5 минут)
> ⚠️ **Бот должен быть отдельным.** Шаг 3 перенастраивает webhook и кнопку меню бота. Если указать токен бота Dog Fight (@dogfightclub_bot) — Dog Fight перестанет получать /start и его кнопка меню откроет SHOOT DICE. Нужен бот, который больше ни к чему не подключён.

1. **Токен.** @BotFather → `/mybots` → ваш бот → **API Token**. Никому не пересылайте.
2. **Секрет.** Cloudflare → Workers & Pages → **shootdice** → Settings → Variables and Secrets → **Add** → Type **Secret**, Name **`BOT_TOKEN`**, Value — токен → **Deploy**.
3. **Настроить бота.** Открыть в браузере `https://shootdice.e-stepanov.workers.dev/api/setup` → ответ `"ok": true` (webhook, кнопка «Играть», команда /start).
4. **Mini App.** @BotFather → `/mybots` → бот → Bot Settings → **Configure Mini App** → `https://shootdice.e-stepanov.workers.dev` (нужно для ссылок `t.me/<бот>?startapp=…` из карточки вызова).
5. Перезапустить Telegram → бот → **Играть** → **Вызвать друга**.

Откат: флаг `DUEL_JOBS=pause` (Settings → Variables, Text) останавливает напоминания и таймауты; код — revert `main` на `3b43f33` (v0.1, без сервера).

## Локальная разработка и тесты
```bash
npm install
printf 'BOT_TOKEN=123456:TEST-token\nTG_API_BASE=http://127.0.0.1:8788\nDEV_MODE=1\n' > .dev.vars
node scripts/qa/mock-telegram.mjs 8788 /tmp/tg-mock.jsonl &      # поддельный Bot API
npm run build && npx wrangler dev --port 8787 &
python3 -I scripts/qa/duel_api_e2e.py http://127.0.0.1:8787 /tmp/tg-mock.jsonl
python3 -I scripts/qa/duel_ui_e2e.py  http://127.0.0.1:8787 /tmp/tg-mock.jsonl /tmp/duel-shots
```
`DEV_MODE=1` включает `POST /api/dev/duels/:id/shift` (сдвиг времени) — **никогда не задавать в production.**

## API
| Метод | Что делает |
|---|---|
| `GET /api/health` | `{configured}` — есть ли BOT_TOKEN |
| `GET /api/setup` | webhook, кнопка меню, /start |
| `GET /api/me` | я, мои игры, `boards {week, all}` в группе |
| `POST /api/duels` | новый вызов + prepared message для `shareMessage` |
| `GET /api/duels/:id` | состояние (и отметка «в игре») |
| `POST /api/duels/:id/accept` | принять (жребий первого шутера) |
| `POST /api/duels/:id/roll` `{expected}` | бросок; кубики генерирует сервер |
| `POST /api/duels/:id/forfeit` | сдаться |
| `POST /api/duels/:id/rematch` | реванш (общий для обоих) |
| `POST /api/duels/:id/share` | новая карточка вызова |

## Ограничения
- Тексты бота только на русском; интерфейс RU/EN.
- `*.workers.dev` из части российских сетей может открываться нестабильно — лечится своим доменом на Cloudflare.
- Открытый вызов, который никто не принял, висит в «Моих дуэлях» (отмены нет).
- Бесплатный тариф Workers/DO ~100 тыс. запросов в сутки; открытая игра в ожидании ≈ 1 запрос / 2,5 с.
