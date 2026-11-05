const API = 'https://www.virustotal.com/api/v3'
const GUI = 'https://www.virustotal.com/gui/url'

export type Category = 'malicious' | 'suspicious' | 'harmless' | 'undetected' | 'timeout'

export interface Stats {
    malicious: number
    suspicious: number
    harmless: number
    undetected: number
    timeout: number
}

export interface EngineResult {
    name: string
    category: Category
    result: string | null
}

export type ScanResult =
    | {
          kind: 'report'
          stats: Stats
          flagged: number
          total: number
          reportUrl: string
          engines: EngineResult[]
      }
    | { kind: 'submitted'; reportUrl: string }
    | {
          kind: 'error'
          code: 'NO_KEY' | 'BAD_URL' | 'BAD_KEY' | 'RATE_LIMIT' | 'NETWORK' | 'HTTP'
          message: string
      }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function urlId(url: string): string {
    const s = unescape(encodeURIComponent(url))
    let out = ''
    for (let i = 0; i < s.length; i += 3) {
        const a = s.charCodeAt(i)
        const b = i + 1 < s.length ? s.charCodeAt(i + 1) : 0
        const c = i + 2 < s.length ? s.charCodeAt(i + 2) : 0
        const n = (a << 16) | (b << 8) | c
        out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
        if (i + 1 < s.length) out += B64[(n >> 6) & 63]
        if (i + 2 < s.length) out += B64[n & 63]
    }
    return out
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0)

function parseStats(json: any): Stats | null {
    const s = json?.data?.attributes?.last_analysis_stats
    if (!s || typeof s !== 'object') return null
    return {
        malicious: num(s.malicious),
        suspicious: num(s.suspicious),
        harmless: num(s.harmless),
        undetected: num(s.undetected),
        timeout: num(s.timeout),
    }
}

const SEV: Record<Category, number> = {
    malicious: 0,
    suspicious: 1,
    timeout: 2,
    undetected: 3,
    harmless: 4,
}

function parseEngines(json: any): EngineResult[] {
    const r = json?.data?.attributes?.last_analysis_results
    if (!r || typeof r !== 'object') return []
    const out: EngineResult[] = []
    for (const name of Object.keys(r)) {
        const e = r[name]
        const cat = (e?.category ?? 'undetected') as Category
        if (cat !== 'malicious' && cat !== 'suspicious') continue
        out.push({
            name,
            category: cat,
            result: typeof e?.result === 'string' && e.result ? e.result : null,
        })
    }
    out.sort((a, b) => SEV[a.category] - SEV[b.category] || a.name.localeCompare(b.name))
    return out
}

function vt(path: string, key: string, init: RequestInit = {}) {
    return fetch(`${API}${path}`, {
        ...init,
        headers: { accept: 'application/json', ...(init.headers as any), 'x-apikey': key },
    })
}

function httpError(status: number): ScanResult {
    if (status === 401 || status === 403)
        return { kind: 'error', code: 'BAD_KEY', message: 'VirusTotal rejected the API key.' }
    if (status === 429)
        return { kind: 'error', code: 'RATE_LIMIT', message: 'VirusTotal rate limit reached.' }
    return { kind: 'error', code: 'HTTP', message: `VirusTotal returned HTTP ${status}.` }
}

export async function scanUrl(rawUrl: string, apiKey: string | undefined | null): Promise<ScanResult> {
    const key = (apiKey ?? '').trim()
    if (!key) return { kind: 'error', code: 'NO_KEY', message: 'No API key configured.' }

    const url = (rawUrl ?? '').trim()
    if (!/^https?:\/\/[^\s]+$/i.test(url))
        return { kind: 'error', code: 'BAD_URL', message: 'Not a valid http(s) link.' }

    const id = urlId(url)
    const reportUrl = `${GUI}/${id}`

    try {
        const res = await vt(`/urls/${id}`, key)

        if (res.status === 404) {
            const post = await vt('/urls', key, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: `url=${encodeURIComponent(url)}`,
            })
            return post.ok ? { kind: 'submitted', reportUrl } : httpError(post.status)
        }
        if (!res.ok) return httpError(res.status)

        const json = await res.json()
        const stats = parseStats(json)
        if (!stats) return { kind: 'submitted', reportUrl }

        const total =
            stats.malicious + stats.suspicious + stats.harmless + stats.undetected + stats.timeout
        if (total === 0) return { kind: 'submitted', reportUrl }

        return {
            kind: 'report',
            stats,
            flagged: stats.malicious + stats.suspicious,
            total,
            reportUrl,
            engines: parseEngines(json),
        }
    } catch {
        return { kind: 'error', code: 'NETWORK', message: 'Network error while contacting VirusTotal.' }
    }
}
