import { getNativeModule } from '@valenced/modules/native'
import { instead } from '@valenced/patcher'
import { noop } from '@valenced/utils/callback'

export default plugin({
	start({ cleanup, jsonStorage, plugin }) {
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
