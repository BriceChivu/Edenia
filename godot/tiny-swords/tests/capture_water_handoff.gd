extends SceneTree
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	root.size = Vector2i(1152,496)
	var level = load("res://previews/level_one.tscn").instantiate()
	root.add_child(level)
	await process_frame
	for name in ["Clouds", "PassingCloud", "WaterRocks", "Reflections"]:
		level.get_node(name).hide()
	var start := Vector2(628,208)
	level.pawn.position = start
	level.pawn.walk_to(start)
	var label := OS.get_cmdline_user_args()[0] if not OS.get_cmdline_user_args().is_empty() else "current"
	var output := ProjectSettings.globalize_path("res://../../test-results/tiny-swords-reference/handoff-" + label)
	DirAccess.make_dir_recursive_absolute(output)
	var records := []
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().get_region(Rect2i(500,80,280,250)).save_png(output + "/frame-00.png")
	var began := Time.get_ticks_msec()
	level.fall_into_water(start + Vector2(160,0))
	for index in range(1,25):
		await create_timer(0.03).timeout
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().get_region(Rect2i(500,80,280,250)).save_png(output + "/frame-%02d.png" % index)
		records.append({"frame":index,"ms":Time.get_ticks_msec()-began,"x":level.pawn.position.x,"phase":level.water_phase})
	var file := FileAccess.open(output + "/timing.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(records))
	quit()
