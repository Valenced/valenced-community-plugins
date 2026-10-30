import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { getNativeModule } from '@valenced/modules/native'
import { instead } from '@valenced/patcher'
import { ReactNative } from '@valenced/react'
import { noop } from '@valenced/utils/callback'

const { AlertActionButton, AlertModal } = Design
const { Platform } = ReactNative

export default plugin({
	start({ cleanup, jsonStorage, plugin }) {
		if (Platform.OS !== 'android') {
			AlertActionCreators.openAlert(
				'mxtiy.audiofix.unsupported-platform',
				<AlertModal
					title="Bluetooth Audio Fix"
					content="This plugin only works on Android."
					actions={<AlertActionButton variant="primary" text="Got it" />}
				/>,
			)
			return
		}

		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		const audioManager = getNativeModule('NativeAudioManagerModule') ?? getNativeModule('RTNAudioManager')
		if (!audioManager) {
			plugin.reportError("AudioManager module not found")
			plugin.disable()
			return
		}

		cleanup(instead(audioManager, 'setCommunicationModeOn', noop))
	},
})
