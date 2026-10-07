extends SceneTree

var failures := 0
var world

func _initialize() -> void:
	run.call_deferred()

func capture() -> Image:
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()

func run() -> void:
	root.size = Vector2i(1152, 496)
	world = load("res://scenes/level_two_preview.tscn").instantiate()
	world.island_start_enabled = false
	world.preview_save_enabled = false
	root.add_child(world)
	world.game_camera.zoom = Vector2.ONE
	world.game_camera.force_update_scroll()
	await process_frame
	world.set_process(false)
	world.pawn.set_physics_process(false)
	world.pawn.sprite.play("idle")
	world.pawn.sprite.pause()
	var l = world.layout
	l.trees.clear()
	l.flora.clear()
	l.decorations.clear()
	for node in world.find_children("*", "", true, false):
		if node.has_method("update_depth_mask"):
			node.hide()
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		for height in [0, 64]:
			l.cells = {Vector2i.ZERO: "stairs", -direction: "meadow", direction: "high_gold", Vector2i.DOWN: "meadow", Vector2i.UP: "meadow", -direction + Vector2i.UP: "meadow"}
			l.elevations = {Vector2i.ZERO: height, -direction: height, direction: height + 64, Vector2i.DOWN: height, Vector2i.UP: height, -direction + Vector2i.UP: height}
			l.stair_directions = {Vector2i.ZERO: direction}
			for cell in l.cells:
				if l.cells[cell] != "stairs" and l.height_at(cell) > 0:
					l.cells[cell] = "high_gold"
			world.rebuild_decorations()
			world.pawn.hide()
			var terrain: Image = await capture()
			var atlas: Image = world.terrain.floor_texture(height + 64).get_image()
			for situation in ["beside", "behind", "slope_behind", "slope_front", "ramp", "front"]:
				var point: Vector2 = l.center(Vector2i.ZERO)
				if situation in ["beside", "behind"]:
					point.x = l.ORIGIN.x - 12 if direction == Vector2i.RIGHT else l.ORIGIN.x + 76
				if situation == "behind":
					point.y = l.ORIGIN.y - 2
				if situation in ["slope_behind", "slope_front"]:
					point.y = l.ORIGIN.y - (34 if situation == "slope_behind" else 20)
				if situation == "front":
					point.y = l.ORIGIN.y + 68
					point.x = l.ORIGIN.x + (12 if direction == Vector2i.RIGHT else 52)
				world.pawn.position = point
				var pawn_height: float = world.ground_height(point)
				world.pawn.sprite.position.y = -32 - pawn_height
				world.pawn.z_index = int(ceil(pawn_height / 64.0))
				world.pawn.show()
				var picture: Image = await capture()
				var changed := 0
				for y in range(128):
					for x in range(64):
						if atlas.get_pixel((0 if direction == Vector2i.RIGHT else 192) + x, 256 + y).a < 0.99:
							continue
						var pixel := Vector2i(world.terrain.get_global_transform_with_canvas() * (l.ORIGIN + Vector2(x, y - height - 64)))
						if terrain.get_pixelv(pixel) != picture.get_pixelv(pixel):
							changed += 1
				print(direction, " height=", height, " ", situation, ": ", changed, " pawn pixels over opaque ramp")
				if (situation in ["behind", "slope_behind"] and changed != 0) or (situation not in ["behind", "slope_behind"] and changed == 0):
					failures += 1
					push_error("Pawn behind the sloped edge must be covered; pawn in front or on the ramp must remain visible")
	print("Stair edge depth: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
