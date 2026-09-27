import { japanDate } from './state/store'

const HOUR_KEY = 'aozora-reminder-hour'

export type ReminderSupport = 'supported' | 'needs-home-screen' | 'unsupported'

/** iPhone and iPad only deliver web push to a site added to the home screen. */
export function reminderSupport(): ReminderSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported'
  // iPadOS reports itself as a Mac with touch; Android never needs the home-screen step.
  const iOS = !/Android/.test(navigator.userAgent) && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
  if (iOS && !standalone) return 'needs-home-screen'
  return 'PushManager' in window && 'Notification' in window ? 'supported' : 'unsupported'
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
}

async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

function base64UrlToBytes(value: string) {
  const padded = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
}

async function post(path: string, body: unknown) {
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error || '通知を設定できませんでした。')
  }
}

export async function reminderStatus(): Promise<{ enabled: boolean; hour: number | null }> {
  const subscription = await currentSubscription().catch(() => null)
  const stored = Number(localStorage.getItem(HOUR_KEY))
  return { enabled: Boolean(subscription), hour: subscription && Number.isInteger(stored) && localStorage.getItem(HOUR_KEY) !== null ? stored : null }
}

export async function enableReminder(hour: number, readToday: boolean) {
  if (Notification.permission === 'denied') throw new Error('ブラウザの設定で通知が拒否されています。サイトの通知を許可してから、もう一度お試しください。')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('通知が許可されませんでした。')
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const { publicKey } = await fetch('/api/push/key').then(response => {
    if (!response.ok) throw new Error('通知は準備中です。')
    return response.json() as Promise<{ publicKey: string }>
  })
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) })
  await post('/api/push/subscribe', { subscription: subscription.toJSON(), hour, readToday })
  localStorage.setItem(HOUR_KEY, String(hour))
}

export async function disableReminder() {
  const subscription = await currentSubscription()
  if (subscription) {
    await post('/api/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined)
    await subscription.unsubscribe()
  }
  localStorage.removeItem(HOUR_KEY)
}

/** Tells the reminder job that today's page is read, so tonight's reminder is skipped. */
export async function markReadForReminder() {
  const subscription = await currentSubscription().catch(() => null)
  if (subscription) await post('/api/push/read', { endpoint: subscription.endpoint, date: japanDate() }).catch(() => undefined)
}

export function currentJapanHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
}
