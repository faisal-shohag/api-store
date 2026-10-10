import type { Context } from 'hono'

export const CACHE_OK = 'public, s-maxage=31536000, max-age=31536000, immutable'
export const CACHE_ERROR = 'public, max-age=60'
export const JSON_TYPE = 'application/json; charset=utf-8'
export const HTML_TYPE = 'text/html; charset=utf-8'

export function wantsHtml(c: Context): boolean {
  return (c.req.header('Accept') ?? '').includes('text/html')
}

// True when an If-None-Match header lists the given quoted ETag (weak or strong).
export function etagMatches(ifNoneMatch: string | undefined, quoted: string): boolean {
  return ifNoneMatch?.split(',').some((t) => t.trim().replace(/^W\//, '') === quoted) ?? false
}

export function notModified(quotedEtag: string): Response {
  return new Response(null, {
    status: 304,
    headers: { ETag: quotedEtag, 'Cache-Control': CACHE_OK, Vary: 'Accept' },
  })
}

// ETags come from the build-time content hash, so no per-request hashing.
// The body is lazy so a 304 never pays for serialization.
export function send(c: Context, etag: string, body: () => string, contentType = JSON_TYPE): Response {
  const quoted = `"${etag}"`
  if (etagMatches(c.req.header('If-None-Match'), quoted)) return notModified(quoted)
  return new Response(body(), {
    headers: { 'Content-Type': contentType, ETag: quoted, 'Cache-Control': CACHE_OK, Vary: 'Accept' },
  })
}

export function notFound(): Response {
  return new Response('{"error":"Not found"}', {
    status: 404,
    headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': CACHE_ERROR },
  })
}
