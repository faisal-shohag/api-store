# api-store

Read-only JSON API on Cloudflare Workers ([Hono](https://hono.dev)). Every
`src/data/**/*.json` file becomes a dataset; nested folders become namespaces.

## Endpoints

| Path | Description |
| --- | --- |
| `GET /api` | List of dataset names (HTML directory in a browser) |
| `GET /api/<namespace>` | Endpoint index for a namespace, e.g. `/api/bazardor` |
| `GET /api/<dataset>` | All items, e.g. `/api/bazardor/products` |
| `GET /api/<dataset>?field=value` | Filter by any field (case-insensitive, matches inside arrays) |
| `GET /api/<dataset>/<id>` | Single item |
| `GET /data/<dataset>.json` | Static copy of the full list (served by Cloudflare Assets, no Worker CPU) |
| `GET /data/<dataset>/<id>.json` | Static copy of a single item |

`/api/*` is rate-limited per client IP (`RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS`).

## Project layout

```
scripts/gen-data.mjs   build step: validates data, emits src/generated + public/data
src/
  index.ts             app entry: CORS, route mounting, 404
  env.ts               Worker bindings type
  routes/              api.ts (/api/*), aliases.ts (/bazardor)
  middleware/          rate-limit.ts, edge-cache.ts
  lib/                 datasets.ts (lookup/filter), http.ts (ETag/caching), namespace.ts
  views/               HTML endpoint pages
  data/                source datasets (edit these)
  generated/           build output, git-ignored
```

## Adding data

Drop a JSON array into `src/data/` (or a subfolder). Every item needs a unique
`id` made of letters, numbers, `-` or `_`. The build regenerates everything.

## Scripts

```sh
npm run dev           # local server
npm run typecheck     # regenerate data + tsc
npm run deploy        # deploy to the old and new accounts
npm run deploy:third  # deploy to the third account
```
