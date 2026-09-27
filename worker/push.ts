import { buildPushPayload } from '@block65/webcrypto-web-push'
import { OperationsError } from './operations'

export type PushEnv = { DB: D1Database; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }
type SubscriptionRow = { endpoint: string; p256dh: string; auth: string }

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers })

// The hourly job POSTs to stored endpoints, so only real browser push services are accepted.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/]

export function japanDate(now = Date.now()) {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10)
}

export function japanHour(now = Date.now()) {
  return new Date(now + 9 * 3_600_000).getUTCHours()
}

export function validSubscription(value: unknown): SubscriptionRow | null {
  const subscription = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  if (!subscription || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 1000) return null
  let url: URL
  try { url = new URL(subscription.endpoint) } catch { return null }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some(pattern => pattern.test(url.hostname))) return null
  const p256dh = subscription.keys?.p256dh
  const auth = subscription.keys?.auth
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,32}$/.test(auth)) return null
  return { endpoint: subscription.endpoint, p256dh, auth }
}

async function readBody(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 4_000) throw new OperationsError('送信データが大きすぎます。', 413)
  try { return await request.json<Record<string, unknown>>() } catch { throw new OperationsError('JSON を読み取れませんでした。') }
}

export async function pushRoute(request: Request, env: PushEnv, url: URL, userID: string | null) {
  if (request.method === 'GET' && url.pathname === '/api/push/key') {
    return env.VAPID_PUBLIC_KEY ? response({ publicKey: env.VAPID_PUBLIC_KEY }) : response({ error: '通知は準備中です。' }, 503)
  }
  if (request.method !== 'POST') return null
  const data = await readBody(request)
  const now = Date.now()
  if (url.pathname === '/api/push/subscribe') {
    const subscription = validSubscription(data.subscription)
    const hour = Number(data.hour)
    if (!subscription) throw new OperationsError('通知の登録情報を確認できません。')
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new OperationsError('通知の時刻を確認してください。')
    const readToday = data.readToday === true ? japanDate(now) : null
    await env.DB.prepare(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, hour, last_read_date, user_id, failures, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, hour = excluded.hour,
        last_read_date = COALESCE(excluded.last_read_date, push_subscriptions.last_read_date),
        user_id = COALESCE(excluded.user_id, push_subscriptions.user_id), failures = 0, updated_at = excluded.updated_at`)
      .bind(subscription.endpoint, subscription.p256dh, subscription.auth, hour, readToday, userID, now).run()
    return response({ subscribed: true, hour })
  }
  const endpoint = typeof data.endpoint === 'string' ? data.endpoint.slice(0, 1000) : ''
  if (!endpoint) throw new OperationsError('通知の登録情報を確認できません。')
  if (url.pathname === '/api/push/unsubscribe') {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(endpoint).run()
    return response({ unsubscribed: true })
  }
  if (url.pathname === '/api/push/read') {
    await env.DB.prepare('UPDATE push_subscriptions SET last_read_date = ?1, updated_at = ?2 WHERE endpoint = ?3').bind(japanDate(now), now, endpoint).run()
    return response({ recorded: true })
  }
  return null
}

/** Hourly: remind everyone whose chosen hour it is and who has not read today. */
export async function sendDailyReminders(env: PushEnv, now = Date.now()) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return { sent: 0, removed: 0, skipped: 'no key' }
  const today = japanDate(now)
  const { results } = await env.DB.prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions
    WHERE hour = ?1 AND (last_read_date IS NULL OR last_read_date < ?2) AND (last_sent_date IS NULL OR last_sent_date < ?2)
    LIMIT 500`).bind(japanHour(now), today).all<SubscriptionRow>()
  let sent = 0
  let removed = 0
  for (const row of results) {
    try {
      // aes128gcm (RFC 8291), which Apple's push service requires.
      const payload = await buildPushPayload(
        { data: { title: '今日の一頁', body: 'つづきが待っています。約5分で読めます。', url: '/daily' }, options: { ttl: 3 * 3600, urgency: 'normal', topic: 'daily-page' } },
        { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } },
        { subject: 'https://aozora-reader.kekincai.workers.dev', publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
      )
      const result = await fetch(row.endpoint, payload)
      if (result.status === 404 || result.status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(row.endpoint).run()
        removed += 1
      } else if (result.ok) {
        await env.DB.prepare('UPDATE push_subscriptions SET last_sent_date = ?1, failures = 0 WHERE endpoint = ?2').bind(today, row.endpoint).run()
        sent += 1
      } else {
        await env.DB.prepare('UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = ?1').bind(row.endpoint).run()
      }
    } catch (error) {
      console.error('push failed', error)
      await env.DB.prepare('UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = ?1').bind(row.endpoint).run()
    }
  }
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE failures >= 5').run()
  return { sent, removed }
}
