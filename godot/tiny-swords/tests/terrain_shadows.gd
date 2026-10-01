extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(1152, 496)
	var level = load("res://scenes/level_two_preview.tscn").instantiate()
	level.preview_save_enabled = false
	root.add_child(level)
	# Pixel fixtures use one world unit per pixel, independent of gameplay zoom.
	level.game_camera.zoom = Vector2.ONE
	level.game_camera.force_update_scroll()
	await process_frame
	# A two-storey platform still needs the first tier's shadow at its foot.
	level.layout.cells = {Vector2i.ZERO: "high_gold", Vector2i.DOWN: "meadow"}
	level.layout.elevations = {Vector2i.ZERO: 128}
	level.layout.flora.clear()
	level.layout.decorations.clear()
	level.rebuild_decorations()
	for cloud in level.get_children():
		if "Cloud" in cloud.name:
			cloud.hide()
	level.pawn.hide()
	await process_frame
	await RenderingServer.frame_post_draw
	var with_shadow = root.get_texture().get_image()
	with_shadow.save_png("/tmp/edenia-shadow-footprint.png")
	for node in level.get_children():
		if node.has_meta("terrain_shadow"):
			node.hide()
	await process_frame
	await RenderingServer.frame_post_draw
	var without_shadow = root.get_texture().get_image()
	var shadowed := 0
	# The source shadow's fringe extends just beyond the 64px cliff face.
	for y in range(240, 248):
		for x in range(528, 560):
			if with_shadow.get_pixel(x, y).get_luminance() < without_shadow.get_pixel(x, y).get_luminance() - 0.03:
				shadowed += 1
	var passed := shadowed > 50
	print("Shadow at foot of stacked cliff: ", "PASS" if passed else "FAIL", " (", shadowed, " shaded lower-ground pixels)")
	quit(0 if passed else 1)
