import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './env'
import { notFound } from './lib/http'
import { aliases } from './routes/aliases'
import { api } from './routes/api'

const app = new Hono<AppEnv>()

app.use('*', cors({ origin: '*', maxAge: 86400 }))

app.route('/api', api)
app.route('/', aliases)

app.notFound(() => notFound())

export default app
