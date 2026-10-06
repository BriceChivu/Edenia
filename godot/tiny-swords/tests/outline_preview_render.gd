extends SceneTree

var scene
var failures := 0

func _initialize() -> void:
	run.call_deferred()

func freeze(node: Node) -> void:
	node.set_process(false)
	node.set_physics_process(false)
	for child in node.get_children():
		freeze(child)

func capture() -> Image:
	for node in scene.find_children("*", "CanvasItem", true, false):
		node.queue_redraw()
	await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()

func white(color: Color) -> bool:
	return color.r > 0.8 and color.g > 0.8 and color.b > 0.8

func run() -> void:
	root.size = Vector2i(640, 480)
	scene = load("res://previews/level_three.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	freeze(scene)
	scene.ui.root.hide()
	scene.get_node("Clouds").hide()
	scene.get_node("PassingCloud").hide()
	scene.get_node("WaterRocks").hide()
	scene.pawn.hide()
	scene.pointer.hide()
	var l = scene.layout
	l.trees.clear()
	l.flora.clear()
	l.decorations.clear()
	l.manual_ground_elevation = true
	# The front terrace can cover a lowered tile. Its preview must use the
	# same surface depth as the click, rather than paint over that terrace.
	for fixture in [[0, 64, 0], [64, 0, 0], [64, 128, 64], [64, 0, 64], [128, 0, 0], [128, 0, 64]]:
		var current: int = fixture[0]
		var next: int = fixture[1]
		var front_height: int = fixture[2]
		var cell := Vector2i(1, 0)
		l.cells = {cell: l.kind_at_height(current), Vector2i.ZERO: l.kind_at_height(next), Vector2i(0, 1): l.kind_at_height(maxi(0, next - 64)), Vector2i(1, 1): l.kind_at_height(front_height)}
		l.elevations = {cell: current, Vector2i.ZERO: next, Vector2i(0, 1): maxi(0, next - 64), Vector2i(1, 1): front_height}
		if l.next_ground_height(cell) != next:
			continue
		scene.editing = true
		scene.selected = ""
		scene.pawn.position = l.center(Vector2i(8, 8))
		scene.game_camera.zoom = Vector2.ONE
		scene.game_camera.position = l.center(cell) - Vector2(0, 32)
		scene.game_camera.force_update_scroll()
		scene.rebuild_decorations()
		freeze(scene)
		scene.refresh()
		var point: Vector2 = l.center(cell) - Vector2(0, current)
		scene.update_inventory_preview(point)
		if not scene.terrain.valid or scene.terrain.hover != cell:
			push_error("Fixture failed to hover intended tile")
			failures += 1
			continue
		var before: Dictionary = l.snapshot().duplicate(true)
		var preview := await capture()
		if l.snapshot() != before:
			push_error("Hover preview mutated the saved island")
			failures += 1
		var click := InputEventMouseButton.new()
		click.button_index = MOUSE_BUTTON_LEFT
		click.pressed = true
		click.position = scene.get_global_transform_with_canvas() * point
		scene.handle_world_click(click)
		scene.update_inventory_preview(point, false)
		freeze(scene)
		var committed := await capture()
		var differences := 0
		for y in range(130, 350):
			for x in range(220, 370):
				var a := preview.get_pixel(x, y)
				var b := committed.get_pixel(x, y)
				# White outlines identify available changes; compare terrain
				# pixels beneath them, including cliffs, joins and shadows.
				if not white(a) and not white(b) and a != b:
					differences += 1
		print("Outline render %s -> %s (front=%s): %s mismatched pixels" % [current, next, front_height, differences])
		if differences > 0:
			failures += 1
			var folder := ProjectSettings.globalize_path("res://../../test-results/outline-preview")
			DirAccess.make_dir_recursive_absolute(folder)
			preview.save_png(folder.path_join("preview-%s-%s-%s.png" % [current, next, front_height]))
			committed.save_png(folder.path_join("committed-%s-%s-%s.png" % [current, next, front_height]))
	quit(0 if failures == 0 else 1)
