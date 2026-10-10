import { datasets } from '../generated/datasets'

export { datasets }

export type Item = Record<string, unknown>

export interface ParsedDataset {
  items: Item[]
  // id -> pre-serialized item JSON
  byId: Map<string, string>
}

// Bodies are pre-minified strings from the build. Parsing happens only for
// filter / id / index requests, once per dataset per isolate.
const parsed = new Map<string, ParsedDataset>()

export function getParsed(name: string): ParsedDataset {
  let p = parsed.get(name)
  if (!p) {
    const items: Item[] = JSON.parse(datasets[name].body)
    p = { items, byId: new Map(items.map((item) => [String(item.id), JSON.stringify(item)])) }
    parsed.set(name, p)
  }
  return p
}

export const indexBody = JSON.stringify(Object.keys(datasets))

// Combined hash of every dataset; changes whenever any data changes.
export const indexEtag = Object.values(datasets)
  .map((d) => d.etag)
  .join('')
  .slice(0, 32)

// Nested datasets live in subdirectories, e.g. src/data/bazardor/products.json
// is served as /api/bazardor/products.
export function resolveDataset(path: string): { name: string; id?: string } | undefined {
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
export function namespaceChildren(prefix: string): string[] {
  const pre = `${prefix}/`
  return Object.keys(datasets)
    .filter((n) => n.startsWith(pre))
    .sort()
}

// First path segment of every dataset, deduplicated: ["bazardor", "fitlog", "products"].
export function topLevelNames(): string[] {
  const names = Object.keys(datasets).sort()
  return [...new Set(names.map((n) => (n.includes('/') ? n.slice(0, n.indexOf('/')) : n)))].sort()
}

// Field matches when it equals the value, or when it is an array containing the value (case-insensitive).
export function matchesFilter(field: unknown, value: string): boolean {
  if (Array.isArray(field)) return field.some((v) => String(v).toLowerCase() === value)
  return field !== undefined && field !== null && String(field).toLowerCase() === value
}

const isScalar = (v: unknown): v is string | number => typeof v === 'string' || typeof v === 'number'

// Fields usable as ?field=value filters: scalars and arrays of scalars.
export function filterableFields(item: Item): string[] {
  return Object.entries(item)
    .filter(([, v]) => isScalar(v) || (Array.isArray(v) && v.every(isScalar)))
    .map(([k]) => k)
}

// First scalar field other than the id, as a sample filter.
export function sampleFilter(item: Item): [string, string] | undefined {
  for (const [k, v] of Object.entries(item)) {
    if (k !== 'id' && isScalar(v)) return [k, String(v)]
  }
  return undefined
}
