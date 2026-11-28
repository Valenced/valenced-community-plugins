import http from 'node:http'

const PORT = Number(process.env.PORT || 8787)
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const BRIDGE_SECRET = process.env.COPY_EMOJI_SECRET

if (!BOT_TOKEN || !BRIDGE_SECRET) {
  throw new Error('Set DISCORD_BOT_TOKEN and COPY_EMOJI_SECRET before starting the bridge.')
}

const API = 'https://discord.com/api/v10'
const CDN = 'https://cdn.discordapp.com/emojis/'

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function safeName(value) {
  return String(value || '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32) || 'emoji'
}

async function discord(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      authorization: `Bot ${BOT_TOKEN}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || `Discord API HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return data
}

async function getImage(id, animated) {
  // Preserve the original CDN asset bytes; no resizing, recompression, or redraw.
  const extensions = animated ? ['gif'] : ['png', 'webp']
  let lastError
  for (const ext of extensions) {
    const response = await fetch(`${CDN}${id}.${ext}?quality=lossless`)
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer())
      const mime = response.headers.get('content-type') || (ext === 'gif' ? 'image/gif' : 'image/png')
      return `data:${mime};base64,${bytes.toString('base64')}`
    }
    lastError = new Error(`Could not fetch source emoji ${id} (${response.status})`)
  }
  throw lastError
}

async function handle(req, res) {
  if (req.method !== 'POST' || req.url !== '/copy-emojis') return json(res, 404, { error: 'Not found' })
  if (req.headers.authorization !== `Bearer ${BRIDGE_SECRET}`) return json(res, 401, { error: 'Unauthorized bridge request' })

  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 1_000_000) return json(res, 413, { error: 'Request too large' })
  }

  let body
  try { body = JSON.parse(raw) } catch { return json(res, 400, { error: 'Invalid JSON body' }) }

  const guildId = String(body.guildId || '')
  const emojis = Array.isArray(body.emojis) ? body.emojis : []
  if (!/^\d{17,20}$/.test(guildId)) return json(res, 400, { error: 'Invalid target server ID' })
  if (!emojis.length || emojis.length > 50) return json(res, 400, { error: 'Provide between 1 and 50 emojis' })

  try {
    const existing = await discord(`/guilds/${guildId}/emojis`)
    const existingIds = new Set(existing.map(item => item.id))
    const created = [], skipped = [], failed = []

    for (const item of emojis) {
      const id = String(item.id || '')
      const name = safeName(item.name)
      if (!/^\d{17,20}$/.test(id)) {
        failed.push({ id, name, reason: 'Invalid emoji ID' })
        continue
      }
      if (existingIds.has(id)) {
        skipped.push({ id, name, reason: 'Already present (Discord emoji IDs are globally unique)' })
        continue
      }

      try {
        const image = await getImage(id, Boolean(item.animated))
        const uploaded = await discord(`/guilds/${guildId}/emojis`, {
          method: 'POST',
          body: JSON.stringify({ name, image }),
        })
        existingIds.add(uploaded.id)
        created.push({ id: uploaded.id, name: uploaded.name, animated: Boolean(uploaded.animated) })
      } catch (error) {
        failed.push({ id, name, reason: error.message })
      }
    }

    return json(res, 200, { created, skipped, failed })
  } catch (error) {
    return json(res, error.status || 500, { error: error.message })
  }
}

http.createServer((req, res) => {
  handle(req, res).catch(error => json(res, 500, { error: error.message }))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Copy Emoji bridge listening on 127.0.0.1:${PORT}`)
})
