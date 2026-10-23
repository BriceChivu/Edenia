extends RefCounted

## The host reports visibility; the game chooses when its web loop can sleep.
## Keep the scene alive so wall-clock actions catch up through their existing
## advance methods, including the final axe-swing boundary, after resume.
var suspended := false

func set_presented(world: Node, presented: bool) -> void:
	if presented == (not suspended) or not OS.has_feature("web"):
		return
	if not presented:
		world.world_pointer_down = null
		world.world_dragging = false
		world.pointer_inside = false
		world.pointer.hide()
	# Retain the WASM runtime while its loop sleeps: Emscripten otherwise exits
	# when the paused runner releases its only keepalive. Resume owns a new
	# keepalive before we release ours. These hooks match our nothreads export.
	var operation := "Module.resumeMainLoop(); runtimeKeepalivePop(); if (window.edeniaResumeAudio) GodotAudio.ctx.resume().catch(console.error);" if presented else "runtimeKeepalivePush(); Module.pauseMainLoop(); window.edeniaResumeAudio = GodotAudio.ctx?.state === 'running'; if (window.edeniaResumeAudio) GodotAudio.ctx.suspend().catch(console.error);"
	var applied = JavaScriptBridge.eval("(() => { if (typeof Module.pauseMainLoop !== 'function' || typeof Module.resumeMainLoop !== 'function' || typeof runtimeKeepalivePush !== 'function' || typeof runtimeKeepalivePop !== 'function') return false; %s window.edeniaPresentationSuspended = %s; return true; })()" % [operation, "false" if presented else "true"])
	# JavaScriptBridge.eval returns JS booleans as an integer in this engine.
	if applied:
		suspended = not presented
