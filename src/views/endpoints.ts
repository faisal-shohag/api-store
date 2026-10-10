import { getParsed } from '../lib/datasets'

const STYLE =
  `body{background:#0b0b12;color:#f2f2f5;font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:0 auto;padding:32px 20px}` +
  `h1{font-size:28px}h2{font-size:17px;margin:30px 0 10px}` +
  `a.ep{display:block;background:#171726;border:1px solid #2c2c44;border-radius:8px;padding:13px 16px;color:#d9d9e6;text-decoration:none;overflow-wrap:anywhere}` +
  `a.ep:hover{border-color:#5a5aa0}a{color:#8ab4ff}` +
  `code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px}` +
  `table{width:100%;border-collapse:collapse;margin-top:40px;font-size:14px}` +
  `th,td{border:1px solid #2c2c44;padding:10px 12px;text-align:left;vertical-align:top}` +
  `th{background:#171726}.back{margin-top:28px;display:inline-block}`

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const singular = (s: string) =>
  capitalize(s.endsWith('ies') ? s.slice(0, -3) + 'y' : s.endsWith('s') ? s.slice(0, -1) : s)

const section = (title: string, url: string) =>
  `<h2>${title}:</h2>\n<a class="ep" href="${url}"><code>${url}</code></a>\n`

const row = (url: string, description: string) =>
  `<tr><td><code>GET</code></td><td><a href="${url}"><code>${url}</code></a></td><td>${description}</td></tr>\n`

// Sectioned endpoint page for a namespace (All Products / Filter / Single
// Product / …) plus a table of every endpoint. Filter sections appear where a
// `category` field exists; any other field works as ?field=value too.
export function renderNamespacePage(prefix: string, names: string[], shown: string): string {
  let sections = ''
  let tableRows = ''
  for (const name of names) {
    const short = name.slice(prefix.length + 1)
    const { items, byId } = getParsed(name)
    const title = capitalize(short)
    const one = singular(short)
    const firstId = byId.keys().next().value ?? ''
    const base = `/api/${name}`
    const itemUrl = firstId ? `${base}/${firstId}` : base
    const first = items[0]
    const cat = first && typeof first.category === 'string' ? first.category : undefined

    sections += section(`All ${title}`, base)
    tableRows += row(base, `All ${short} (${items.length} items)`)
    if (cat !== undefined) {
      const filterUrl = `${base}?category=${encodeURIComponent(cat)}`
      sections += section('Filter', filterUrl)
      tableRows += row(filterUrl, `Filter ${short} by category (any field works)`)
    }
    sections += section(`Single ${one}`, itemUrl)
    tableRows += row(itemUrl, `Single ${one.charAt(0).toLowerCase() + one.slice(1)} by id`)
  }
  const up = prefix.includes('/') ? `/api/${prefix.slice(0, prefix.lastIndexOf('/'))}` : '/api'
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Endpoints: ${shown}</title><style>${STYLE}</style></head><body>` +
    `<p>Endpoints:</p><h1>${shown}</h1>\n${sections}` +
    `<h2>All endpoints:</h2>\n<table><thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead><tbody>\n${tableRows}</tbody></table>` +
    `<a class="back" href="${up}">← ${up}</a></body></html>`
  )
}

// Plain directory of top-level datasets and namespaces for /api in a browser.
export function renderApiIndexPage(entries: { name: string; isNamespace: boolean }[]): string {
  const rows = entries
    .map(({ name, isNamespace }) => `<li><a href="/api/${name}">${name}${isNamespace ? '/' : ''}</a></li>`)
    .join('\n')
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>/api</title></head><body><h1><code>/api</code></h1><ul>\n${rows}\n</ul></body></html>`
  )
}
