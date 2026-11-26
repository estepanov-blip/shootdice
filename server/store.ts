/**
 * One Durable Object class, many instances addressed by name:
 *   duel:<id>   — one game; every mutation runs here, serialized (atomic rolls).
 *                 Its alarm drives reminders, timeouts, settlement and the bot outbox.
 *   user:<tgId> — list of my games
 *   chat:<inst> — "Чемпион чата" results of a group
 */
import { DurableObject } from 'cloudflare:workers'
import type { DicePair } from '../src/game/rng'
import type { DuelSummary, LeaderRow, PlayerInfo, Seat } from '../src/online/protocol'
import { utcWeekStart } from '../src/online/protocol'
import { addChatEntry, board, type ChatEntry, type ChatState } from './chat'
import {
  acceptDuel,
  deadlineOf,
  dueReminders,
  DuelError,
  forfeitDuel,
  markReminders,
  nextReminderAt,
  rematchDuel,
  rollDuel,
  timeoutDuel,
  toSummary,
  touch,
  type DuelRecord,
} from './duel'
import type { Env } from './env'
import { compose, plan, reminderItems, type OutboxItem } from './notifications'
import { BotApi } from './telegram'

export type DuelOp =
  | { type: 'accept'; user: PlayerInfo; now: number; chatInstance: string | null; coin: Seat; origin: string }
  | { type: 'roll'; userId: number; expected: number; dice: DicePair; now: number; origin: string }
  | { type: 'forfeit'; userId: number; now: number; origin: string }
  | { type: 'rematch'; userId: number; newId: string; now: number; origin: string }
  | { type: 'touch'; userId: number; now: number; origin: string }
  | { type: 'devShift'; ms: number; now: number; origin: string }

export type DuelOpResult =
  | { ok: true; duel: DuelRecord; stale: boolean; next: DuelRecord | null; changed: boolean }
  | { ok: false; code: string; message: string; status: number }

const MAX_LIST = 30
const RETRY_BASE_MS = 2000
const RETRY_MAX_MS = 5 * 60_000

/** Typed view of the RPC stub. */
export interface StoreApi {
  getDuel(): Promise<DuelRecord | null>
  putDuel(d: DuelRecord): Promise<void>
  mutate(op: DuelOp): Promise<DuelOpResult>
  settleNow(): Promise<DuelRecord | null>
  upsertSummary(s: DuelSummary): Promise<void>
  listSummaries(): Promise<DuelSummary[]>
  addChatEntry(e: ChatEntry): Promise<void>
  boards(now: number): Promise<{ week: LeaderRow[]; all: LeaderRow[]; weekStart: number }>
}

export class GameStore extends DurableObject<Env> {
  private stub(name: string): StoreApi {
    return this.env.STORE.getByName(name) as unknown as StoreApi
  }

  // =================================================================== duel
  async getDuel(): Promise<DuelRecord | null> {
    return (await this.ctx.storage.get<DuelRecord>('duel')) ?? null
  }

  async putDuel(d: DuelRecord): Promise<void> {
    await this.ctx.storage.put('duel', d)
    await this.reschedule(d)
  }

  private async outbox(): Promise<OutboxItem[]> {
    return (await this.ctx.storage.get<OutboxItem[]>('outbox')) ?? []
  }

  private async enqueue(items: OutboxItem[]) {
    if (!items.length) return
    const box = await this.outbox()
    const keys = new Set(box.map((i) => i.key))
    await this.ctx.storage.put('outbox', [...box, ...items.filter((i) => !keys.has(i.key))])
  }

  private jobsOn() {
    return this.env.DUEL_JOBS !== 'pause'
  }

