/**
 * Telegram helpers for the Worker: initData validation (WebCrypto) and a
 * minimal Bot API client. Works in Workers and in Node 20+ (tests).
 */
import type { PlayerInfo } from '../src/online/protocol';

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export interface InitDataInfo {
  user: PlayerInfo;
  authDate: number;
  chatInstance: string | null;
  chatType: string | null;
  startParam: string | null;
}

/**
 * Validates Telegram.WebApp.initData per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Returns null when the signature is wrong or the data is too old.
 */
export async function validateInitData(
  initData: string,
  botToken: string,
  nowSec: number,
  maxAgeSec = 48 * 3600,
): Promise<InitDataInfo | null> {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  const pairs: string[] = [];
  for (const [k, v] of params) if (k !== 'hash') pairs.push(`${k}=${v}`);
  pairs.sort();
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const calc = hex(await hmac(secret, pairs.join('\n')));
  if (!timingSafeEqual(calc, hash.toLowerCase())) return null;
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || nowSec - authDate > maxAgeSec) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(params.get('user') ?? 'null');
  } catch {
    return null;
  }
  if (!raw || typeof raw.id !== 'number') return null;
  const name = [raw.first_name, raw.last_name].filter((x) => typeof x === 'string' && x).join(' ').trim();
  return {
    user: {
      id: raw.id,
      name: (name || (raw.username as string) || 'Игрок').slice(0, 32),
      username: typeof raw.username === 'string' ? raw.username : undefined,
      photo: typeof raw.photo_url === 'string' ? raw.photo_url : undefined,
    },
    authDate,
    chatInstance: params.get('chat_instance'),
    chatType: params.get('chat_type'),
    startParam: params.get('start_param'),
  };
}

/** Test helper: builds a correctly signed initData string. */
export async function signInitData(fields: Record<string, string>, botToken: string): Promise<string> {
  const pairs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const hash = hex(await hmac(secret, pairs.join('\n')));
  const p = new URLSearchParams(fields);
  p.set('hash', hash);
  return p.toString();
}

/** Secret for the webhook header, derived from the bot token (no extra config needed). */
export async function webhookSecret(botToken: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode('shootdice-webhook:' + botToken));
  return hex(d).slice(0, 48);
}

export class BotApi {
  private token: string;
  private base: string;
  /** `base` lets local tests point the bot at a mock Bot API (TG_API_BASE). */
  constructor(token: string, base = 'https://api.telegram.org') {
    this.token = token;
    this.base = base.replace(/\/+$/, '');
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.base}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
    });
    const body = (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    if (!body.ok) throw new Error(`${method}: ${body.description ?? 'error'}`);
    return body.result as T;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
