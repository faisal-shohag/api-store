import { Hono } from 'hono'
import type { AppEnv } from '../env'
import {
  datasets,
  getParsed,
  indexBody,
  indexEtag,
  matchesFilter,
  namespaceChildren,
  resolveDataset,
  topLevelNames,
} from '../lib/datasets'
import { HTML_TYPE, notFound, send, wantsHtml } from '../lib/http'
import { namespaceIndex } from '../lib/namespace'
import { edgeCache } from '../middleware/edge-cache'
import { apiRateLimit } from '../middleware/rate-limit'
import { renderApiIndexPage } from '../views/endpoints'

export const api = new Hono<AppEnv>()

// Fixed-window quota per client IP on the dynamic API. Static files under
// /data/* are served by Cloudflare Assets and never reach this router.
api.use('*', apiRateLimit)
api.use('*', edgeCache)

api.get('/', (c) => {
  // Browsers get a clickable directory; API clients keep the plain string array.
  if (wantsHtml(c)) {
    const entries = topLevelNames().map((name) => ({ name, isNamespace: namespaceChildren(name).length > 0 }))
    const html = renderApiIndexPage(entries)
    return send(c, `${indexEtag}-html`, () => html, HTML_TYPE)
  }
  return send(c, indexEtag, () => indexBody)
})

// Any query param filters by that field, e.g. /api/bazardor/products?category=chal
api.get('/*', (c) => {
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
    return JSON.stringify(items.filter((item) => filters.every(([k, v]) => matchesFilter(item[k], v))))
  })
})
