import type { CreateDuelResponse, DuelView, MeResponse, RollResponse } from './protocol'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export interface Api {
  me(): Promise<MeResponse>
  create(): Promise<CreateDuelResponse>
  duel(id: string): Promise<DuelView>
  accept(id: string): Promise<DuelView>
  roll(id: string, expected: number): Promise<RollResponse>
  forfeit(id: string): Promise<DuelView>
  rematch(id: string): Promise<{ id: string }>
  share(id: string): Promise<{ prepared: string | null }>
}

export function createApi(initData: string, base = ''): Api {
  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${base}/api${path}`, {
        method,
        headers: {
          authorization: `tma ${initData}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : method === 'POST' ? '{}' : undefined,
      })
    } catch {
      throw new ApiError(0, 'network', 'Нет связи с сервером. Проверь интернет.')
    }
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(res.status, data?.error ?? 'http', data?.message ?? `Ошибка сервера (${res.status})`)
    return data as T
  }
  return {
    me: () => request('GET', '/me'),
    create: () => request('POST', '/duels'),
    duel: (id) => request('GET', `/duels/${id}`),
    accept: (id) => request('POST', `/duels/${id}/accept`),
    roll: (id, expected) => request('POST', `/duels/${id}/roll`, { expected }),
    forfeit: (id) => request('POST', `/duels/${id}/forfeit`),
    rematch: (id) => request('POST', `/duels/${id}/rematch`),
    share: (id) => request('POST', `/duels/${id}/share`),
  }
}

/** Duels need Telegram identity and the duel server on the same origin. */
export async function detectOnline(inTelegram: boolean, initData: string): Promise<boolean> {
  if (!inTelegram || !initData) return false
  try {
    const res = await fetch('/api/health', { cache: 'no-store' })
    if (!res.ok) return false
    const data = await res.json()
    return !!data?.configured
  } catch {
    return false
  }
}