  async mutate(op: DuelOp): Promise<DuelOpResult> {
    const d0 = await this.getDuel()
    if (!d0) return { ok: false, code: 'not_found', message: 'Игра не найдена', status: 404 }
    const d = d0.origin ? d0 : { ...d0, origin: op.origin }
    try {
      // A request that arrives after the deadline first applies the timeout (one transition).
      if (op.type !== 'accept' && op.type !== 'rematch' && op.type !== 'devShift' && this.jobsOn()) {
        const timedOut = timeoutDuel(d, op.now)
        if (timedOut !== d) {
          await this.enqueue(plan(d, timedOut, { type: 'timeout' }, null, op.now))
          await this.ctx.storage.put('duel', timedOut)
          await this.reschedule(timedOut, true)
          if (op.type !== 'touch') return { ok: false, code: 'turn_expired', message: 'Время хода истекло — техническое поражение', status: 409 }
          return { ok: true, duel: timedOut, stale: false, next: null, changed: true }
        }
      }
      let duel = d
      let stale = false
      let next: DuelRecord | null = null
      let changed = true
      switch (op.type) {
        case 'accept': {
          const r = acceptDuel(d, op.user, op.now, op.chatInstance, op.coin)
          duel = r.duel
          changed = r.changed
          break
        }
        case 'roll': {
          const r = rollDuel(d, op.userId, op.expected, op.dice, op.now)
          duel = r.duel
          stale = r.stale
          changed = !r.stale
          break
        }
        case 'forfeit':
          duel = forfeitDuel(d, op.userId, op.now)
          break
        case 'rematch': {
          const r = rematchDuel(d, op.userId, op.newId, op.now, op.origin)
          duel = r.prev
          next = r.next
          changed = !!r.next
          break
        }
        case 'touch':
          duel = touch(d, op.userId, op.now)
          changed = false
          break
        case 'devShift':
          duel = devShift(d, op.ms)
          break
      }
      if (changed) {
        const actor = op.type === 'roll' || op.type === 'forfeit' || op.type === 'rematch' ? op.userId : undefined
        await this.enqueue(plan(d, duel, { type: op.type, userId: actor }, next, op.now))
      }
      if (duel !== d0) {
        await this.ctx.storage.put('duel', duel)
        await this.reschedule(duel, changed)
      }
      return { ok: true, duel, stale, next, changed }
    } catch (e) {
      if (e instanceof DuelError) return { ok: false, code: e.code, message: e.message, status: e.status }
      throw e
    }
  }

