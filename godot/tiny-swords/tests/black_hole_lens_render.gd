extends SceneTree

# Run with a real renderer: Godot --path godot/tiny-swords --script res://tests/black_hole_lens_render.gd
var game

func _initialize() -> void:
	run.call_deferred()

func freeze(node: Node) -> void:
	node.process_mode = Node.PROCESS_MODE_DISABLED
	node.set_process(false)
	node.set_physics_process(false)
	for child in node.get_children(): freeze(child)

func capture() -> Image:
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()

func run() -> void:
	seed(123)
	root.size = Vector2i(960, 640)
	game = load("res://scenes/level_two_preview.tscn").instantiate()
	game.preview_save_enabled = false
	game.camera_save_enabled = false
	root.add_child(game)
	await process_frame
	game.restore_saved_layout(preload("res://scripts/black_hole_meadow.gd").create().snapshot())
	await process_frame
	await process_frame
	game.portal_event.open()
	game.black_hole_enabled = true
	game.portal_event.visited = false
	game.portal_event.last_process_at = Time.get_unix_time_from_system()
	for tween in get_processed_tweens():
		if tween.is_valid(): tween.kill()
	freeze(game)
	game.ui.root.hide()
	var event = game.portal_event
	event.portal.scale = event.BASE_SCALE
	game.game_camera.position = event.visual_center()
	game.game_camera.zoom = Vector2.ONE * 2.0
	game.game_camera.force_update_scroll()
	await process_frame
	# Keep the native focus/next-day visit callbacks outside this rendering fixture.
	event.visited = false
	event.lens.position = event.portal.position - event.LENS_SIZE / 2.0
	event.backbuffer.rect = Rect2(event.lens.position, event.LENS_SIZE).grow(24.0)
	var transform: Transform2D = event.lens.get_global_transform_with_canvas()
	event.lens.material.set_shader_parameter("screen_span_uv", event.LENS_SIZE * Vector2(transform.x.length(), transform.y.length()) / root.get_visible_rect().size)
	event.portal.hide()
	event.ground_shadow.hide()
	event.lens.hide()
	var before := await capture()
	event.lens.show()
	event.lens.material.set_shader_parameter("facing", -1.0)
	var after := await capture()
	var center: Vector2 = root.get_stretch_transform() * event.lens.get_global_transform_with_canvas() * (event.LENS_SIZE / 2.0)
	var failures := 0
	var mask: Image = preload("res://assets/black-hole/particle_flow_mask.png").get_image()
	var screen_transform: Transform2D = root.get_stretch_transform() * event.lens.get_global_transform_with_canvas()
	var inverse := screen_transform.affine_inverse()
	for facing in [-1.0, 1.0]:
		event.lens.material.set_shader_parameter("facing", facing)
		var rendered := await capture()
		for side in [-1, 1]:
			var changed := 0
			var total := 0
			for y in range(int(center.y) - 65, int(center.y) + 65):
				for distance in range(55, 125):
					var x: int = int(center.x) + side * distance
					total += 1
					if not before.get_pixel(x, y).is_equal_approx(rendered.get_pixel(x, y)): changed += 1
			print("Facing %s, side %d: %d / %d distorted grass pixels" % [facing, side, changed, total])
			var intake: bool = float(side) == facing
			if (intake and changed < total / 10) or (not intake and changed > total / 100):
				failures += 1
				push_error("Only the grass in front of the portal may distort, in either facing")
		var outside_trails := 0
		for y in range(int(center.y) - 105, int(center.y) + 105):
			for x in range(int(center.x) - 105, int(center.x) + 105):
				var uv: Vector2 = (inverse * Vector2(x + 0.5, y + 0.5)) / event.LENS_SIZE
				if facing > 0.0: uv.x = 1.0 - uv.x
				var mx := clampi(int(uv.x * mask.get_width()), 2, mask.get_width() - 3)
				var my := clampi(int(uv.y * mask.get_height()), 2, mask.get_height() - 3)
				var near_trail := false
				for dy in range(-2, 3):
					for dx in range(-2, 3):
						if mask.get_pixel(mx + dx, my + dy).r > 0.0: near_trail = true
				if not near_trail and not before.get_pixel(x, y).is_equal_approx(rendered.get_pixel(x, y)):
					outside_trails += 1
		print("Outside the actual particle trails: %d changed pixels" % outside_trails)
		if outside_trails > 10:
			failures += 1
			push_error("Grass between and beyond the particle trails must stay unchanged")
		var outside_changes := 0
		for y in range(int(center.y) - 70, int(center.y) + 70):
			for distance in range(130, 180):
				var x: int = int(center.x) + int(facing) * distance
				if not before.get_pixel(x, y).is_equal_approx(rendered.get_pixel(x, y)): outside_changes += 1
		print("Outside the incoming particle field: %d changed pixels" % outside_changes)
		if outside_changes > 70:
			failures += 1
			push_error("Grass beyond the incoming particles must stay undistorted")
	event.lens.material.set_shader_parameter("facing", -1.0)
	var folder := ProjectSettings.globalize_path("res://../../test-results/black-hole-lens")
	DirAccess.make_dir_recursive_absolute(folder)
	before.save_png(folder.path_join("before.png"))
	after.save_png(folder.path_join("after.png"))
	event.portal.show()
	event.ground_shadow.show()
	var complete := await capture()
	complete.save_png(folder.path_join("portal.png"))
	quit(0 if failures == 0 else 1)
