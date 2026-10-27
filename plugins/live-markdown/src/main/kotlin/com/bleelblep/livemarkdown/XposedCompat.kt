package com.bleelblep.livemarkdown

import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import java.lang.reflect.Member

/** The hook shapes `LiveMarkdownPlugin.kt` is written against, over the Xposed API. */
internal typealias HookParam = XC_MethodHook.MethodHookParam
internal typealias Unhook = XC_MethodHook.Unhook

internal fun hookMethod(
	member: Member,
	before: ((HookParam) -> Unit)? = null,
	after: ((HookParam) -> Unit)? = null,
): Unhook = XposedBridge.hookMethod(member, object : XC_MethodHook() {
	override fun beforeHookedMethod(param: MethodHookParam) {
		before?.invoke(param)
	}

	override fun afterHookedMethod(param: MethodHookParam) {
		after?.invoke(param)
	}
})