  /** Next wake-up: reminder, deadline, settlement retry or pending outbox. */
  private async reschedule(d: DuelRecord, soon = false) {
    const now = Date.now()
    const times: number[] = []
    if (d.status === 'active' && this.jobsOn()) {
      const rem = nextReminderAt(d)
      if (rem !== null) times.push(rem)
      const dl = deadlineOf(d)
      if (dl !== null) times.push(dl)
    }
    if (d.result?.settlement.state === 'pending') {
      const a = d.result.settlement.attempts
      times.push(a === 0 ? now : now + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (a - 1)))
    }
    if (soon || (await this.outbox()).length) times.push(now)
    if (times.length) await this.ctx.storage.setAlarm(Math.max(now, Math.min(...times)))
    else await this.ctx.storage.deleteAlarm()
  }

  async alarm(): Promise<void> {
    let d = await this.getDuel()
    if (!d) return
    const now = Date.now()
    if (this.jobsOn() && d.status === 'active') {
      const t = timeoutDuel(d, now)
      if (t !== d) {
        await this.enqueue(plan(d, t, { type: 'timeout' }, null, now))
        d = t
        await this.ctx.storage.put('duel', d)
      } else {
        const due = dueReminders(d, now)
        if (due.length) {
          await this.enqueue(reminderItems(d, due))
          d = markReminders(d, due)
          await this.ctx.storage.put('duel', d)
        }
      }
    }
    if (d.result?.settlement.state === 'pending') d = await this.settle(d)
    await this.flushOutbox(d)
    await this.reschedule((await this.getDuel()) ?? d)
  }

  /** Lets a request finish the settlement inline (fresh lists on the result screen). */
  async settleNow(): Promise<DuelRecord | null> {
    const d = await this.getDuel()
    if (!d || d.result?.settlement.state !== 'pending') return d
    const s = await this.settle(d)
    await this.reschedule(s)
    return s
  }

  /** Every step is idempotent at its receiver and recorded after success, so retries converge. */
  private async settle(d0: DuelRecord): Promise<DuelRecord> {
    let d = d0
    const save = async (next: DuelRecord) => {
      d = next
      await this.ctx.storage.put('duel', d)
    }
    const step = (k: string) => !!d.result!.settlement.steps[k]
    const mark = (k: string) =>
      save({ ...d, result: { ...d.result!, settlement: { ...d.result!.settlement, steps: { ...d.result!.settlement.steps, [k]: true } } } })
    const [p0, p1] = d.players
    try {
      if (p1) {
        if (d.chatInstance && !step('chat')) {
          const r = d.result!
          await this.stub(`chat:${d.chatInstance}`).addChatEntry({
            duelId: d.id,
            at: r.finalizedAt,
            a: p0,
            b: p1,
            winner: r.winner === null ? 'draw' : r.winner === 0 ? 'a' : 'b',
          })
          await mark('chat')
        }
        if (!step('summaries')) {
          const cur = d
          await Promise.all([p0, p1].map((p) => this.stub(`user:${p.id}`).upsertSummary(toSummary(cur, p.id)!)))
          await mark('summaries')
        }
      }
      await save({ ...d, result: { ...d.result!, settlement: { ...d.result!.settlement, state: 'done', lastError: undefined } } })
    } catch (e) {
      const s = d.result!.settlement
      await save({ ...d, result: { ...d.result!, settlement: { ...s, attempts: s.attempts + 1, lastError: String(e).slice(0, 200) } } })
    }
    return d
  }

  /**
   * At-most-once delivery: an item is marked and removed before sending. If the
   * network fails after Telegram accepted a message we cannot know it, so it is never resent.
   */
  private async flushOutbox(d0: DuelRecord) {
    const box = await this.outbox()
    if (!box.length) return
    let d = d0
    const notified = { ...(d.notified ?? {}) }
    const fresh = box.filter((i) => !notified[i.key])
    for (const i of fresh) notified[i.key] = Date.now()
    d = { ...d, notified }
    await this.ctx.storage.put('outbox', [])
    await this.ctx.storage.put('duel', d)
    if (!this.env.BOT_TOKEN) return
    const bot = new BotApi(this.env.BOT_TOKEN, this.env.TG_API_BASE || undefined)
    const origin = d.origin ?? ''
    for (const item of fresh) {
      // stale reminder / turn message: the roll it was about is no longer the current one
      if (item.kind === 'reminder' || item.kind === 'turn') {
        const cur = d.status === 'active' && d.match ? d.players[d.match.shooter === 'player' ? 0 : 1] : null
        if (cur?.id !== item.to) continue
      }
      const target = item.kind === 'rematch' ? ((await this.stub(`duel:${item.duelId}`).getDuel()) ?? d) : d
      const { text, button } = compose(item, target)
      try {
        await bot.call('sendMessage', {
          chat_id: item.to,
          text,
          parse_mode: 'HTML',
          ...(origin ? { reply_markup: { inline_keyboard: [[{ text: `🎲 ${button}`, web_app: { url: `${origin}/?duel=${item.duelId}` } }]] } } : {}),
        })
      } catch {
        // no consent / bot blocked: opt-in by design, never retried
      }
    }
  }

  // =================================================================== user
  async upsertSummary(s: DuelSummary): Promise<void> {
    const list = (await this.ctx.storage.get<DuelSummary[]>('duels')) ?? []
    const rest = list.filter((x) => x.id !== s.id)
    rest.unshift(s)
    rest.sort((a, b) => b.updatedAt - a.updatedAt)
    await this.ctx.storage.put('duels', rest.slice(0, MAX_LIST))
  }

  async listSummaries(): Promise<DuelSummary[]> {
    return (await this.ctx.storage.get<DuelSummary[]>('duels')) ?? []
  }

  // =================================================================== chat
  async addChatEntry(e: ChatEntry): Promise<void> {
    const c0 = (await this.ctx.storage.get<ChatState>('entries')) ?? {}
    const c = addChatEntry(c0, e)
    if (c !== c0) await this.ctx.storage.put('entries', c)
  }

  async boards(now: number) {
    const c = (await this.ctx.storage.get<ChatState>('entries')) ?? {}
    return { week: board(c, 'week', now), all: board(c, 'all', now), weekStart: utcWeekStart(now) }
  }
}

/** Local tests only (DEV_MODE): pretend `ms` passed since the current roll became due. */
function devShift(d: DuelRecord, ms: number): DuelRecord {
  if (d.status !== 'active') return d
  const lastSeen = Object.fromEntries(Object.entries(d.lastSeen).map(([k, v]) => [k, v - ms]))
  return { ...d, turnDueAt: (d.turnDueAt ?? d.updatedAt) - ms, updatedAt: d.updatedAt - ms, lastSeen }
}
