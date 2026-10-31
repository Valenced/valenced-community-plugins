import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

export function barHapticFeedback() {
	const [haptics] = lookupModule(
		withProps<{
			HapticFeedbackTypes: { IMPACT_LIGHT: number }
			triggerHapticFeedback(type: number): void
		}>('triggerHapticFeedback', 'HapticFeedbackTypes'),
		{ initialize: false },
	)
	// Discord's trigger respects its enabled state and Android's system setting.
	haptics?.triggerHapticFeedback(haptics.HapticFeedbackTypes.IMPACT_LIGHT)
}
