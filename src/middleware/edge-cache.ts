import type { MiddlewareHandler } from 'hono'
import { indexEtag } from '../lib/datasets'
import { etagMatches, notModified, wantsHtml } from '../lib/http'

// Edge cache (Workers Cache API). Worker responses skip Cloudflare's CDN cache,
// so 200s are stored explicitly. Key carries the data hash (busts on deploy)
// and Accept variant, since the Cache API ignores Vary.
export const edgeCache: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' || typeof caches === 'undefined') return next()
  const url = new URL(c.req.url)
  url.searchParams.sort()
  // Variant lives in the path, not a query param, so clients cannot forge another URL's key.
  url.pathname = `/__cache/${indexEtag}/${wantsHtml(c) ? 'html' : 'json'}${url.pathname}`
  const key = new Request(url.toString())

  const hit = await caches.default.match(key)
  if (hit) {
    const etag = hit.headers.get('ETag')
    c.res = etag && etagMatches(c.req.header('If-None-Match'), etag) ? notModified(etag) : new Response(hit.body, hit)
    return
  }

  await next()
  if (c.res.status === 200) c.executionCtx.waitUntil(caches.default.put(key, c.res.clone()))
}
