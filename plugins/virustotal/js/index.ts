import { ToastActionCreators } from '@valenced/discord/actions'
import { before } from '@valenced/patcher'
import { ReactJSXRuntime } from '@valenced/react'
import { scanUrl, type ScanResult } from './virustotal'

const toast = (text: string) => ToastActionCreators.open('VIRUSTOTAL_SCANNER', { text })

const formatResult = (r: ScanResult): string => {
    if (r.kind === 'error') {
        switch (r.code) {
            case 'NO_KEY':
                return 'VirusTotal: no API key set'
            case 'BAD_URL':
                return 'VirusTotal: invalid link'
            case 'BAD_KEY':
                return 'VirusTotal: API key rejected'
            case 'RATE_LIMIT':
                return 'VirusTotal: rate limit reached'
            case 'NETWORK':
                return 'VirusTotal: network error'
            default:
                return 'VirusTotal: request failed'
        }
    }
    if (r.kind === 'submitted') {
        return 'VirusTotal: analysis started, try again in a minute'
    }
    const clean = r.flagged === 0
    return clean
        ? `✅ Clean (0/${r.total} vendors flagged)`
        : `⚠️ ${r.flagged}/${r.total} vendors flagged this link`
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

function collectUrls(props: any): string[] {
    const out: string[] = []
    const add = (u: unknown) => {
        if (typeof u === 'string' && /^https?:\/\//i.test(u)) out.push(u)
    }
    const msg = props?.message
    add(props?.url)
    add(props?.href)
    add(props?.link)
    if (msg) {
        if (typeof msg.content === 'string') (msg.content.match(URL_RE) ?? []).forEach(add)
        for (const a of (msg.attachments ?? []).slice?.(0, 10) ?? []) add(a?.url ?? a?.proxy_url)
        for (const e of (msg.embeds ?? []).slice?.(0, 10) ?? []) add(e?.url)
    }
    return [...new Set(out)].slice(0, 3)
}

const nameOf = (type: unknown) => (typeof type === 'function' ? type.name : undefined)

export default plugin({
    start({ settings, logger }) {
        let busy = false

        const run = async (url: string) => {
            if (busy) return
            busy = true
            try {
                const key = (settings?.apiKey ?? '').trim()
                if (!key) {
                    toast('VirusTotal: set your API key in the plugin settings')
                    return
                }
                const result = await scanUrl(url, key)
                toast(formatResult(result))
            } catch (e) {
                logger.warn(`vt error: ${e}`)
                toast('VirusTotal: unexpected error')
            } finally {
                busy = false
            }
        }

        const patchJSX = (args: [type: any, props: any, key?: any]) => {
            const [type, props, key] = args
            const tName = nameOf(type)
            if (!tName || !/ActionSheet|LongPress|MessageAction/i.test(tName)) return args
            if (!props?.config) return args

            const urls = collectUrls(props)
            if (!urls.length) return args

            const original = props.config.onLongPress
            return [
                type,
                {
                    ...props,
                    config: {
                        ...props.config,
                        onLongPress: (...cbArgs: any[]) => {
                            if (typeof original === 'function') original(...cbArgs)
                            void run(urls[0])
                        },
                    },
                },
                key,
            ] as typeof args
        }

        before(ReactJSXRuntime, 'jsx', patchJSX)
        before(ReactJSXRuntime, 'jsxs', patchJSX)
    },
})
