extends SceneTree
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	root.size = Vector2i(1152,496)
	var level = load("res://scenes/level_two_preview.tscn").instantiate()
	level.preview_save_enabled = false
	root.add_child(level)
	await process_frame
	var l = level.layout
	l.cells = {Vector2i(0,0): "meadow", Vector2i(1,0): "stairs", Vector2i(2,0): "high_gold", Vector2i(3,0): "stairs", Vector2i(4,0): "high_meadow", Vector2i(4,1): "high_gold"}
	l.elevations = {Vector2i(3,0):64,Vector2i(4,0):128,Vector2i(4,1):64}
	l.stair_directions = {Vector2i(1,0):Vector2i.RIGHT,Vector2i(3,0):Vector2i.RIGHT}
	l.flora.clear()
	l.decorations.clear()
	level.rebuild_decorations()
	for frame in range(3):
		await process_frame
	await RenderingServer.frame_post_draw
	var img = root.get_texture().get_image()
	img.save_png("/tmp/edenia-raised-stairs.png")
	var shadow_layers: Dictionary = {}
	for node in level.get_children():
		if node.has_meta("terrain_shadow"):
			shadow_layers[node.shadow_height] = node
	var layered: bool = shadow_layers.size() == 2 and shadow_layers.has(64.0) and shadow_layers.has(128.0)
	if layered:
		layered = shadow_layers[64.0].z_index == -1 and shadow_layers[128.0].z_index == 0
		layered = layered and shadow_layers[128.0].get_index() > level.get_node("World").get_index()
		# Compare real rendering with the higher shadow hidden. This catches
		# shadows disappearing beneath the lower raised surfaces.
		shadow_layers[128.0].hide()
		await process_frame
		await RenderingServer.frame_post_draw
		var without_shadow = root.get_texture().get_image()
		var darkened := 0
		for y in range(176, 208):
			for x in range(768, 832):
				if img.get_pixel(x,y).get_luminance() < without_shadow.get_pixel(x,y).get_luminance() - 0.01:
					darkened += 1
		layered = layered and darkened > 0
		print("Higher shadow visible on lower platform: ", darkened, " pixels")
	var color = img.get_pixel(736,208)
	var supported: bool = absf(color.g - color.b) < 0.03 and color.g > color.r
	var view = load("res://scripts/terrain_view.gd").new()
	view.layout = l
	var joins: bool = view.cliff_region(Vector2i(3,0),64).position.x == 384
	var stacked: bool = view.cliff_region(Vector2i(4,0),128).position.y == 256
	view.free()
	supported = supported and joins and stacked and layered
	print("Raised stair support and cliff joins: ", "PASS" if supported else "FAIL", " pixel=",color)
	quit(0 if supported else 1)
