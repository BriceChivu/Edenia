extends SceneTree
const Cloud = preload("res://scripts/cloud_visual.gd")
const Metadata = preload("res://assets/clouds/cloud_metadata.gd")
var failures := 0

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _initialize() -> void:
	var cloud = Cloud.new()
	# Compare the baked geometry against the old runtime pixel classification,
	# using imported textures too: import changes must not shift cloud shadows.
	for variant in 8:
		var pixels: Image = Cloud.ORIGINAL_VARIANTS[variant].get_image()
		var body_sum := Vector2.ZERO
		var shadow_sum := Vector2.ZERO
		var body_count := 0
		var shadow_count := 0
		for y in pixels.get_height():
			for x in pixels.get_width():
				var color := pixels.get_pixel(x, y)
				if color.a < 0.1:
					continue
				if color.get_luminance() < 0.52:
					shadow_sum += Vector2(x, y)
					shadow_count += 1
				else:
					body_sum += Vector2(x, y)
					body_count += 1
		cloud.set_variant(variant)
		check(cloud.baked_shadow_offset.is_equal_approx(shadow_sum / shadow_count - body_sum / body_count), "Cloud shadow offset changed")
		check(cloud.shadow_center.is_equal_approx(body_sum / body_count - Vector2(cloud.texture.get_size()) / 2.0), "Cloud shadow anchor changed")
		var width: int = Cloud.VARIANTS[variant].get_image().get_used_rect().size.x
		check(Metadata.VARIANTS[variant].body_width == width, "Cloud painted width changed")
		for mirrored in [false, true]:
			cloud.set_mirrored(mirrored)
			cloud.set_altitude(1.0)
			check(is_equal_approx(cloud.altitude, 1.0 if width >= 400 else 0.3), "Cloud altitude limit changed")
			check(cloud.scale.is_equal_approx(Vector2.ONE * (1.35 if width >= 400 else 1.0)), "Cloud body scale changed")
	var started := Time.get_ticks_usec()
	for repeat in 3:
		for variant in 8:
			cloud.set_variant(variant)
	var elapsed := (Time.get_ticks_usec() - started) / 1000.0
	check(elapsed < 100, "Cloud variant changes still scan images: %s ms" % elapsed)
	cloud.free()
	print("Cloud geometry parity and preparation: ", "PASS" if failures == 0 else "FAIL", " (24 changes: ", elapsed, " ms)")
	quit(0 if failures == 0 else 1)
