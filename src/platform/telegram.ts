/**
 * Telegram Mini App bridge with a plain-browser fallback.
 *
 * - The official SDK script is loaded ONLY when the page was launched by Telegram
 *   (launch params in the URL hash), so the browser build makes no external requests.
 * - Calls ready()/expand(), colors the header, disables vertical swipe-to-close where
 *   supported, mirrors Telegram safe areas into CSS variables, offers haptics/back button.
 * - No bot token, no secrets, no trust in initDataUnsafe: online play (later) must
 *   send raw initData to the server for signature validation.
 */

type Insets = { top: number; bottom: number; left: number; right: number }

interface TgWebApp {
  version: string
  platform: string
  initData: string
  colorScheme?: 'light' | 'dark'
  initDataUnsafe?: { start_param?: string; user?: { language_code?: string; allows_write_to_pm?: boolean } }
  shareMessage?(id: string, cb?: (sent: boolean) => void): void
  openTelegramLink?(url: string): void
  requestWriteAccess?(cb?: (granted: boolean) => void): void
  safeAreaInset?: Insets
  contentSafeAreaInset?: Insets
  ready(): void
  expand(): void
  isVersionAtLeast(v: string): boolean
  setHeaderColor?(c: string): void
  setBackgroundColor?(c: string): void
  setBottomBarColor?(c: string): void
  disableVerticalSwipes?(): void
  onEvent(e: string, cb: () => void): void
  offEvent(e: string, cb: () => void): void
  HapticFeedback?: {
    impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(t: 'error' | 'success' | 'warning'): void
  }
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp }
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'
const BG = '#171916'

export interface Platform {
  inTelegram: boolean
  platformName: string
  langHint: string | null
  /** Raw signed launch data; sent to the server as `Authorization: tma <initData>`. */
  initData: string
  /** Game to open on launch: `startapp=d_<id>` (chat card) or `?duel=<id>` (bot button). */
  startDuelId: string | null
  haptic(kind: 'roll' | 'win' | 'lose'): void
  setBackHandler(fn: (() => void) | null): void
  /** Native share sheet with a prepared message (Bot API 8.0), else the t.me share link. */
  share(prepared: string | null, link: string, text: string): Promise<boolean>
  /** Opt-in for bot messages ("твой бросок"). */
  requestWriteAccess(): Promise<boolean>
}

const ID_RE = /^[A-Za-z0-9]{6,32}$/

function queryDuelId(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get('duel')
    return q && ID_RE.test(q) ? q : null
  } catch {
    return null
  }
}

export function launchedFromTelegram(hash = typeof location !== 'undefined' ? location.hash : ''): boolean {
  return /tgWebApp(Data|Platform|Version)=/.test(hash)
}

function loadSdk(timeoutMs = 4000): Promise<TgWebApp | null> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp)
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = SDK_URL
    s.async = true
    const t = setTimeout(() => resolve(window.Telegram?.WebApp ?? null), timeoutMs)
    s.onload = () => {
      clearTimeout(t)
      resolve(window.Telegram?.WebApp ?? null)
    }
    s.onerror = () => {
      clearTimeout(t)
      resolve(null)
    }
    document.head.appendChild(s)
  })
}

function applyInsets(wa: TgWebApp) {
  const a = wa.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 }
  const c = wa.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 }
  const root = document.documentElement.style
  root.setProperty('--tg-safe-top', `${(a.top || 0) + (c.top || 0)}px`)
  root.setProperty('--tg-safe-bottom', `${(a.bottom || 0) + (c.bottom || 0)}px`)
  root.setProperty('--tg-safe-left', `${(a.left || 0) + (c.left || 0)}px`)
  root.setProperty('--tg-safe-right', `${(a.right || 0) + (c.right || 0)}px`)
}

const browserPlatform: Platform = {
  inTelegram: false,
  platformName: 'browser',
  langHint: null,
  initData: '',
  startDuelId: null,
  share: async () => false,
  requestWriteAccess: async () => false,
  haptic: (kind) => {
    try {
      navigator.vibrate?.(kind === 'roll' ? 15 : kind === 'win' ? [20, 40, 20] : 40)
    } catch {
      /* ignore */
    }
  },
  setBackHandler: () => {},
}

export async function initPlatform(): Promise<Platform> {
  if (typeof window === 'undefined' || !launchedFromTelegram()) return browserPlatform
  const wa = await loadSdk()
  if (!wa) return browserPlatform

  const at = (v: string) => {
    try {
      return wa.isVersionAtLeast(v)
    } catch {
      return false
    }
  }
  try {
    wa.ready()
    wa.expand()
    if (at('6.1')) {
      wa.setHeaderColor?.(BG)
      wa.setBackgroundColor?.(BG)
    }
    if (at('7.10')) wa.setBottomBarColor?.(BG)
    if (at('7.7')) wa.disableVerticalSwipes?.()
    if (at('8.0')) {
      applyInsets(wa)
      const onInsets = () => applyInsets(wa)
      wa.onEvent('safeAreaChanged', onInsets)
      wa.onEvent('contentSafeAreaChanged', onInsets)
    }
  } catch (e) {
    console.warn('[telegram] init partially failed', e)
  }

  let back: (() => void) | null = null
  const onBack = () => back?.()
  const hasBack = at('6.1') && !!wa.BackButton
  if (hasBack) wa.BackButton!.onClick(onBack)

  const sp = wa.initDataUnsafe?.start_param ?? ''
  const startDuelId = sp.startsWith('d_') && ID_RE.test(sp.slice(2)) ? sp.slice(2) : queryDuelId()

  return {
    inTelegram: true,
    platformName: wa.platform || 'telegram',
    initData: wa.initData || '',
    startDuelId,
    share: (prepared, link, text) =>
      new Promise((resolve) => {
        try {
          if (prepared && wa.shareMessage && at('8.0')) {
            wa.shareMessage(prepared, (sent) => resolve(!!sent))
            return
          }
        } catch {
          /* fall through to the link */
        }
        const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
        try {
          if (wa.openTelegramLink) wa.openTelegramLink(url)
          else window.open(url, '_blank')
        } catch {
          /* ignore */
        }
        resolve(true)
      }),
    requestWriteAccess: () => {
      if (wa.initDataUnsafe?.user?.allows_write_to_pm) return Promise.resolve(true)
      if (!wa.requestWriteAccess || !at('6.9')) return Promise.resolve(false)
      return new Promise((resolve) => {
        try {
          wa.requestWriteAccess!((ok) => resolve(!!ok))
        } catch {
          resolve(false)
        }
      })
    },
    langHint: wa.initDataUnsafe?.user?.language_code ?? null, // UI hint only, never trusted
    haptic: (kind) => {
      if (!at('6.1') || !wa.HapticFeedback) return
      if (kind === 'roll') wa.HapticFeedback.impactOccurred('medium')
      else wa.HapticFeedback.notificationOccurred(kind === 'win' ? 'success' : 'warning')
    },
    setBackHandler: (fn) => {
      back = fn
      if (!hasBack) return
      if (fn) wa.BackButton!.show()
      else wa.BackButton!.hide()
    },
  }
}
