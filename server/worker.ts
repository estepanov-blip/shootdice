/**
 * SHOOT DICE duel server — Cloudflare Worker. Same origin as the built game (dist/).
 *
 *   GET  /api/health              — is the server configured
 *   GET  /api/setup               — one-time: webhook, menu button, commands
 *   POST /tg/webhook              — Telegram updates (/start)
 *   GET  /api/me                  — profile, my games, chat boards
 *   POST /api/duels               — create an open challenge (+ prepared share message)
 *   GET  /api/duels/:id           — game state
 *   POST /api/duels/:id/accept|roll|forfeit|rematch|share
 *   POST /api/dev/duels/:id/shift — local tests only (DEV_MODE=1)
 *
 * All /api/* calls except health/setup require `Authorization: tma <initData>`.
 * Dice are generated HERE (Web Crypto, rejection sampling); the client never sends dice.
 */
import { cryptoRng, rollDice } from '../src/game/rng'
import type { CreateDuelResponse, MeResponse, PlayerInfo, RollResponse, Seat } from '../src/online/protocol'
import { createDuel, newDuelId, toSummary, toView, type DuelRecord } from './duel'
import type { Env } from './env'
import { GameStore, type DuelOp, type StoreApi } from './store'
import { BotApi, escapeHtml, validateInitData, webhookSecret, type InitDataInfo } from './telegram'

export { GameStore }
export type { Env }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
const fail = (status: number, error: string, message: string) => json({ error, message }, status)

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const rng = cryptoRng(crypto)

const tg = (env: Env) => new BotApi(env.BOT_TOKEN, env.TG_API_BASE || undefined)

let botUsernameCache: string | null = null
async function botUsername(env: Env): Promise<string> {
  if (botUsernameCache) return botUsernameCache
  try {
    const me = await tg(env).call<{ username: string }>('getMe')
    botUsernameCache = me.username
    return me.username
  } catch {
    return 'bot' // Telegram unreachable: links degrade, the game keeps working
  }
}

const store = (env: Env, name: string) => env.STORE.getByName(name) as unknown as StoreApi

const duelLink = (bot: string, id: string) => `https://t.me/${bot}?startapp=d_${id}`

async function authenticate(req: Request, env: Env): Promise<InitDataInfo | null> {
  const h = req.headers.get('authorization') ?? ''
  const initData = h.startsWith('tma ') ? h.slice(4) : ''
  return validateInitData(initData, env.BOT_TOKEN, Math.floor(Date.now() / 1000))
}

async function saveSummaries(env: Env, d: DuelRecord) {
  await Promise.all(
    d.players.flatMap((p) => {
      if (!p) return []
      const s = toSummary(d, p.id)
      return s ? [store(env, `user:${p.id}`).upsertSummary(s)] : []
    }),
  )
}

async function prepareShare(env: Env, user: PlayerInfo, d: DuelRecord, origin: string): Promise<string | null> {
  try {
    const bot = await botUsername(env)
    const res = await tg(env).call<{ id: string }>('savePreparedInlineMessage', {
      user_id: user.id,
      allow_user_chats: true,
      allow_group_chats: true,
      allow_bot_chats: false,
      allow_channel_chats: false,
      result: {
        type: 'photo',
        id: d.id,
        photo_url: `${origin}/share.jpg`,
        thumbnail_url: `${origin}/share.jpg`,
        caption: `🎲 <b>${escapeHtml(user.name)}</b> вызывает тебя в SHOOT DICE!\nТри раунда уличных костей. Только очки — без денег и ставок.`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '🎲 Принять вызов', url: duelLink(bot, d.id) }]] },
      },
    })
    return res.id
  } catch {
    return null
  }
}

