export type OperationsEnv = { DB: D1Database }
export type OperationsUser = { id: string; display_name: string } | null

const EVENT_NAMES = new Set(['page_view', 'read_start', 'search', 'learning_open', 'review_complete'])
const CATEGORIES = new Set(['bug', 'suggestion', 'content', 'other'])
const STATUSES = new Set(['open', 'reviewing', 'resolved', 'closed'])
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

export class OperationsError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers })
}

async function requestBody(request: Request) {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 16_000) throw new OperationsError('送信データが大きすぎます。', 413)
  if (!request.headers.get('content-type')?.includes('application/json')) throw new OperationsError('JSON 形式で送信してください。', 415)
  try { return await request.json<Record<string, unknown>>() }
  catch { throw new OperationsError('JSON を読み取れませんでした。') }
}

async function digest(value: string) {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function cleanString(value: unknown, max: number) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().slice(0, max) : ''
}

export function normalizePath(value: unknown) {
  const path = cleanString(value, 240).split('?')[0].split('#')[0]
  if (/^\/read\/\d+$/.test(path)) return '/read/:id'
  return ['/','/articles','/learn','/review','/record','/feedback','/admin'].includes(path) ? path : '/other'
}

export function normalizeFeedbackPath(value: unknown) {
  const path = cleanString(value, 240).split('?')[0].split('#')[0]
  if (/^\/read\/\d+$/.test(path)) return path
  return ['/','/articles','/learn','/review','/record','/feedback'].includes(path) ? path : '/'
}

export function normalizeAnalyticsInput(data: Record<string, unknown>) {
  const eventName = cleanString(data.eventName, 40)
  if (!EVENT_NAMES.has(eventName)) throw new OperationsError('記録できないイベントです。')
  const visitorID = cleanString(data.visitorID, 80)
  if (visitorID.length < 16) throw new OperationsError('訪問情報を確認できません。')
  return {
    id: cleanString(data.eventID, 80) || crypto.randomUUID(), eventName, visitorID,
    pathGroup: normalizePath(data.path), workID: cleanString(data.workID, 20) || null,
    label: cleanString(data.label, 120) || null,
    value: Number.isFinite(Number(data.value)) ? Math.max(0, Math.min(1_000_000, Math.round(Number(data.value)))) : null,
  }
}

export function normalizeFeedbackInput(data: Record<string, unknown>) {
  const category = cleanString(data.category, 20)
  if (!CATEGORIES.has(category)) throw new OperationsError('種類を選んでください。')
  const message = cleanString(data.message, 2_000)
  if (message.length < 10) throw new OperationsError('ご意見は10文字以上で入力してください。')
  const visitorID = cleanString(data.visitorID, 80)
  if (visitorID.length < 16) throw new OperationsError('訪問情報を確認できません。')
  const contact = cleanString(data.contact, 160)
  const website = cleanString(data.website, 200)
  if (website) throw new OperationsError('送信できませんでした。')
  return { category, message, visitorID, contact: contact || null, pagePath: normalizeFeedbackPath(data.pagePath) }
}

export async function isAdmin(env: OperationsEnv, userID?: string | null) {
  if (!userID) return false
  return Boolean(await env.DB.prepare('SELECT user_id FROM admins WHERE user_id = ?1').bind(userID).first())
}

export async function recordAnalytics(request: Request, env: OperationsEnv, user: OperationsUser) {
  const input = normalizeAnalyticsInput(await requestBody(request))
  const visitorHash = await digest(input.visitorID)
  const now = Date.now()
  const recent = await env.DB.prepare('SELECT COUNT(*) AS count FROM analytics_events WHERE visitor_hash = ?1 AND created_at >= ?2')
    .bind(visitorHash, now - 86_400_000).first<{ count: number }>()
  if ((recent?.count || 0) >= 200) return response({ accepted: false }, 202)
  await env.DB.prepare(`INSERT OR IGNORE INTO analytics_events
    (id, user_id, visitor_hash, event_name, path_group, work_id, label, value, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(input.id, user?.id || null, visitorHash, input.eventName, input.pathGroup, input.workID, input.label, input.value, now).run()
  return response({ accepted: true }, 202)
}

export async function submitFeedback(request: Request, env: OperationsEnv, user: OperationsUser) {
  const input = normalizeFeedbackInput(await requestBody(request))
  const visitorHash = await digest(input.visitorID)
  const now = Date.now()
  const recent = await env.DB.prepare('SELECT COUNT(*) AS count FROM feedback WHERE visitor_hash = ?1 AND created_at >= ?2')
    .bind(visitorHash, now - 86_400_000).first<{ count: number }>()
  if ((recent?.count || 0) >= 5) throw new OperationsError('本日の送信上限に達しました。', 429)
  const feedbackID = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO feedback
      (id, user_id, visitor_hash, category, message, contact, page_path, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, ?8)`)
      .bind(feedbackID, user?.id || null, visitorHash, input.category, input.message, input.contact, input.pagePath, now),
    env.DB.prepare(`INSERT INTO analytics_events
      (id, user_id, visitor_hash, event_name, path_group, created_at) VALUES (?1, ?2, ?3, 'feedback_submitted', '/feedback', ?4)`)
      .bind(crypto.randomUUID(), user?.id || null, visitorHash, now),
  ])
  return response({ submitted: true, id: feedbackID }, 201)
}

