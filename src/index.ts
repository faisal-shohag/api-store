import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { datasets } from './generated/datasets'
import { apiRateLimit, type RateLimitEnv } from './rate-limit'

type Item = Record<string, unknown>

interface Parsed {
  items: Item[]
  byId: Map<string, string>
}

const CACHE_OK = 'public, s-maxage=31536000, max-age=31536000, immutable'
const CACHE_ERROR = 'public, max-age=60'
const JSON_TYPE = 'application/json; charset=utf-8'
const HTML_TYPE = 'text/html; charset=utf-8'

// Bodies are pre-minified strings from the build. Parsing happens only for
// filter / id requests, once per dataset per isolate.
const parsed = new Map<
string, Parsed>()

function getParsed(name: string): Parsed {
  let p = parsed.get(name)
  if (!p) {
    const items: Item[] = JSON.parse(datasets[name].body)
    p = { items, byId: new Map(items.map((item) => [String(item.id), JSON.stringify(item)])) }
    parsed.set(name, p)
  }
  return p
}

// Field matches when it equals the value, or when it is an array containing the value (case-insensitive).
function matches(field: unknown, value: string): boolean {
  if (Array.isArray(field)) return field.some((v) => String(v).toLowerCase() === value)
  return field !== undefined && field !== null && String(field).toLowerCase() === value
}

// ETags come from the build-time content hash, so no per-request hashing.
function send(c: Context, etag: string, body: () => string, contentType = JSON_TYPE): Response {
  const quoted = `"${etag}"`
  const ifNoneMatch = c.req.header('If-None-Match')
  if (ifNoneMatch?.split(',').some((t) => t.trim().replace(/^W\//, '') === quoted)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: quoted, 'Cache-Control': CACHE_OK, Vary: 'Accept' },
    })
  }
  return new Response(body(), {
    headers: { 'Content-Type': contentType, ETag: quoted, 'Cache-Control': CACHE_OK, Vary: 'Accept' },
  })
}

const notFound = () =>
  new Response('{"error":"Not found"}', {
    status: 404,
    headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': CACHE_ERROR },
  })

const indexBody = JSON.stringify(Object.keys(datasets))
const indexEtag = Object.values(datasets).map((d) => d.etag).join('').slice(0, 32)

// Nested datasets live in subdirectories, e.g. src/data/bazardor/products.json
// is served as /api/bazardor/products.
function resolveDataset(path: string): { name: string; id?: string } | undefined {
  if (datasets[path]) return { name: path }
  // Item ids can never contain "/" (enforced at build time), so the last
  // segment is unambiguous: /api/<dataset>/<id>.
  const slash = path.lastIndexOf('/')
  if (slash > 0) {
    const name = path.slice(0, slash)
    const id = path.slice(slash + 1)
    if (id && datasets[name]) return { name, id }
  }
  return undefined
}

// Datasets grouped under a namespace prefix, e.g. "bazardor" -> ["bazardor/categories", ...].
function namespaceChildren(prefix: string): string[] {
  const pre = `${prefix}/`
  return Object.keys(datasets)
    .filter((n) => n.startsWith(pre))
    .sort()
}

function wantsHtml(c: Context): boolean {
  return (c.req.header('Accept') ?? '').includes('text/html')
}

