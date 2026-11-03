import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { onFluxEventDispatched } from '@valenced/discord/flux'
import { instead } from '@valenced/patcher'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { JsonStorage } from '@valenced/json-storage'
import type { Settings } from './shared'

interface MessagesModule {
	sendMessage: (...args: unknown[]) => unknown
	editMessage: (...args: unknown[]) => unknown
}

// Tracking parameter patterns from ClearURLs Rules (globalRules + referralMarketing)
// Source: https://gitlab.com/ClearURLs/rules/-/blob/master/data.min.json
const TRACKING_PARAMS = [
	'utm(?:_[a-z_]*)?',
	'mtm(?:_[a-z_]*)?',
	'ga_[a-z_]+',
	'yclid',
	'_openstat',
	'fb_action_(?:types|ids)',
	'fb_(?:source|ref)',
	'fbclid',
	'action_(?:object|type|ref)_map',
	'gs_l',
	'mkt_tok',
	'hmb_(?:campaign|medium|source)',
	'gclid',
	'srsltid',
	'otm_[a-z_]*',
	'cmpid',
	'os_ehash',
	'_ga',
	'_gl',
	'__twitter_impression',
	'wt_?z?mc',
	'wtrid',
	'[a-z]?mc',
	'dclid',
	'Echobox',
	'spm',
	'vn(?:_[a-z]*)+',
	'tracking_source',
	'ceneo_spo',
	'itm_(?:campaign|medium|source)',
	'__hsfp',
	'__hssc',
	'__hstc',
	'_hsenc',
	'__s',
	'hsCtaTracking',
	'mc_(?:eid|cid|tc)',
	'ml_subscriber',
	'ml_subscriber_hash',
	'msclkid',
	'oly_anon_id',
	'oly_enc_id',
	'rb_clickid',
	's_cid',
	'vero_conv',
	'vero_id',
	'wickedid',
	'twclid',
	'ref_?',
	'referrer',
]

const TRACKING_RE = new RegExp(`([?&])(${TRACKING_PARAMS.join('|')})=[^&]*&?`, 'gi')
const TRAILING_QS = /[?&]$/

function cleanUrl(text: string) {
	return text
		.replace(TRACKING_RE, '$1')
		.replace(/([?&])+/g, '$1')
		.replace(TRAILING_QS, '')
		.replace(/\?#/, '#')
}

function cleanString(value: unknown) {
	if (typeof value === 'string' && value.includes('http')) {
		return cleanUrl(value)
	}
	return value
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
					args[0] = cleanString(args[0])
				}
				return orig(...args)
			}),
		)

		cleanup(
			onFluxEventDispatched('MESSAGE_CREATE', evt => {
				if (!jsonStorage.cache?.enabled) return evt
				const msg = evt?.message
				if (msg?.content) msg.content = cleanString(msg.content)
				return evt
			}),
		)

		cleanup(
			getModules(
				withName<MessagesModule>('Messages'),
				mod => {
					const module = mod as { default: MessagesModule }
					cleanup(
						instead(module.default, 'sendMessage', (args, orig) => {
							if (jsonStorage.cache?.enabled && jsonStorage.cache?.cleanOnCopy && typeof args[1] === 'string')
								args[1] = cleanString(args[1])
							return orig(...args)
						}),
					)
					cleanup(
						instead(module.default, 'editMessage', (args, orig) => {
							if (jsonStorage.cache?.enabled && jsonStorage.cache?.cleanOnCopy && typeof args[2] === 'string')
								args[2] = cleanString(args[2])
							return orig(...args)
						}),
					)
				},
				{ returnNamespace: true },
			),
		)
	},
	SettingsComponent,
})
