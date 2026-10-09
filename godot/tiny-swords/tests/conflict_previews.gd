extends SceneTree

var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var island = load("res://scenes/conflict_island.tscn").instantiate()
	root.add_child(island)
	check(not island.preview_save_enabled and not island.camera_save_enabled, "Previews have no durable writers")
	check(island.process_mode == Node.PROCESS_MODE_DISABLED, "Preview simulation and input are disabled")
	var snapshot: Dictionary = island.layout.snapshot()
	var original: Dictionary = snapshot.duplicate(true)
	check(island.capture_restore(snapshot), "Canonical save can be rendered")
	check(snapshot == original, "Restore cannot modify supplied saved version")
	var restored: Dictionary = island.layout.snapshot()
	for frame in range(5):
		await process_frame
	check(island.layout.snapshot() == restored, "Rendering cannot advance resources, animals or action clocks")
	island.save_layout()
	check(not island.capture_restore({"version": 999}), "Unsupported save is rejected")
	check(island.layout.snapshot() == restored, "Rejected save leaves previous snapshot intact")
	check(not island.ui.visible and not island.pointer.visible, "Preview omits gameplay controls")
	island.queue_free()
	await process_frame
	print("Conflict preview checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
