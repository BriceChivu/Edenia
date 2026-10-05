extends SceneTree

var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func run() -> void:
	var scene = load("res://previews/level_three.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	# A splash north of the foreground shore overlaps its grass and cliff.
	var shore: Vector2 = scene.layout.center(Vector2i(0, 1))
	scene.WaterFall.align_splash(scene.splash, scene.pawn, 7, shore - Vector2(69, 35), Vector2.RIGHT)
	check(scene.splash.position.y < shore.y, "Splash is behind the foreground shore")
	check(scene.splash.z_index < scene.terrain.z_index, "Foreground grass and shoreline cover overlapping splash pixels")
	check(scene.splash.z_index > scene.get_node("Water").z_index, "Splash stays visible above water")
	check(scene.splash.z_index < scene.get_node("WaterRocks").z_index, "Water rocks cover overlapping splash pixels")
	check(scene.splash.z_index < scene.pawn.z_index, "Pawn covers initial splash frames")
	scene.queue_free()
	await process_frame
	print("Splash depth checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
