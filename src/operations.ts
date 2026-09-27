export type EventName = 'page_view' | 'read_start' | 'search' | 'learning_open' | 'review_complete' | 'page_complete' | 'quiz_done'
export type AnalyticsDetails = { workID?: string; label?: string; value?: number; path?: string }
export type FeedbackCategory = 'bug' | 'suggestion' | 'content' | 'other'
export type FeedbackStatus = 'open' | 'reviewing' | 'resolved' | 'closed'
export type FeedbackItem = {
  id: string; category: FeedbackCategory; message: string; contact?: string | null; pagePath: string
  status: FeedbackStatus; createdAt: number; displayName?: string | null
}
export type Retention = { cohortDay1?: number; returnedDay1?: number; cohortDay7?: number; returnedDay7?: number }
export type AdminOverview = {
  generatedAt: number
  dailyReading?: Array<{ date: string; pages: number; readers: number }>
  retention?: { visitors: Retention; readers: Retention }
  metrics: { totalUsers?: number; activeReaders7d?: number; readStarts7d?: number; openFeedback?: number }
  daily: Array<{ date: string; readers: number; readStarts: number }>
  topWorks: Array<{ workID: string; title: string; count: number }>
  events: Array<{ eventName: string; count: number }>
  feedback: FeedbackItem[]
  users: Array<{ id: string; displayName: string; createdAt: number; lastActiveAt?: number | null; eventCount: number; hasCloudState: number }>
}

// A random id kept on this device so return visits can be counted; no personal data, hashed on the server.
const visitorID = (() => {
  const key = 'aozora-visitor'
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(key, created)
    return created
  } catch { return crypto.randomUUID() }
})()

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error || '通信に失敗しました。')
  return data
}

export function getVisitorID() { return visitorID }

export function trackEvent(eventName: EventName, details: AnalyticsDetails = {}) {
  if (navigator.doNotTrack === '1') return
  const payload = {
    eventID: crypto.randomUUID(), visitorID, eventName,
    path: details.path || window.location.pathname,
    workID: details.workID, label: details.label, value: details.value,
  }
  void fetch('/api/analytics', {
    method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }).catch(() => undefined)
}

export function submitFeedback(input: { category: FeedbackCategory; message: string; contact?: string; pagePath: string; website?: string }) {
  return api<{ submitted: true; id: string }>('/api/feedback', {
    method: 'POST', body: JSON.stringify({ ...input, visitorID }),
  })
}

export function loadAdminOverview() {
  return api<AdminOverview>('/api/admin/overview')
}

export function setFeedbackStatus(id: string, status: FeedbackStatus) {
  return api<{ updated: true }>(`/api/admin/feedback/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  })
}

export async function loadDailyStats() {
  const response = await fetch('/api/daily/stats')
  if (!response.ok) throw new Error('stats unavailable')
  return response.json() as Promise<{ readersToday: number }>
}
