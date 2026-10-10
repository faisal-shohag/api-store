import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { namespaceChildren } from '../lib/datasets'
import { namespaceIndex } from '../lib/namespace'
import { apiRateLimit } from '../middleware/rate-limit'

export const aliases = new Hono<AppEnv>()

// Friendly alias: /bazardor shows the same endpoint directory as /api/bazardor
// (JSON for API clients, clickable links for browsers).
for (const path of ['/bazardor', '/bazardor/']) {
  aliases.use(path, apiRateLimit)
  aliases.get(path, (c) => namespaceIndex(c, 'bazardor', namespaceChildren('bazardor'), '/bazardor'))
}
