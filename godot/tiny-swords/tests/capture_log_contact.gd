extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(1152, 496)
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.camera_save_enabled = false
	var cell := Vector2i(1, 0)
	var center: Vector2 = world.layout.center(cell)
	for x in range(-1, 2):
		for y in range(-1, 2):
			world.layout.cells[cell + Vector2i(x, y)] = "meadow"
	world.refresh()
	world.layout.trees.clear()
	world.layout.flora.clear()
	world.layout.decorations.clear()
	world.game_camera.position = center + Vector2(0, -12)
	world.game_camera.zoom = Vector2.ONE * 4
	world.pawn.sprite.play("idle")
	world.pawn.sprite.pause()
	for count in [1, 6]:
		world.layout.log_piles = {cell: count}
		world.rebuild_decorations()
		var outline := Line2D.new()
		outline.points = world.layout.log_footprint(cell)
		outline.add_point(outline.points[0])
		outline.width = 0.5
		outline.default_color = Color.CYAN
		outline.z_index = 20
		world.add_child(outline)
		for side in ["left", "right"]:
			world.pawn.position = center + Vector2(-44 if side == "left" else 56, 15)
			world.pawn.sprite.position.y = -32 - world.ground_height(world.pawn.position)
			world.pawn.z_index = int(world.ground_height(world.pawn.position) / 64)
			for item in world.flora_nodes:
				if item.has_meta("log_pile") and not item.is_queued_for_deletion():
					item.update_depth()
			await process_frame
			await RenderingServer.frame_post_draw
			var path := ProjectSettings.globalize_path("res://../../artifacts/log-contact/%d-%s.png" % [count, side])
			DirAccess.make_dir_recursive_absolute(path.get_base_dir())
			root.get_texture().get_image().save_png(path)
		outline.queue_free()
	quit()
