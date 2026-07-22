import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { catalogHealth, getWork, listGrammar, listVocabulary, listWorks, todayWork, type CatalogEnv } from './catalog'
import { adminOverview, isAdmin, OperationsError, recordAnalytics, submitFeedback, updateFeedback } from './operations'

interface Env extends CatalogEnv {
  DB: D1Database
}

type UserRow = { id: string; display_name: string }
type ChallengeRow = {
  id: string
  challenge: string
  purpose: 'register' | 'login'
  user_id: string | null
  display_name: string | null
  rp_id: string
  origin: string
  expires_at: number
}
type PasskeyRow = {
  credential_id: string
  user_id: string
  public_key: ArrayBuffer
  counter: number
  transports: string | null
  device_type: string
  backed_up: number
}

const SESSION_DAYS = 30
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...headers } })
}

function error(message: string, status = 400) {
  return json({ error: message }, status)
}

function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie') || ''
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

function sessionCookie(request: Request, token: string, maxAge = SESSION_DAYS * 86400) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `aozora_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`
}

function requestSite(request: Request) {
  const url = new URL(request.url)
  return { origin: url.origin, rpID: url.hostname }
}

function checkSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  return request.method === 'GET' || origin === new URL(request.url).origin
}

async function body<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 256_000) throw new ApiError('送信データが大きすぎます。', 413)
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError('JSON 形式で送信してください。', 415)
  try { return await request.json<T>() }
  catch { throw new ApiError('JSON を読み取れませんでした。', 400) }
}

async function currentUser(request: Request, env: Env) {
  const token = cookie(request, 'aozora_session')
  if (!token) return null
  const tokenHash = await sha256(token)
  return env.DB.prepare(`
    SELECT users.id, users.display_name
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(tokenHash, Date.now()).first<UserRow>()
}

async function issueSession(request: Request, env: Env, userID: string) {
  const token = randomToken()
  const now = Date.now()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userID, now + SESSION_DAYS * 86400_000, now).run()
  return sessionCookie(request, token)
}

async function cleanup(env: Env) {
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_challenges WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM analytics_events WHERE created_at <= ?').bind(now - 180 * 86_400_000),
  ])
}

async function registerOptions(request: Request, env: Env) {
  const data = await body<{ displayName?: string }>(request)
  const displayName = data.displayName?.trim()
  if (!displayName || displayName.length > 40) return error('名前は1〜40文字で入力してください。')
  const { rpID, origin } = requestSite(request)
  const userID = crypto.randomUUID()
  const options = await generateRegistrationOptions({
    rpName: '青空しおり', rpID, userID: new TextEncoder().encode(userID), userName: displayName,
    userDisplayName: displayName, attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    preferredAuthenticatorType: 'localDevice',
  })
  const challengeID = crypto.randomUUID()
  await env.DB.prepare(`INSERT INTO auth_challenges
    (id, challenge, purpose, user_id, display_name, rp_id, origin, expires_at) VALUES (?, ?, 'register', ?, ?, ?, ?, ?)`)
    .bind(challengeID, options.challenge, userID, displayName, rpID, origin, Date.now() + 5 * 60_000).run()
  return json({ challengeID, options })
}

async function registerVerify(request: Request, env: Env) {
  const data = await body<{ challengeID?: string; response?: RegistrationResponseJSON }>(request)
  if (!data.challengeID || !data.response) return error('登録情報が不足しています。')
  const challenge = await env.DB.prepare('SELECT * FROM auth_challenges WHERE id = ?').bind(data.challengeID).first<ChallengeRow>()
  if (!challenge || challenge.purpose !== 'register' || challenge.expires_at <= Date.now()) return error('登録の有効時間が切れました。もう一度お試しください。', 410)
  const site = requestSite(request)
  if (challenge.rp_id !== site.rpID || challenge.origin !== site.origin) return error('登録元を確認できません。', 403)
  const verification = await verifyRegistrationResponse({ response: data.response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.origin, expectedRPID: challenge.rp_id, requireUserVerification: true })
  if (!verification.verified || !challenge.user_id || !challenge.display_name) return error('パスキーを確認できませんでした。')
  const info = verification.registrationInfo
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, display_name, created_at) VALUES (?, ?, ?)').bind(challenge.user_id, challenge.display_name, now),
    env.DB.prepare(`INSERT INTO passkeys
      (credential_id, user_id, public_key, counter, transports, device_type, backed_up, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(info.credential.id, challenge.user_id, info.credential.publicKey, info.credential.counter,
        JSON.stringify(info.credential.transports || []), info.credentialDeviceType, info.credentialBackedUp ? 1 : 0, now),
    env.DB.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(challenge.id),
  ])
  const sessionHeader = await issueSession(request, env, challenge.user_id)
  return json({ user: { id: challenge.user_id, displayName: challenge.display_name, isAdmin: false } }, 201, { 'set-cookie': sessionHeader })
}

async function loginOptions(request: Request, env: Env) {
  const { rpID, origin } = requestSite(request)
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' })
  const challengeID = crypto.randomUUID()
  await env.DB.prepare(`INSERT INTO auth_challenges
    (id, challenge, purpose, rp_id, origin, expires_at) VALUES (?, ?, 'login', ?, ?, ?)`)
    .bind(challengeID, options.challenge, rpID, origin, Date.now() + 5 * 60_000).run()
  return json({ challengeID, options })
}

