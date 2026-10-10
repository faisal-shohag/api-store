import type { RateLimitEnv } from './middleware/rate-limit'

// Worker bindings (wrangler.jsonc "vars"). Extend here when adding KV, D1, etc.
export type Bindings = RateLimitEnv

export type AppEnv = { Bindings: Bindings }
