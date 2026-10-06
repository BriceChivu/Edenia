extends SceneTree

# Run with a renderer (without --headless) to check the actual source pixels.
class RampProbe extends "res://scripts/terrain_view.gd":
	var preview := false
	func _draw() -> void:
		if preview:
			draw_stair_preview(Color.WHITE)
		else:
			draw_tile(Vector2i.ZERO, "stairs")

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(256, 192)
	root.content_scale_size = Vector2i.ZERO
	var custom: Image = load("res://assets/terrain/stair-ramp-water.png").get_image()
	var atlas: Image = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color1.png").get_image()
	var failures := 0
	var checked := 0
	for direction in [Vector2i.LEFT, Vector2i.RIGHT]:
		for below in ["water", "meadow", "stairs"]:
			for preview in [false, true]:
				var layout = load("res://scripts/terrain_layout.gd").new()
				layout.cells = {-direction: "meadow"}
				if below != "water":
					layout.cells[Vector2i.DOWN] = below
				if not preview:
					layout.cells[Vector2i.ZERO] = "stairs"
					layout.stair_directions[Vector2i.ZERO] = direction
				var probe := RampProbe.new()
				probe.layout = layout
				probe.preview = preview
				probe.hover = Vector2i.ZERO
				probe.position = Vector2(-480, -96)
				probe.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
				root.add_child(probe)
				await process_frame
				await RenderingServer.frame_post_draw
				var rendered := root.get_texture().get_image()
				var expected := atlas.get_region(Rect2i(0 if direction == Vector2i.RIGHT else 192, 256, 64, 128))
				if below == "water":
					var edge := custom.duplicate()
					if direction == Vector2i.RIGHT:
						edge.flip_x()
					expected.blit_rect(edge, Rect2i(0, 112, 64, 16), Vector2i(0, 112))
				var before := failures
				for y in range(128):
					for x in range(64):
						var pixel: Color = expected.get_pixel(x, y)
						if pixel.a < 0.99:
							continue
						checked += 1
						var actual := rendered.get_pixel(32 + x, 16 + y)
						if absf(actual.r - pixel.r) > 0.01 or absf(actual.g - pixel.g) > 0.01 or absf(actual.b - pixel.b) > 0.01:
							failures += 1
				if failures > before:
					print("Mismatch case: ", direction, " ", below, " preview=", preview, " mismatches=", failures-before)
					rendered.save_png("/tmp/water-stair-failure.png")
				probe.free()
	print("Water stair art (both directions, water/ground/stairs below, placed/preview): ", failures, " mismatches among ", checked, " pixels")
	quit(0 if failures == 0 and checked > 10000 else 1)