// Directory listing for a namespace: JSON links for API clients, clickable
// links for browsers. Also used for the /api root in HTML form.
function namespaceIndex(c: Context, prefix: string, names: string[], displayPath?: string): Response {
  const etag = `ns-${names.map((n) => datasets[n].etag).join('').slice(0, 24)}`
  const shown = displayPath ?? `/api/${prefix}`

  if (wantsHtml(c)) {
    // Sectioned layout (All Products / Filter / Single Product / …) plus a
    // table of every endpoint. Filter sections appear where a `category`
    // field exists; any other field works as ?field=value too.
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
    const singular = (s: string) =>
      cap(s.endsWith('ies') ? s.slice(0, -3) + 'y' : s.endsWith('s') ? s.slice(0, -1) : s)
    let sections = ''
    let tableRows = ''
    for (const name of names) {
      const short = name.slice(prefix.length + 1)
      const g = getParsed(name)
      const title = cap(short)
      const one = singular(short)
      const firstId = g.byId.keys().next().value ?? ''
      const base = `/api/${name}`
      const itemUrl = firstId ? `${base}/${firstId}` : base
      const first = g.items[0]
      const cat =
        first && typeof first.category === 'string' ? String(first.category) : undefined

      sections += `<h2>All ${title}:</h2>\n<a class="ep" href="${base}"><code>${base}</code></a>\n`
      tableRows += `<tr><td><code>GET</code></td><td><a href="${base}"><code>${base}</code></a></td><td>All ${short} (${g.items.length} items)</td></tr>\n`
      if (cat !== undefined) {
        const filterUrl = `${base}?category=${encodeURIComponent(cat)}`
        sections += `<h2>Filter:</h2>\n<a class="ep" href="${filterUrl}"><code>${filterUrl}</code></a>\n`
        tableRows += `<tr><td><code>GET</code></td><td><a href="${filterUrl}"><code>${filterUrl}</code></a></td><td>Filter ${short} by category (any field works)</td></tr>\n`
      }
      sections += `<h2>Single ${one}:</h2>\n<a class="ep" href="${itemUrl}"><code>${itemUrl}</code></a>\n`
      tableRows += `<tr><td><code>GET</code></td><td><a href="${itemUrl}"><code>${itemUrl}</code></a></td><td>Single ${one.charAt(0).toLowerCase() + one.slice(1)} by id</td></tr>\n`
    }
    const up = prefix.includes('/') ? `/api/${prefix.slice(0, prefix.lastIndexOf('/'))}` : '/api'
    const html =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>Endpoints: ${shown}</title><style>` +
      `body{background:#0b0b12;color:#f2f2f5;font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:0 auto;padding:32px 20px}` +
      `h1{font-size:28px}h2{font-size:17px;margin:30px 0 10px}` +
      `a.ep{display:block;background:#171726;border:1px solid #2c2c44;border-radius:8px;padding:13px 16px;color:#d9d9e6;text-decoration:none;overflow-wrap:anywhere}` +
      `a.ep:hover{border-color:#5a5aa0}a{color:#8ab4ff}` +
      `code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px}` +
      `table{width:100%;border-collapse:collapse;margin-top:40px;font-size:14px}` +
      `th,td{border:1px solid #2c2c44;padding:10px 12px;text-align:left;vertical-align:top}` +
      `th{background:#171726}.back{margin-top:28px;display:inline-block}` +
      `</style></head><body>` +
      `<p>Endpoints:</p><h1>${shown}</h1>\n${sections}` +
      `<h2>All endpoints:</h2>\n<table><thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead><tbody>\n${tableRows}</tbody></table>` +
      `<a class="back" href="${up}">← ${up}</a></body></html>`
    return send(c, `${etag}-html`, () => html, HTML_TYPE)
  }

  const origin = new URL(c.req.url).origin
  const sets: Record<string, unknown> = {}
  for (const name of names) {
    const entry: Record<string, unknown> = {
      list: `${origin}/api/${name}`,
      count: getParsed(name).items.length,
    }
    const firstId = getParsed(name).byId.keys().next().value
    if (firstId !== undefined) entry.item = `${origin}/api/${name}/${firstId}`
    // Point at a real filterable scalar field of the first item (skipping the id).
    const first = getParsed(name).items[0]
    if (first) {
      for (const [k, v] of Object.entries(first)) {
        if (k !== 'id' && (typeof v === 'string' || typeof v === 'number')) {
          entry.filterExample = `${origin}/api/${name}?${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
          break
        }
      }
      // Every listed field can be used as a ?field=value filter.
      entry.filterableFields = Object.entries(first)
        .filter(
          ([, v]) =>
            typeof v === 'string' ||
            typeof v === 'number' ||
            (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')),
        )
        .map(([k]) => k)
    }
    sets[name.slice(prefix.length + 1)] = entry
  }
  return send(c, etag, () => JSON.stringify({ namespace: prefix, datasets: sets }))
}

const app = new Hono<{ Bindings: RateLimitEnv }>()

app.use('*', cors({ origin: '*', maxAge: 86400 }))

// Fixed-window quota per client IP on the dynamic API. Static files under
// /data/* are served by Cloudflare Assets and never reach this middleware.
app.use('/api/*', apiRateLimit)

// Edge cache (Workers Cache API). Worker responses skip Cloudflare's CDN cache,
// so 200s are stored explicitly. Key carries the data hash (busts on deploy)
// and Accept variant, since the Cache API ignores Vary.
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' || typeof caches === 'undefined') return next()
  const url = new URL(c.req.url)
  url.searchParams.sort()
  // Variant lives in the path, not a query param, so clients cannot forge another URL's key.
  url.pathname = `/__cache/${indexEtag}/${wantsHtml(c) ? 'html' : 'json'}${url.pathname}`
  const key = new Request(url.toString())

  const hit = await caches.default.match(key)
  if (hit) {
    const etag = hit.headers.get('ETag')
    if (etag && c.req.header('If-None-Match')?.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
      c.res = new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': CACHE_OK, Vary: 'Accept' } })
      return
    }
    c.res = new Response(hit.body, hit)
    return
  }

  await next()
  if (c.res.status === 200) c.executionCtx.waitUntil(caches.default.put(key, c.res.clone()))
})

app.get('/api', (c) => {
  // Browsers get a clickable directory; API clients keep the plain string array.
  if (wantsHtml(c)) {
    const names = Object.keys(datasets).sort()
    const top = [...new Set(names.map((n) => (n.includes('/') ? n.slice(0, n.indexOf('/')) : n)))].sort()
    const rows = top
      .map((t) =>
        namespaceChildren(t).length > 0 ? `<li><a href="/api/${t}">${t}/</a></li>` : `<li><a href="/api/${t}">${t}</a></li>`,
      )
      .join('\n')
    const html =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<title>/api</title></head><body><h1><code>/api</code></h1><ul>\n${rows}\n</ul></body></html>`
    return send(c, `${indexEtag}-html`, () => html, HTML_TYPE)
  }
  return send(c, indexEtag, () => indexBody)
})

// Any query param filters by that field, e.g. /api/bazardor/products?category=chal
app.get('/api/*', (c) => {
  const path = c.req.path.replace(/^\/api\//, '').replace(/\/+$/, '')
  // A namespace prefix lists its endpoints instead of 404ing, e.g. /api/bazardor.
  const children = namespaceChildren(path)
  if (children.length > 0) return namespaceIndex(c, path, children)
  const found = resolveDataset(path)
  if (!found) return notFound()
  const ds = datasets[found.name]

  // Single item: /api/<dataset>/<id>, e.g. /api/bazardor/products/1
  if (found.id) {
    const body = getParsed(found.name).byId.get(found.id)
    return body ? send(c, `${ds.etag}-${found.id}`, () => body) : notFound()
  }

  const filters = Object.entries(c.req.query())
    .map(([k, v]) => [k, v.toLowerCase()] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  if (filters.length === 0) return send(c, ds.etag, () => ds.body)

  const etag = `${ds.etag}-${encodeURIComponent(JSON.stringify(filters))}`
  return send(c, etag, () => {
    const { items } = getParsed(found.name)
    return JSON.stringify(items.filter((item) => filters.every(([k, v]) => matches(item[k], v))))
  })
})

// Friendly alias: /bazardor shows the same endpoint directory as /api/bazardor
// (JSON for API clients, clickable links for browsers).
app.use('/bazardor', apiRateLimit)
app.use('/bazardor/', apiRateLimit)
for (const path of ['/bazardor', '/bazardor/']) {
  app.get(path, (c) => namespaceIndex(c, 'bazardor', namespaceChildren('bazardor'), '/bazardor'))
}

app.notFound(() => notFound())

export default app
