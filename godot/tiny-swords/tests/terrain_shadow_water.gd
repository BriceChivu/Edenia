extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const View = preload("res://scripts/terrain_view.gd")

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(1152, 496)
	var background := ColorRect.new()
	background.color = Color("47aba9")
	background.size = Vector2(1152, 496)
	background.z_index = -20
	root.add_child(background)
	var layout = Layout.new()
	# Mixed grass/water cliff foot, plus a stair with grass below its foot.
	layout.cells = {Vector2i.ZERO: "high_gold", Vector2i.RIGHT: "meadow", Vector2i(3, 0): "stairs", Vector2i(3, 1): "meadow"}
	layout.stair_directions = {Vector2i(3, 0): Vector2i.RIGHT}
	var ground = View.new()
	ground.layout = layout
	ground.z_index = -16
	root.add_child(ground)
	ground.set_process(false) # Freeze foam while comparing shadow visibility.
	var shadows = View.new()
	shadows.layout = layout
	shadows.shadow_height = 64
	shadows.z_index = -1
	root.add_child(shadows)
	for cell in [Vector2i.ZERO, Vector2i(3, 0)]:
		var piece = View.new()
		piece.layout = layout
		piece.piece = cell
		root.add_child(piece)
	await process_frame
	await RenderingServer.frame_post_draw
	var shaded = root.get_texture().get_image()
	shaded.save_png("/tmp/edenia-shadow-water.png")
	shadows.hide()
	await process_frame
	await RenderingServer.frame_post_draw
	var plain = root.get_texture().get_image()
	var water_changed := 0
	var grass_shaded := 0
	var stair_grass_shaded := 0
	for y in range(144, 288):
		for x in range(480, 800):
			var before = plain.get_pixel(x, y)
			var after = shaded.get_pixel(x, y)
			if before.is_equal_approx(background.color) and not after.is_equal_approx(before):
				water_changed += 1
			if after.get_luminance() < before.get_luminance() - 0.03:
				if x >= 704 and y >= 240:
					stair_grass_shaded += 1
				elif x >= 576 and x < 640:
					grass_shaded += 1
	print("Terrain shadow receivers: water changed=", water_changed, ", cliff grass shaded=", grass_shaded, ", stair grass shaded=", stair_grass_shaded)
	quit(0 if water_changed == 0 and grass_shaded > 50 and stair_grass_shaded > 50 else 1)
