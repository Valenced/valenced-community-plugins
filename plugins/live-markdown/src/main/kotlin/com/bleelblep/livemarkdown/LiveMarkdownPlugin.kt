@file:JvmName("LiveMarkdownPlugin")

package com.bleelblep.livemarkdown

import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.Spanned
import android.text.TextWatcher
import android.view.ActionMode
import android.widget.TextView
import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import java.lang.reflect.Member
import java.util.WeakHashMap

internal object Settings {
	@Volatile var headings = true
	@Volatile var dimMarkers = true
	@Volatile var monoCode = true
	@Volatile var menu: Set<String> = Format.entries.map { it.id }.toSet()
}

private fun enabledFormats() = Format.entries.filter { it.id in Settings.menu }

private const val CHAT_INPUT = "com.discord.chat.input.views.DCDChatInput"
private const val LINK_COLOR = 0xFF00A8FC.toInt()

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

private fun withAlpha(color: Int, alpha: Int) = (color and 0x00FFFFFF) or (alpha shl 24)

private class Wanted(val start: Int, val end: Int, val span: MdSpan) {
	val id = "${span.key}@$start-$end"
}

private fun wantedSpans(view: TextView, text: String): List<Wanted> {
	val color = view.currentTextColor
	val out = ArrayList<Wanted>()
	fun add(run: Run, span: MdSpan) { out += Wanted(run.start, run.end, span) }
	for (run in Markdown.parse(text)) {
		when (run.kind) {
			Kind.MARKER -> if (Settings.dimMarkers) add(run, ColorMd(withAlpha(color, 0x66)))
			Kind.BOLD -> add(run, StyleMd(Typeface.BOLD))
			Kind.ITALIC -> add(run, StyleMd(Typeface.ITALIC))
			Kind.UNDERLINE -> add(run, UnderlineMd())
			Kind.STRIKE -> add(run, StrikeMd())
			Kind.SPOILER -> add(run, BackgroundMd(withAlpha(color, 0x38)))
			Kind.CODE -> {
				add(run, BackgroundMd(withAlpha(color, 0x1F)))
				if (Settings.monoCode) add(run, MonoMd())
			}
			Kind.LINK -> add(run, ColorMd(LINK_COLOR))
			Kind.H1, Kind.H2, Kind.H3 -> {
				add(run, StyleMd(Typeface.BOLD))
				if (Settings.headings) add(run, SizeMd(when (run.kind) { Kind.H1 -> 1.5f; Kind.H2 -> 1.3f; else -> 1.15f }))
			}
			Kind.SUBTEXT -> {
				add(run, ColorMd(withAlpha(color, 0xA6)))
				if (Settings.headings) add(run, SizeMd(0.85f))
			}
			Kind.QUOTE -> add(run, ColorMd(withAlpha(color, 0x80)))
		}
	}
	return out
}

internal class MarkdownHooks(private val scope: PluginScope) {
	private val mainHandler = Handler(Looper.getMainLooper())
	private val watchers = WeakHashMap<TextView, TextWatcher>()

	private val chatInputClass: Class<*> = runCatching { scope.classLoader.loadClass(CHAT_INPUT) }
		.getOrElse { error("$CHAT_INPUT not found on this Discord version") }

	private val unhooks: List<Unhook> = listOf(
		hookMethod(
			TextView::class.java.getDeclaredMethod(
				"onTextChanged",
				CharSequence::class.java,
				Int::class.javaPrimitiveType,
				Int::class.javaPrimitiveType,
				Int::class.javaPrimitiveType,
			),
			after = ::onTextChanged,
		),
		hookMethod(
			TextView::class.java.getMethod("setCustomSelectionActionModeCallback", ActionMode.Callback::class.java),
			before = ::onSetSelectionCallback,
		),
	)

	fun setSettings(settings: Map<*, *>) {
		(settings["headings"] as? Boolean)?.let { Settings.headings = it }
		(settings["dimMarkers"] as? Boolean)?.let { Settings.dimMarkers = it }
		(settings["monoCode"] as? Boolean)?.let { Settings.monoCode = it }
		when (val menu = settings["menu"]) {
			is List<*> -> Settings.menu = menu.filterIsInstance<String>().toSet()
			is Array<*> -> Settings.menu = menu.filterIsInstance<String>().toSet()
		}
		mainHandler.post {
			for (view in watchers.keys.toList()) (view.text as? Editable)?.let { restyle(view, it) }
		}
	}

	fun dispose() {
		for (unhook in unhooks) unhook.unhook()
		mainHandler.post {
			for ((view, watcher) in watchers.entries.toList()) {
				runCatching {
					view.removeTextChangedListener(watcher)
					clear(view)
					(view.customSelectionActionModeCallback as? FormatCallback)?.let { view.customSelectionActionModeCallback = it.inner }
				}
			}
			watchers.clear()
		}
	}

	// Discord's clearAndApplyChatNodes only removes its own DCDInputSpans, so ours survive
	private fun restyle(view: TextView, text: Editable) {
		runCatching {
			val wanted = wantedSpans(view, text.toString()).associateBy { it.id }
			val have = HashMap<String, Any>()
			for (span in text.getSpans(0, text.length, MdSpan::class.java)) {
				val id = "${span.key}@${text.getSpanStart(span)}-${text.getSpanEnd(span)}"
				if (id in wanted && id !in have) have[id] = span else text.removeSpan(span)
			}
			for ((id, w) in wanted) {
				if (id in have || w.end > text.length) continue
				text.setSpan(w.span, w.start, w.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
			}
		}.onFailure { scope.log.w("restyle failed: $it") }
	}

	private fun clear(view: TextView) {
		val text = view.text as? Editable ?: return
		for (span in text.getSpans(0, text.length, MdSpan::class.java)) text.removeSpan(span)
	}

	private fun ensureMenu(view: TextView) {
		val current = view.customSelectionActionModeCallback
		if (current is FormatCallback) return
		view.customSelectionActionModeCallback = FormatCallback(view, current, ::enabledFormats)
	}

	// Discord sets its callback in ChatInputRootView's constructor
	private fun onSetSelectionCallback(param: HookParam) {
		val view = param.thisObject as? TextView ?: return
		if (view.javaClass !== chatInputClass) return
		val callback = param.args.getOrNull(0) as? ActionMode.Callback
		if (callback !is FormatCallback) param.args[0] = FormatCallback(view, callback, ::enabledFormats)
	}

	private fun onTextChanged(param: HookParam) {
		val view = param.thisObject as? TextView ?: return
		if (view.javaClass !== chatInputClass) return
		// Boxes made before the plugin started missed the setter hook
		runCatching { ensureMenu(view) }
		if (watchers.containsKey(view)) return
		val watcher = object : TextWatcher {
			override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
			override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
			override fun afterTextChanged(s: Editable) = restyle(view, s)
		}
		view.addTextChangedListener(watcher)
		watchers[view] = watcher
		(view.text as? Editable)?.let { restyle(view, it) }
	}
}

val liveMarkdownPlugin = plugin {
	var hooks: MarkdownHooks? = null

	start {
		hooks = MarkdownHooks(this)

		registerNativeMethod("${manifest.id}.setSettings") { args ->
			(args.firstOrNull() as? Map<*, *>)?.let { hooks?.setSettings(it) }
			null
		}
	}

	stop {
		hooks?.dispose()
		hooks = null
	}
}
