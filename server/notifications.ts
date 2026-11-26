/**
 * Bot messages: neutral wording, readable without a username.
 * Pure: decides WHAT to send; the Durable Object sends from its outbox.
 */
import type { PlayerInfo, Seat } from '../src/online/protocol'
import { seatSide, otherSeat, TIMING } from '../src/online/protocol'
import { isOnline, shooterSeat, type DuelRecord } from './duel'
import { escapeHtml } from './telegram'

export type OutboxKind = 'accept' | 'turn' | 'reminder' | 'final' | 'rematch'

export interface OutboxItem {
  key: string // dedupe key
  kind: OutboxKind
  to: number // telegram user id
  duelId: string // game to open
  offset?: number // reminder offset (ms)
  by?: number // who triggered it
}

const name = (p: PlayerInfo | null | undefined) => `<b>${escapeHtml(p?.name?.trim() || 'Соперник')}</b>`

/** Notifications caused by a state change before -> after. */
export function plan(before: DuelRecord, after: DuelRecord, op: { type: string; userId?: number }, next: DuelRecord | null, now: number): OutboxItem[] {
  const out: OutboxItem[] = []
  const [p0, p1] = after.players
  if (!p1) return out
  if (op.type === 'accept' && before.status === 'open' && after.status === 'active') {
    out.push({ key: `accept:${p0.id}`, kind: 'accept', to: p0.id, duelId: after.id })
  }
  if (op.type === 'rematch' && next && op.userId !== undefined) {
    const opp = p0.id === op.userId ? p1 : p0
    out.push({ key: `rematch:${next.id}:${opp.id}`, kind: 'rematch', to: opp.id, duelId: next.id, by: op.userId })
  }
  if (after.status === 'over' && before.status !== 'over') {
    for (const p of [p0, p1]) {
      // the actor of the final move is looking at the screen; the other side is told
      if (op.userId === p.id || isOnline(after, p.id, now)) continue
      out.push({ key: `final:${p.id}`, kind: 'final', to: p.id, duelId: after.id })
    }
    return out
  }
  // the dice passed to the other player (a round was resolved)
  const sBefore = shooterSeat(before)
  const sAfter = shooterSeat(after)
  if (after.status === 'active' && after.log.length > before.log.length && sAfter !== null && sAfter !== sBefore) {
    const nextP = after.players[sAfter]!
    if (!isOnline(after, nextP.id, now)) {
      out.push({ key: `turn:${after.match!.rollId}:${nextP.id}`, kind: 'turn', to: nextP.id, duelId: after.id, by: after.players[otherSeat(sAfter)]!.id })
    }
  }
  return out
}

export function reminderItems(d: DuelRecord, offsets: number[]): OutboxItem[] {
  const s = shooterSeat(d)
  if (s === null || !offsets.length || !d.match) return []
  const p = d.players[s]
  if (!p) return []
  const offset = Math.max(...offsets) // several due at once (late alarm) -> one message
  return [{ key: `remind:${d.match.rollId}:${offset}:${p.id}`, kind: 'reminder', to: p.id, duelId: d.id, offset }]
}

const hoursLeft = (offset: number) => Math.max(1, Math.round((TIMING.turnTimeoutMs - offset) / 3600_000))

function scoreLine(d: DuelRecord, me: Seat) {
  const m = d.match
  if (!m) return ''
  return `Счёт: ты ${m.scores[seatSide(me)]} — соперник ${m.scores[seatSide(otherSeat(me))]}`
}

/** Text + button, composed at send time from the CURRENT record. */
export function compose(item: OutboxItem, d: DuelRecord): { text: string; button: string } {
  const me: Seat = d.players[0].id === item.to ? 0 : 1
  const opp = d.players[otherSeat(me)]
  switch (item.kind) {
    case 'accept': {
      const first = d.firstSeat === 0 ? 'Первый бросок за тобой.' : `Первым бросает ${name(d.players[1])}.`
      return { text: `🎲 Вызов принят! Против тебя ${name(d.players[1])}. ${first}`, button: 'Открыть игру' }
    }
    case 'turn': {
      const r = d.match?.rounds[d.match.rounds.length - 1]
      const how = r ? (r.winner === seatSide(me) ? 'Раунд твой.' : 'Раунд за соперником.') : ''
      return { text: `🎲 Раунд с ${name(opp)} сыгран. ${how} Теперь бросаешь ты.\n${scoreLine(d, me)}`, button: 'Бросить кости' }
    }
    case 'reminder':
      return {
        text: `⏰ Твой бросок в игре против ${name(opp)}. Через ${hoursLeft(item.offset ?? 0)} ч — техническое поражение.`,
        button: 'Бросить кости',
      }
    case 'rematch':
      return { text: `🔁 ${name(opp)} зовёт на реванш!`, button: 'Реванш?' }
    case 'final': {
      const r = d.result
      if (!r || r.winner === null) return { text: `🤝 Ничья в игре против ${name(opp)}.`, button: 'Реванш?' }
      const won = r.winner === me
      let text: string
      if (r.reason === 'turn_timeout') text = won ? '🏆 Победа: у соперника вышло время хода.' : '⌛ Техническое поражение: время хода вышло.'
      else if (r.reason === 'surrender') text = won ? '🏳 Соперник сдаётся. Победа!' : '🏳 Игра сдана.'
      else text = won ? `🏆 Победа над ${name(opp)}!` : `🎲 Победа за ${name(opp)}.`
      return { text: `${text}\n${scoreLine(d, me)}`, button: won ? 'Смотреть игру' : 'Реванш?' }
    }
  }
}