async function loginVerify(request: Request, env: Env) {
  const data = await body<{ challengeID?: string; response?: AuthenticationResponseJSON }>(request)
  if (!data.challengeID || !data.response) return error('ログイン情報が不足しています。')
  const challenge = await env.DB.prepare('SELECT * FROM auth_challenges WHERE id = ?').bind(data.challengeID).first<ChallengeRow>()
  if (!challenge || challenge.purpose !== 'login' || challenge.expires_at <= Date.now()) return error('ログインの有効時間が切れました。もう一度お試しください。', 410)
  const site = requestSite(request)
  if (challenge.rp_id !== site.rpID || challenge.origin !== site.origin) return error('ログイン元を確認できません。', 403)
  const passkey = await env.DB.prepare('SELECT * FROM passkeys WHERE credential_id = ?').bind(data.response.id).first<PasskeyRow>()
  if (!passkey) return error('このパスキーは登録されていません。', 404)
  const verification = await verifyAuthenticationResponse({
    response: data.response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.origin,
    expectedRPID: challenge.rp_id, requireUserVerification: true,
    credential: { id: passkey.credential_id, publicKey: new Uint8Array(passkey.public_key), counter: passkey.counter, transports: passkey.transports ? JSON.parse(passkey.transports) : undefined },
  })
  if (!verification.verified) return error('パスキーを確認できませんでした。', 401)
  const sessionHeader = await issueSession(request, env, passkey.user_id)
  await env.DB.batch([
    env.DB.prepare('UPDATE passkeys SET counter = ? WHERE credential_id = ?').bind(verification.authenticationInfo.newCounter, passkey.credential_id),
    env.DB.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(challenge.id),
  ])
  const user = await env.DB.prepare('SELECT id, display_name FROM users WHERE id = ?').bind(passkey.user_id).first<UserRow>()
  return json({ user: { id: user?.id, displayName: user?.display_name, isAdmin: await isAdmin(env, user?.id) } }, 200, { 'set-cookie': sessionHeader })
}

async function stateRoute(request: Request, env: Env) {
  const user = await currentUser(request, env)
  if (!user) return error('ログインが必要です。', 401)
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT state_json, updated_at FROM reader_states WHERE user_id = ?').bind(user.id).first<{ state_json: string; updated_at: number }>()
    return json({ state: row ? JSON.parse(row.state_json) : null, updatedAt: row?.updated_at || null })
  }
  const data = await body<{ state?: unknown }>(request)
  const serialized = JSON.stringify(data.state)
  if (serialized.length > 200_000) return error('学習記録が大きすぎます。', 413)
  const now = Date.now()
  await env.DB.prepare(`INSERT INTO reader_states (user_id, state_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .bind(user.id, serialized, now).run()
  return json({ saved: true, updatedAt: now })
}

async function handle(request: Request, env: Env) {
  const url = new URL(request.url)
  if (!checkSameOrigin(request)) return error('不正な送信元です。', 403)
  if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true })
  if (request.method === 'GET' && url.pathname === '/api/catalog/health') return catalogHealth(env)
  if (request.method === 'GET' && url.pathname === '/api/catalog/works') return listWorks(request, env)
  if (request.method === 'GET' && url.pathname === '/api/catalog/today') return todayWork(request, env)
  if (request.method === 'GET' && url.pathname === '/api/learning/vocabulary') return listVocabulary(request, env)
  if (request.method === 'GET' && url.pathname === '/api/learning/grammar') return listGrammar(request, env)
  const workMatch = request.method === 'GET' ? url.pathname.match(/^\/api\/catalog\/works\/(\d+)$/) : null
  if (workMatch) return getWork(request, env, workMatch[1])
  if (request.method === 'GET' && url.pathname === '/api/me') {
    const user = await currentUser(request, env)
    return json({ user: user ? { id: user.id, displayName: user.display_name, isAdmin: await isAdmin(env, user.id) } : null })
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/register/options') return registerOptions(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/register/verify') return registerVerify(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/login/options') return loginOptions(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/login/verify') return loginVerify(request, env)
  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = cookie(request, 'aozora_session')
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', 0) })
  }
  if (url.pathname === '/api/state' && (request.method === 'GET' || request.method === 'PUT')) return stateRoute(request, env)
  if (request.method === 'POST' && url.pathname === '/api/analytics') return recordAnalytics(request, env, await currentUser(request, env))
  if (request.method === 'POST' && url.pathname === '/api/feedback') return submitFeedback(request, env, await currentUser(request, env))
  if (request.method === 'GET' && url.pathname === '/api/admin/overview') return adminOverview(env, await currentUser(request, env))
  const feedbackMatch = request.method === 'PATCH' ? url.pathname.match(/^\/api\/admin\/feedback\/([0-9a-f-]+)$/) : null
  if (feedbackMatch) return updateFeedback(request, env, await currentUser(request, env), feedbackMatch[1])
  return error('API が見つかりません。', 404)
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      if (Math.random() < 0.02) await cleanup(env)
      return await handle(request, env)
    } catch (cause) {
      console.error(cause)
      if (cause instanceof ApiError || cause instanceof OperationsError) return error(cause.message, cause.status)
      return error('処理を完了できませんでした。', 500)
    }
  },
} satisfies ExportedHandler<Env>
