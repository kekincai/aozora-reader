import { describe, expect, it, vi } from 'vitest'
import { japanDate, japanHour, sendDailyReminders, validSubscription } from './push'

async function browserKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer)
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
  return { p256dh: b64(raw), auth: b64(auth), privateKey: pair.privateKey, raw, authBytes: auth }
}

async function hmac(key: Uint8Array, data: Uint8Array) {
  const imported = await crypto.subtle.importKey('raw', key as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data as Uint8Array<ArrayBuffer>))
}

const bytes = (text: string) => new TextEncoder().encode(text)
const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(part => [...part]))

/** Decrypts an aes128gcm push body the way a browser does (RFC 8291 §3.4, RFC 8188). */
async function decryptAsBrowser(body: Uint8Array, keys: Awaited<ReturnType<typeof browserKeys>>) {
  const salt = body.slice(0, 16)
  const idLength = body[20]
  const serverPublic = body.slice(21, 21 + idLength)
  const ciphertext = body.slice(21 + idLength)
  const serverKey = await crypto.subtle.importKey('raw', serverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, keys.privateKey, 256))
  const prkKey = await hmac(keys.authBytes, shared)
  const ikm = await hmac(prkKey, join(bytes('WebPush: info\0'), keys.raw, serverPublic, Uint8Array.of(1)))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, join(bytes('Content-Encoding: aes128gcm\0'), Uint8Array.of(1)))).slice(0, 16)
  const nonce = (await hmac(prk, join(bytes('Content-Encoding: nonce\0'), Uint8Array.of(1)))).slice(0, 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
  return new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2)))
}

async function vapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer)
  return { VAPID_PRIVATE_KEY: jwk.d!, VAPID_PUBLIC_KEY: Buffer.from(raw).toString('base64url') }
}

/** Just enough of D1 for the reminder job: one SELECT and a list of writes. */
function fakeDB(rows: unknown[]) {
  const writes: Array<{ sql: string; values: unknown[] }> = []
  const selects: unknown[][] = []
  return {
    writes, selects,
    prepare(sql: string) {
      return {
        bind: (...values: unknown[]) => ({
          all: async () => { selects.push(values); return { results: rows } },
          run: async () => { writes.push({ sql, values }); return {} },
        }),
        run: async () => { writes.push({ sql, values: [] }); return {} },
      }
    },
  }
}

describe('validSubscription', () => {
  it('accepts browser push services and rejects anything else', async () => {
    const keys = await browserKeys()
    expect(validSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys })).not.toBeNull()
    expect(validSubscription({ endpoint: 'https://web.push.apple.com/abc', keys })).not.toBeNull()
    expect(validSubscription({ endpoint: 'https://example.com/steal', keys })).toBeNull()
    expect(validSubscription({ endpoint: 'http://fcm.googleapis.com/x', keys })).toBeNull()
    expect(validSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'short', auth: keys.auth } })).toBeNull()
  })
})

describe('Japan time', () => {
  it('turns the day and hour over at JST midnight', () => {
    const lateUtc = Date.parse('2026-09-27T15:30:00Z')
    expect(japanDate(lateUtc)).toBe('2026-09-28')
    expect(japanHour(lateUtc)).toBe(0)
  })
})

describe('sendDailyReminders', () => {
  it('sends an encrypted push to people due this hour and removes expired subscriptions', async () => {
    const keys = await browserKeys()
    const row = { p256dh: keys.p256dh, auth: keys.auth }
    const db = fakeDB([
      { endpoint: 'https://fcm.googleapis.com/fcm/send/live', ...row },
      { endpoint: 'https://fcm.googleapis.com/fcm/send/gone', ...row },
    ])
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => new Response(null, { status: url.endsWith('gone') ? 410 : 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const now = Date.parse('2026-09-28T12:00:00Z') // 21:00 JST
    const result = await sendDailyReminders({ DB: db as unknown as D1Database, ...await vapidKeys() }, now)
    vi.unstubAllGlobals()

    expect(result).toEqual({ sent: 1, removed: 1 })
    expect(db.selects[0]).toEqual([21, '2026-09-28'])
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const sentHeaders = new Headers(init.headers)
    expect(sentHeaders.get('content-encoding')).toBe('aes128gcm')
    expect(sentHeaders.get('authorization')).toMatch(/^vapid t=/)
    const message = JSON.parse(await decryptAsBrowser(new Uint8Array(init.body as ArrayBuffer), keys))
    expect(message).toEqual({ title: '今日の一頁', body: 'つづきが待っています。約5分で読めます。', url: '/daily' })
    expect(db.writes.some(write => write.sql.startsWith('DELETE FROM push_subscriptions WHERE endpoint') && write.values[0] === 'https://fcm.googleapis.com/fcm/send/gone')).toBe(true)
    expect(db.writes.some(write => write.sql.includes('last_sent_date') && write.values[0] === '2026-09-28')).toBe(true)
  })

  it('does nothing without a private key', async () => {
    const db = fakeDB([])
    expect(await sendDailyReminders({ DB: db as unknown as D1Database })).toMatchObject({ sent: 0 })
  })
})
