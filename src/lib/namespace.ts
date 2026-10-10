import type { Context } from 'hono'
import { renderNamespacePage } from '../views/endpoints'
import { datasets, filterableFields, getParsed, sampleFilter } from './datasets'
import { HTML_TYPE, send, wantsHtml } from './http'

// Directory listing for a namespace: JSON links for API clients, clickable
// links for browsers. `displayPath` overrides the heading for aliases.
export function namespaceIndex(c: Context, prefix: string, names: string[], displayPath?: string): Response {
  const etag = `ns-${names.map((n) => datasets[n].etag).join('').slice(0, 24)}`

  if (wantsHtml(c)) {
    const html = renderNamespacePage(prefix, names, displayPath ?? `/api/${prefix}`)
    return send(c, `${etag}-html`, () => html, HTML_TYPE)
  }

  const origin = new URL(c.req.url).origin
  const sets: Record<string, unknown> = {}
  for (const name of names) {
    const { items, byId } = getParsed(name)
    const entry: Record<string, unknown> = { list: `${origin}/api/${name}`, count: items.length }
    const firstId = byId.keys().next().value
    if (firstId !== undefined) entry.item = `${origin}/api/${name}/${firstId}`
    const first = items[0]
    if (first) {
      const sample = sampleFilter(first)
      if (sample) {
        const [field, value] = sample
        entry.filterExample = `${origin}/api/${name}?${encodeURIComponent(field)}=${encodeURIComponent(value)}`
      }
      entry.filterableFields = filterableFields(first)
    }
    sets[name.slice(prefix.length + 1)] = entry
  }
  return send(c, etag, () => JSON.stringify({ namespace: prefix, datasets: sets }))
}
