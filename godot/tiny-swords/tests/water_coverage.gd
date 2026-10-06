extends SceneTree

func _initialize() -> void:
	var level = load("res://scenes/level_one.tscn").instantiate()
	var water = level.get_node("Water")
	var water_bounds := Rect2(water.position, water.region_rect.size)
	var failures := 0
	var tile_color: Color = water.texture.get_image().get_pixel(0, 0)
	var clear_color: Color = ProjectSettings.get_setting("rendering/environment/defaults/default_clear_color")
	if not clear_color.is_equal_approx(tile_color):
		push_error("Clear background must match the actual water tile color")
		failures += 1
	# Minimum camera zoom, all pan extremes, and wide/tall logical viewports.
	for viewport_size in [Vector2(1152, 496), Vector2(3440, 1440), Vector2(1152, 2048)]:
		for pan in [Vector2.ZERO, Vector2(-768, -512), Vector2(768, 512), Vector2(-768, 512), Vector2(768, -512)]:
			var visible := Rect2(Vector2(576, 248) + pan - viewport_size, viewport_size * 2)
			if not water_bounds.encloses(visible):
				push_error("Water edge visible at minimum zoom: %s, pan %s" % [viewport_size, pan])
				failures += 1
	level.free()
	print("Water coverage: %s failures" % failures)
	quit(1 if failures else 0)
