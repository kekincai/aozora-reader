// Service worker: shows the daily reminder and opens today's page when it is tapped.
// No offline caching; the site always reads fresh pages from the network.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = { title: '今日の一頁', body: 'つづきが待っています。', url: '/daily' }
  try { data = { ...data, ...event.data.json() } } catch { /* keep the default text */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'daily-page',
    renotify: false,
    data: { url: data.url || '/daily' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/daily', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(client => client.url.startsWith(self.location.origin))
    if (open) return open.navigate(url).then(client => client?.focus())
    return self.clients.openWindow(url)
  }))
})
