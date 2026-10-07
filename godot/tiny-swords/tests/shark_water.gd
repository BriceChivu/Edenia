extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures: Array[String] = []

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok: failures.append(message)

func run() -> void:
	var scene = load("res://previews/level_three.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	if "--capture" in OS.get_cmdline_user_args():
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("/tmp/edenia-shark-preview.png")
	scene.set_process(false)
	var shark = scene.shark
	shark.set_process(false)
	shark.rng.seed = 9
	check(shark.visible and shark.water_position(shark.position), "Shark starts fully in water")
	# Construct a tall cliff with a clear water square geometrically behind it.
	scene.layout.cells.clear()
	scene.layout.elevations.clear()
	scene.layout.stair_directions.clear()
	var cell := Vector2i(2, 2)
	scene.layout.cells[cell] = "meadow"
	scene.layout.elevations[cell] = 192
	shark.refresh_obstacles()
	var origin: Vector2 = Layout.ORIGIN + Vector2(cell) * 64
	check(not shark.water_position(origin + Vector2(32, -160)), "Cannot swim over raised land")
	check(not shark.water_position(origin + Vector2(32, -64)), "Cannot swim behind tall cliff")
	check(not shark.water_position(origin + Vector2(32, 32)), "Cannot swim over cliff foot")
	check(not shark.water_position(origin + Vector2(-10, -64)), "Whole sprite stays clear of cliff edges")
	check(not shark.water_segment(origin + Vector2(-120, -64), origin + Vector2(180, -64)), "Route cannot cross a cliff between clear endpoints")
	shark.position = origin + Vector2(32, -64)
	shark.ensure_water_position()
	check(shark.visible and shark.water_position(shark.position), "Terrain edits relocate a covered shark into water")
	check(shark.ripples.hframes == 16, "Shark reuses sixteen rock-ripple frames")
	var ripple_frame: int = shark.ripples.frame
	shark._process(0.1)
	shark._process(0.1)
	check(shark.ripples.frame != ripple_frame, "Ripples animate around the shark")
	var start: Vector2 = shark.position
	for tick in 3600:
		shark._process(0.05)
		if not shark.water_position(shark.position):
			failures.append("Shark crossed land during three minutes of roaming")
			break
	check(shark.position.distance_to(start) > 24, "Shark freely roams")
	root.get_node("GamePresentation").reduced_motion = true
	start = shark.position
	shark._process(1)
	check(shark.position == start, "Reduced motion freezes ambient swimming")
	root.get_node("GamePresentation").reduced_motion = false
	# The original native level-one scene shares the same ambient wildlife.
	var basic = load("res://scenes/level_one.tscn").instantiate()
	root.add_child(basic)
	await process_frame
	check(basic.shark.water_position(basic.shark.position), "Native base scene supports the shark")
	basic.queue_free()
	scene.queue_free()
	await process_frame
	if failures.is_empty():
		print("PASS: shark water-only roaming, cliff clearance, terrain edits and native scenes")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
