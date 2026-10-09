extends RefCounted

## Rendering policy belongs to the game. These guarded hooks match the current
## single-threaded Godot export; unsupported templates keep their own defaults.
static func configure() -> void:
	if not OS.has_feature("web"):
		return
	configure_webkit_framebuffer_copy()
	# Native display density avoids browser enlargement of a low-resolution canvas.
	# A positive cap remains available for explicit performance diagnostics.
	var maximum := maxf(0, float(ProjectSettings.get_setting("edenia/web/max_pixel_ratio", 0.0)))
	JavaScriptBridge.eval("(() => { if (typeof GodotDisplayScreen !== 'object' || typeof GodotDisplayScreen.getPixelRatio !== 'function') return false; const maximum = %s; GodotDisplayScreen.getPixelRatio = () => GodotDisplayScreen.hidpi ? (maximum > 0 ? Math.min(window.devicePixelRatio || 1, Math.max(1, maximum)) : (window.devicePixelRatio || 1)) : 1; window.edeniaMaxPixelRatio = maximum; return true; })()" % maximum)
	set_frame_interval(int(ProjectSettings.get_setting("edenia/web/frame_interval", 1)))

static func configure_webkit_framebuffer_copy() -> bool:
	if not OS.has_feature("web"):
		return false
	# Linux WebKit backends can reject Emscripten's final framebuffer blit.
	# Its existing shader copy retains nearest filtering and restores GL state.
	return bool(JavaScriptBridge.eval("(() => { const linuxWebKit = /Linux/.test(navigator.platform || '') && /AppleWebKit/.test(navigator.userAgent) && !/(Chrome|Chromium|Edg|OPR)/.test(navigator.userAgent); if (!linuxWebKit || typeof GL !== 'object') return false; const context = GL.currentContext; if (!context?.defaultFbo || !context.blitProgram || !context.blitVB || !context.GLctx?.isProgram(context.blitProgram)) return false; context.defaultFboForbidBlitFramebuffer = true; window.edeniaFramebufferCopyMode = 'shader'; return true; })()"))

static func set_frame_interval(interval: int) -> bool:
	if not OS.has_feature("web"):
		return false
	interval = clampi(interval, 1, 4)
	Engine.max_fps = 0
	# RAF divisors skip callbacks asynchronously. Keep Engine.max_fps at zero:
	# its blocking frame-delay path spins in this single-threaded web template.
	return bool(JavaScriptBridge.eval("(() => { if (typeof _emscripten_set_main_loop_timing !== 'function') return false; const apply = () => { const ok = _emscripten_set_main_loop_timing(1, %s) === 0; if (ok) window.edeniaFrameInterval = %s; return ok; }; if (typeof MainLoop === 'object' && !MainLoop.func) { requestAnimationFrame(apply); return true; } return apply(); })()" % [interval, interval]))
