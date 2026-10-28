import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { onFluxEventDispatched } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { Settings } from './shared'

const TRACKING_PARAMS = [
	'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name',
	'fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'igsh', 'mc_eid', 'mkt_tok',
	'yclid', 'wickedid', 'vero_id', 'oly_anon_id', 'oly_enc_id',
	'ref_src', 'ref_url', 's_kwcid', 'ncid', 'cmpid', 'cid', 'CUTB',
	'_hsenc', '_hsmi', 'hsCtaTracking', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver',
	'twclid', 'gbraid', 'wbraid', 'sr_share', 'si', 'feature', 'app', 'spm', 'scm',
]

const TRACKING_RE = new RegExp(`([?&])(${TRACKING_PARAMS.join('|')})=[^&]*&?`, 'gi')
const TRAILING_QS = /[?&]$/

function cleanUrl(text: string) {
	if (typeof text !== 'string' || !text.includes('http')) return text
	return text
		.replace(TRACKING_RE, '$1')
		.replace(/([?&])+/g, '$1')
		.replace(TRAILING_QS, '')
		.replace(/\?#/, '#')
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start({ cleanup, jsonStorage }) {
		cleanup(
			instead(Clipboard, 'setString', (args, orig) => {
				if (jsonStorage.cache?.enabled && jsonStorage.cache?.cleanOnCopy) {
					args[0] = cleanUrl(args[0] as string)
				}
				return orig(...args)
			}),
		)

		cleanup(
			onFluxEventDispatched('MESSAGE_CREATE', evt => {
				if (!jsonStorage.cache?.enabled) return evt
				const msg = evt?.message
				if (msg?.content && msg.content.includes('http'))
					msg.content = cleanUrl(msg.content)
				return evt
			}),
		)
	},
	SettingsComponent,
})
