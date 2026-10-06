extends RefCounted

## Rendering policy belongs to the game. These guarded hooks match the current
## single-threaded Godot export; unsupported templates keep their own defaults.
static func configure() -> void:
	if not OS.has_feature("web"):
		return
	var maximum := maxf(1, float(ProjectSettings.get_setting("edenia/web/max_pixel_ratio", 2.0)))
	JavaScriptBridge.eval("(() => { if (typeof GodotDisplayScreen !== 'object' || typeof GodotDisplayScreen.getPixelRatio !== 'function') return false; GodotDisplayScreen.getPixelRatio = () => GodotDisplayScreen.hidpi ? Math.min(window.devicePixelRatio || 1, %s) : 1; window.edeniaMaxPixelRatio = %s; return true; })()" % [maximum, maximum])
	set_frame_interval(int(ProjectSettings.get_setting("edenia/web/frame_interval", 1)))

static func set_frame_interval(interval: int) -> bool:
	if not OS.has_feature("web"):
		return false
	interval = clampi(interval, 1, 4)
	Engine.max_fps = 0
	# RAF divisors skip callbacks asynchronously. Keep Engine.max_fps at zero:
	# its blocking frame-delay path spins in this single-threaded web template.
	return bool(JavaScriptBridge.eval("(() => { if (typeof _emscripten_set_main_loop_timing !== 'function') return false; const apply = () => { const ok = _emscripten_set_main_loop_timing(1, %s) === 0; if (ok) window.edeniaFrameInterval = %s; return ok; }; if (typeof MainLoop === 'object' && !MainLoop.func) { requestAnimationFrame(apply); return true; } return apply(); })()" % [interval, interval]))
