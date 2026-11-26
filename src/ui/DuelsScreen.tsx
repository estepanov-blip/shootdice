import { useCallback, useEffect, useState } from 'react'
import type { Api } from '../online/api'
import type { DuelSummary, LeaderRow, MeResponse } from '../online/protocol'
import type { Platform } from '../platform/telegram'
import type { Strings } from './strings'

interface Props {
  api: Api
  t: Strings
  platform: Platform
  challenging: boolean
  onChallenge(): void
  onOpen(id: string): void
  onBack(): void
}

export function DuelsScreen({ api, t, platform, challenging, onChallenge, onOpen, onBack }: Props) {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'week' | 'all'>('week')

  const load = useCallback(async () => {
    try {
      setMe(await api.me())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => !document.hidden && void load(), 10_000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    platform.setBackHandler(onBack)
    return () => platform.setBackHandler(null)
  }, [platform, onBack])

  const duels = [...(me?.duels ?? [])].sort((a, b) => Number(b.yourTurn) - Number(a.yourTurn) || b.updatedAt - a.updatedAt)
  const rows: LeaderRow[] = me?.boards ? me.boards[tab] : []

  return (
    <div className="screen list-screen">
      <header className="list-head">
        <button className="icon-btn" onClick={onBack} aria-label={t.back}>
          ←
        </button>
        <h1>{t.myDuels}</h1>
      </header>
      <div className="list-body">
        <button className="btn primary big" onClick={onChallenge} disabled={challenging} data-testid="challenge">
          🎲 {challenging ? t.sending : t.challenge}
          <small>{t.challengeSub}</small>
        </button>
        {error && <p className="panel-error">{error}</p>}
        {!me && !error && <p className="panel-sub">{t.loading}</p>}
        {me && duels.length === 0 && <p className="panel-sub">{t.noDuels}</p>}
        <ul className="duel-list">
          {duels.map((d) => (
            <li key={d.id}>
              <button className={`duel-row ${d.yourTurn ? 'hot' : ''}`} onClick={() => onOpen(d.id)} data-testid="duel-row">
                <span className="dr-name">{d.opponent?.name ?? '—'}</span>
                <span className="dr-state">{rowState(d, t)}</span>
                <span className="dr-score">
                  {d.status === 'open' ? '' : `${d.score[0]}:${d.score[1]}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {me?.boards && (
          <section className="board" data-testid="board">
            <div className="board-head">
              <h2>🏆 {t.champion}</h2>
              <div className="tabs">
                <button className={tab === 'week' ? 'on' : ''} onClick={() => setTab('week')}>
                  {t.week}
                </button>
                <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
                  {t.allTime}
                </button>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="panel-sub">{t.boardEmpty}</p>
            ) : (
              <ol className="board-list">
                {rows.map((r, i) => (
                  <li key={r.id} className={r.id === me.user.id ? 'me' : ''}>
                    <span className="b-pos">{i + 1}</span>
                    <span className="b-name">{r.name}</span>
                    <span className="b-wl">
                      {r.wins}–{r.losses}
                    </span>
                    <span className="b-wr">{r.winRate === null ? '—' : `${Math.round(r.winRate * 100)}%`}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function rowState(d: DuelSummary, t: Strings) {
  if (d.status === 'open') return t.stOpen
  if (d.status === 'over') return d.result === 'win' ? t.stWin : d.result === 'lose' ? t.stLose : t.stDraw
  return d.yourTurn ? t.stYourTurn : t.stTheirTurn
}
