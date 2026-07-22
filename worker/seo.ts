import { getSeoWork, listSitemapWorks, type CatalogEnv, type SeoWork } from './catalog'

const SITE_NAME = '青空しおり'
const DEFAULT_DESCRIPTION = '青空文庫の公開作品を読みながら、N2・N1の語彙と文法を学べる日本語読書サイト。'
const INDEXABLE_STATIC_PATHS = new Set(['/', '/articles', '/learn'])

type PageSeo = {
  title: string
  description: string
  canonical: string
  robots: string
  type: 'website' | 'article'
  jsonLd: Record<string, unknown>
  preview?: string
  status?: number
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function cleanDescription(value: string, fallback = DEFAULT_DESCRIPTION) {
  const clean = value.replace(/\s+/g, ' ').trim()
  return (clean || fallback).slice(0, 155)
}

function staticSeo(url: URL): PageSeo {
  const pages: Record<string, [string, string, string]> = {
    '/': ['青空しおり — 読みながら学ぶ日本語', DEFAULT_DESCRIPTION, 'WebSite'],
    '/articles': ['作品を探す — 青空しおり', '青空文庫の公開作品を、題名・作者・JLPTレベル・長さから探せます。', 'CollectionPage'],
    '/learn': ['語彙と文法を学ぶ — 青空しおり', 'N2・N1の語彙と文法から、その表現が登場する青空文庫の作品を探して学べます。', 'LearningResource'],
    '/review': ['復習 — 青空しおり', '保存した語彙と文法を復習するページです。', 'WebPage'],
    '/record': ['読書記録 — 青空しおり', '自分の読書と学習の記録を確認するページです。', 'WebPage'],
    '/feedback': ['ご意見 — 青空しおり', '青空しおりへのご意見や不具合を送るページです。', 'WebPage'],
    '/admin': ['管理 — 青空しおり', '青空しおりの管理ページです。', 'WebPage'],
  }
  const page = pages[url.pathname]
  const title = page?.[0] || `${SITE_NAME} — ページが見つかりません`
  const description = page?.[1] || DEFAULT_DESCRIPTION
  const schemaType = page?.[2] || 'WebPage'
  return {
    title,
    description,
    canonical: `${url.origin}${url.pathname}`,
    robots: INDEXABLE_STATIC_PATHS.has(url.pathname) ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
    type: 'website',
    status: page ? 200 : 404,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': schemaType,
      name: title,
      description,
      url: `${url.origin}${url.pathname}`,
      inLanguage: 'ja',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${url.origin}/` },
    },
  }
}

function workSeo(url: URL, work: SeoWork | null): PageSeo {
  if (!work) {
    return {
      ...staticSeo(new URL('/missing', url.origin)),
      title: `作品が見つかりません — ${SITE_NAME}`,
      description: '指定された作品は見つかりませんでした。',
      canonical: `${url.origin}${url.pathname}`,
      status: 404,
    }
  }
  const canonical = `${url.origin}/read/${work.id}`
  const title = `${work.title}（${work.author}）— ${SITE_NAME}`
  const description = cleanDescription(work.summary || work.excerpt, `${work.author}「${work.title}」を読みながら、N2・N1の語彙と文法を学べます。`)
  const authors = work.author.split('・').map(name => ({ '@type': 'Person', name }))
  const bookID = `${canonical}#book`
  const previewParagraphs = work.excerpt.split('\n').filter(Boolean).slice(0, 4)
  return {
    title,
    description,
    canonical,
    robots: 'index, follow, max-image-preview:large',
    type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: title,
          description,
          url: canonical,
          inLanguage: 'ja',
          mainEntity: { '@id': bookID },
          isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${url.origin}/` },
        },
        {
          '@id': bookID,
          '@type': 'Book',
          name: work.title,
          author: authors,
          inLanguage: 'ja',
          url: canonical,
          isBasedOn: work.sourceUrl,
          genre: work.genre,
          educationalLevel: work.level,
          learningResourceType: 'Annotated reading',
        },
      ],
    },
    preview: `<article aria-label="作品の概要"><header><p>${escapeHtml(work.author)}</p><h1>${escapeHtml(work.title)}</h1></header>${previewParagraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}<p><a href="${escapeHtml(work.sourceUrl)}">青空文庫の作品カード</a></p></article>`,
  }
}

export function sitemapXml(origin: string, works: Array<{ id: string; updatedOn: string | null }>) {
  const entries = [
    { path: '/', updatedOn: null },
    { path: '/articles', updatedOn: null },
    { path: '/learn', updatedOn: null },
    ...works.map(work => ({ path: `/read/${work.id}`, updatedOn: work.updatedOn })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(entry => `  <url><loc>${escapeHtml(`${origin}${entry.path}`)}</loc>${entry.updatedOn ? `<lastmod>${escapeHtml(entry.updatedOn)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`
}

async function serveSitemap(request: Request, env: CatalogEnv, ctx: ExecutionContext) {
  const cache = caches.default
  const cacheKey = new Request(request.url, { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached
  const works = await listSitemapWorks(env)
  const xml = sitemapXml(new URL(request.url).origin, works)
  const response = new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
  ctx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}

function serveRobots(url: URL) {
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  })
}

function transformHtml(response: Response, seo: PageSeo) {
  const jsonLd = JSON.stringify(seo.jsonLd).replaceAll('<', '\\u003c')
  const transformed = new HTMLRewriter()
    .on('title', { element: element => element.setInnerContent(seo.title) })
    .on('meta[name="description"]', { element: element => element.setAttribute('content', seo.description) })
    .on('head', { element: element => element.append(
      `<meta name="robots" content="${escapeHtml(seo.robots)}">` +
      `<link rel="canonical" href="${escapeHtml(seo.canonical)}">` +
      `<meta property="og:site_name" content="${SITE_NAME}">` +
      `<meta property="og:type" content="${seo.type}">` +
      `<meta property="og:title" content="${escapeHtml(seo.title)}">` +
      `<meta property="og:description" content="${escapeHtml(seo.description)}">` +
      `<meta property="og:url" content="${escapeHtml(seo.canonical)}">` +
      `<meta name="twitter:card" content="summary">` +
      `<script type="application/ld+json">${jsonLd}</script>`,
      { html: true },
    ) })
  if (seo.preview) transformed.on('#root', { element: element => element.setInnerContent(seo.preview!, { html: true }) })
  const result = transformed.transform(response)
  const headers = new Headers(result.headers)
  headers.set('cache-control', seo.robots.startsWith('index') ? 'public, max-age=300, s-maxage=3600' : 'no-store')
  headers.set('x-robots-tag', seo.robots)
  return new Response(result.body, { status: seo.status || result.status, headers })
}

export async function handleSeoRequest(request: Request, env: CatalogEnv & { ASSETS: Fetcher }, ctx: ExecutionContext) {
  const url = new URL(request.url)
  if (url.pathname === '/robots.txt') return serveRobots(url)
  if (url.pathname === '/sitemap.xml') return serveSitemap(request, env, ctx)
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 })
  const readMatch = url.pathname.match(/^\/read\/(\d{1,6})$/)
  const seo = readMatch ? workSeo(url, await getSeoWork(env, readMatch[1])) : staticSeo(url)
  // Always transform the canonical app shell. Fetching the requested SPA path can
  // reuse an older route-specific fallback from the static asset cache.
  const shellRequest = new Request(new URL('/index.html', url.origin), request)
  const assetResponse = await env.ASSETS.fetch(shellRequest)
  if (!assetResponse.headers.get('content-type')?.includes('text/html')) return assetResponse
  return transformHtml(assetResponse, seo)
}