async function handleApi(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const origin = url.origin
  const path = url.pathname.replace(/\/+$/, '')

  if (path === '/api/health') return json({ ok: true, configured: !!env.BOT_TOKEN })

  if (path === '/api/setup') {
    if (!env.BOT_TOKEN) return fail(500, 'no_token', 'Секрет BOT_TOKEN не задан в настройках Worker')
    const bot = tg(env)
    const me = await bot.call<{ username: string }>('getMe')
    await bot.call('setWebhook', {
      url: `${origin}/tg/webhook`,
      secret_token: await webhookSecret(env.BOT_TOKEN),
      allowed_updates: ['message'],
      drop_pending_updates: true,
    })
    await bot.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: origin } } })
    await bot.call('setMyCommands', { commands: [{ command: 'start', description: 'Открыть SHOOT DICE' }] })
    return json({
      ok: true,
      bot: `@${me.username}`,
      app: origin,
      next: `В @BotFather: /mybots → @${me.username} → Bot Settings → Configure Mini App → укажи ${origin}`,
    })
  }

  if (!env.BOT_TOKEN) return fail(503, 'no_token', 'Сервер дуэлей не настроен')
  const auth = await authenticate(req, env)
  if (!auth) return fail(401, 'unauthorized', 'Открой игру из Telegram')
  const user = auth.user
  const now = Date.now()
  const groupChat = auth.chatType === 'group' || auth.chatType === 'supergroup' ? auth.chatInstance : null

  if (path === '/api/me' && req.method === 'GET') {
    const [duels, boards, bot] = await Promise.all([
      store(env, `user:${user.id}`).listSummaries(),
      groupChat ? store(env, `chat:${groupChat}`).boards(now) : Promise.resolve(null),
      botUsername(env),
    ])
    return json({ user, bot, duels, boards } satisfies MeResponse)
  }

  const dev = path.match(/^\/api\/dev\/duels\/([A-Za-z0-9]{6,32})\/shift$/)
  if (dev) {
    if (env.DEV_MODE !== '1') return fail(404, 'not_found', 'Нет такого метода')
    const body = (await req.json().catch(() => ({}))) as { ms?: number }
    const r = await store(env, `duel:${dev[1]}`).mutate({ type: 'devShift', ms: Number(body.ms) || 0, now, origin })
    return r.ok ? json({ ok: true, turnDueAt: r.duel.turnDueAt }) : fail(r.status, r.code, r.message)
  }

  if (path === '/api/duels' && req.method === 'POST') {
    const d = createDuel(newDuelId(random), user, now, origin)
    await store(env, `duel:${d.id}`).putDuel(d)
    await saveSummaries(env, d)
    const [prepared, bot] = await Promise.all([prepareShare(env, user, d, origin), botUsername(env)])
    return json({ duel: toView(d, user.id, duelLink(bot, d.id)), prepared } satisfies CreateDuelResponse, 201)
  }

  const m = path.match(/^\/api\/duels\/([A-Za-z0-9]{6,32})(?:\/(accept|roll|forfeit|rematch|share))?$/)
  if (!m) return fail(404, 'not_found', 'Нет такого метода')
  const [, id, action] = m
  const stub = store(env, `duel:${id}`)
  const bot = await botUsername(env)

  if (!action && req.method === 'GET') {
    const r = await stub.mutate({ type: 'touch', userId: user.id, now, origin })
    if (!r.ok) return fail(r.status, r.code, r.message)
    let d = r.duel
    if (r.changed) ctx.waitUntil(saveSummaries(env, d))
    if (d.result?.settlement.state === 'pending') d = (await stub.settleNow()) ?? d
    return json(toView(d, user.id, duelLink(bot, id)))
  }
  if (req.method !== 'POST') return fail(405, 'method', 'POST only')

  if (action === 'share') {
    const d = await stub.getDuel()
    if (!d) return fail(404, 'not_found', 'Игра не найдена')
    return json({ prepared: await prepareShare(env, user, d, origin) })
  }

  const body = (await req.json().catch(() => ({}))) as { expected?: number }
  let op: DuelOp
  if (action === 'accept') op = { type: 'accept', user, now, chatInstance: groupChat, coin: rng.int(0, 1) as Seat, origin }
  else if (action === 'roll') op = { type: 'roll', userId: user.id, expected: Number(body.expected), dice: rollDice(rng), now, origin }
  else if (action === 'forfeit') op = { type: 'forfeit', userId: user.id, now, origin }
  else op = { type: 'rematch', userId: user.id, newId: newDuelId(random), now, origin }

  const r = await stub.mutate(op)
  if (!r.ok) return fail(r.status, r.code, r.message)
  if (r.next) await store(env, `duel:${r.next.id}`).putDuel(r.next)
  if (r.changed) {
    ctx.waitUntil(saveSummaries(env, r.duel))
    if (r.next) ctx.waitUntil(saveSummaries(env, r.next))
  }
  if (op.type === 'rematch') return json({ id: r.duel.rematchId })
  let d = r.duel
  if (d.result?.settlement.state === 'pending') d = (await stub.settleNow()) ?? d
  const view = toView(d, user.id, duelLink(bot, id))
  if (op.type === 'roll') return json({ duel: view, stale: r.stale } satisfies RollResponse)
  return json(view)
}

async function handleWebhook(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret(env.BOT_TOKEN))) {
    return new Response('forbidden', { status: 403 })
  }
  const update = (await req.json().catch(() => null)) as { message?: { chat: { id: number }; text?: string } } | null
  const msg = update?.message
  if (msg?.text?.startsWith('/start')) {
    await tg(env)
      .call('sendMessage', {
        chat_id: msg.chat.id,
        parse_mode: 'HTML',
        text:
          '🎲 <b>SHOOT DICE — Street Dice Club</b>\n\nТри раунда уличных костей. Тренируйся против Big Roc или вызови друга — бот напишет, когда твой бросок.\nТолько очки: без денег и ставок.',
        reply_markup: { inline_keyboard: [[{ text: '🎲 Играть', web_app: { url: url.origin } }]] },
      })
      .catch(() => {})
  }
  return new Response('ok')
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, env, ctx, url)
      if (url.pathname === '/tg/webhook' && req.method === 'POST') return await handleWebhook(req, env, url)
    } catch (e) {
      return fail(500, 'server', e instanceof Error ? e.message : 'Ошибка сервера')
    }
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