export async function adminOverview(env: OperationsEnv, user: OperationsUser) {
  if (!await isAdmin(env, user?.id)) throw new OperationsError('管理者権限が必要です。', 403)
  const now = Date.now()
  const sevenDays = now - 7 * 86_400_000
  const fourteenDays = now - 13 * 86_400_000
  const [metrics, daily, topWorks, events, feedback, users] = await env.DB.batch([
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS totalUsers,
      (SELECT COUNT(DISTINCT COALESCE(user_id, visitor_hash)) FROM analytics_events WHERE created_at >= ?1) AS activeReaders7d,
      (SELECT COUNT(*) FROM analytics_events WHERE event_name = 'read_start' AND created_at >= ?1) AS readStarts7d,
      (SELECT COUNT(*) FROM feedback WHERE status IN ('open', 'reviewing')) AS openFeedback`).bind(sevenDays),
    env.DB.prepare(`SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS date,
      COUNT(DISTINCT COALESCE(user_id, visitor_hash)) AS readers,
      SUM(CASE WHEN event_name = 'read_start' THEN 1 ELSE 0 END) AS readStarts
      FROM analytics_events WHERE created_at >= ?1 GROUP BY date ORDER BY date`).bind(fourteenDays),
    env.DB.prepare(`SELECT work_id AS workID, COALESCE(MAX(label), work_id) AS title, COUNT(*) AS count
      FROM analytics_events WHERE event_name = 'read_start' AND created_at >= ?1 AND work_id IS NOT NULL
      GROUP BY work_id ORDER BY count DESC LIMIT 8`).bind(sevenDays),
    env.DB.prepare(`SELECT event_name AS eventName, COUNT(*) AS count FROM analytics_events
      WHERE created_at >= ?1 GROUP BY event_name ORDER BY count DESC`).bind(sevenDays),
    env.DB.prepare(`SELECT f.id, f.category, f.message, f.contact, f.page_path AS pagePath, f.status,
      f.created_at AS createdAt, u.display_name AS displayName FROM feedback f
      LEFT JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC LIMIT 30`),
    env.DB.prepare(`SELECT u.id, u.display_name AS displayName, u.created_at AS createdAt,
      MAX(e.created_at) AS lastActiveAt, COUNT(e.id) AS eventCount,
      CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS hasCloudState
      FROM users u LEFT JOIN analytics_events e ON e.user_id = u.id
      LEFT JOIN reader_states r ON r.user_id = u.id
      GROUP BY u.id, u.display_name, u.created_at, r.user_id ORDER BY u.created_at DESC LIMIT 100`),
  ])
  return response({
    generatedAt: now,
    metrics: metrics.results[0] || {}, daily: daily.results, topWorks: topWorks.results,
    events: events.results, feedback: feedback.results, users: users.results,
  })
}

export async function updateFeedback(request: Request, env: OperationsEnv, user: OperationsUser, id: string) {
  if (!await isAdmin(env, user?.id)) throw new OperationsError('管理者権限が必要です。', 403)
  const data = await requestBody(request)
  const status = cleanString(data.status, 20)
  if (!STATUSES.has(status)) throw new OperationsError('状態を確認してください。')
  const result = await env.DB.prepare('UPDATE feedback SET status = ?1, updated_at = ?2 WHERE id = ?3')
    .bind(status, Date.now(), id).run()
  if (!result.meta.changes) throw new OperationsError('ご意見が見つかりません。', 404)
  return response({ updated: true })
}
