extends SceneTree

var failures: int = 0

func _initialize() -> void:
	run.call_deferred()

func check(condition: bool, label: String) -> void:
	if not condition:
		failures += 1
		push_error(label)

func run() -> void:
	var level = load("res://scenes/level_one.tscn").instantiate()
	root.add_child(level)
	await process_frame
	check(level.has_node("World/Pawn"), "Movable pawn restored on the main island")
	check(level.get_node("Islands").get_child_count() == 5, "Small 2x2 island plus one small islet")
	check(level.get_node("Clouds").get_child_count() == 6, "Six clouds distributed over two drifting lanes")
	check(level.get_node("WaterRocks").get_child_count() == 2, "Two water rocks")
	check(ProjectSettings.get_setting("display/window/stretch/aspect") == "expand", "Expand view fills wide frames without letterboxing")
	check(ProjectSettings.get_setting("display/window/size/viewport_width") == 1152, "Wider logical view avoids enlarging the small patch")
	var foam = level.get_node("ShoreFoam/MainNW")
	var rock = level.get_node("WaterRocks/WestRock")
	var cloud = level.get_node("Clouds/WestCloud")
	var original_frame: int = foam.frame
	var original_rock_frame: int = rock.frame
	cloud.set_altitude(0.1)
	check(cloud.z_index == 100, "Low cloud body uses shadow-based occlusion")
	var low_scale: float = cloud.scale.x
	var low_opacity: float = cloud.shadow_sprite.material.get_shader_parameter("opacity")
	var low_shadow_height: float = cloud.shadow_sprite.scale.y
	cloud.set_altitude(0.9)
	check(cloud.z_index == 100, "Altitude does not select a different depth layer")
	check(cloud.shadow_sprite.position.y * cloud.scale.y > 80 and cloud.shadow_sprite.material.get_shader_parameter("opacity") < low_opacity, "High clouds have farther fainter shadows")
	check(cloud.scale.x > low_scale * 1.2, "High clouds look closer and larger")
	check(cloud.shadow_sprite.scale.y < low_shadow_height, "More distant shadows flatten vertically")
	for moving_cloud in level.get_node("Clouds").get_children():
		moving_cloud.set_altitude(1.0)
		check(moving_cloud.scale.x >= 1.0 and moving_cloud.scale.x <= 1.351, "Cloud enlargement stays bounded")
	var all_clouds: Array = level.get_node("Clouds").get_children()
	all_clouds.append(level.get_node("PassingCloud"))
	for moving_cloud in all_clouds:
		for height in [0.0, 0.3, 0.7, 1.0]:
			moving_cloud.set_altitude(height)
			check(moving_cloud.baked_shadow_offset.y > 0 and moving_cloud.shadow_sprite.position.y >= 0, "Shadow always stays below cloud with at least original PNG spacing")
			if height == 0.0:
				check(moving_cloud.shadow_sprite.position.is_equal_approx(moving_cloud.baked_shadow_offset + moving_cloud.shadow_center * (Vector2.ONE - moving_cloud.shadow_sprite.scale)), "Minimum cloud height preserves original PNG shadow placement exactly")
	var seen := {}
	for variant in range(8):
		cloud.set_variant(variant)
		cloud.set_altitude(1.0)
		check(cloud.texture == cloud.VARIANTS[variant] and cloud.shadow_sprite.texture == cloud.SHADOW_VARIANTS[variant], "Each variant supplies its separate body and matching shadow")
		if cloud.texture.get_image().get_used_rect().size.x < 400:
			check(cloud.scale == Vector2.ONE and cloud.altitude <= 0.3 and cloud.z_index == 100, "Small source art stays small and low")
	# Both regular and rare paths use the same source-pixel sizing contract.
	for subject in [cloud, level.get_node("PassingCloud")]:
		for variant in range(8):
			subject.set_variant(variant)
			for height in [0.0, 0.3, 0.7, 1.0]:
				subject.set_altitude(height)
				var large: bool = subject.texture.get_image().get_used_rect().size.x >= 400
				check(subject.scale.x >= 1.0 and subject.scale.x <= 1.35001 if large else subject.scale == Vector2.ONE, "Large artwork is native or larger; smaller artwork is exactly native")
				check(subject.global_scale.is_equal_approx(subject.scale) and is_equal_approx(subject.shadow_sprite.global_scale.x, subject.scale.x), "Clouds and shadows retain native horizontal sizing")
				check(subject.shadow_sprite.scale.y >= 0.11999 and subject.shadow_sprite.scale.y <= 0.72001, "Shadow flattening stays bounded")
				check(float(subject.shadow_sprite.material.get_shader_parameter("opacity")) >= 0.17999, "Distant cloud shadows retain a visible minimum opacity")
				var reference_y: float = [146.0, 148.0, 134.0, 134.0, 149.0, 144.0, 131.0, 126.0][variant]
				var local_anchor := Vector2(subject.shadow_center.x, reference_y - 128.0)
				var expected_anchor: Vector2 = subject.to_global(local_anchor * subject.shadow_sprite.scale + subject.shadow_sprite.position)
				check(subject.shadow_ground_position().is_equal_approx(expected_anchor), "Cloud depth follows the annotated line on each transformed shadow")
	# Objects on opposite sides of the annotated ground line must switch occlusion.
	var depth_probe := Sprite2D.new()
	depth_probe.texture = cloud.VARIANTS[0]
	level.get_node("World").add_child(depth_probe)
	for variant in range(8):
		cloud.set_variant(variant)
		for height in [0.0, 1.0]:
			cloud.set_altitude(height)
			depth_probe.global_position = cloud.shadow_ground_position() + Vector2(0.0, 1.0)
			cloud.update_depth_mask()
			check(cloud.depth_occluders.has(depth_probe), "Object below the annotated shadow line covers the cloud")
			depth_probe.global_position.y -= 2.0
			cloud.update_depth_mask()
			check(not cloud.depth_occluders.has(depth_probe), "Cloud covers objects above the annotated shadow line")
	depth_probe.queue_free()
	var boundary_camera := Camera2D.new()
	boundary_camera.position = Vector2(900.0, 248.0)
	level.add_child(boundary_camera)
	boundary_camera.make_current()
	for zoom in [0.5, 0.8, 1.5]:
		boundary_camera.zoom = Vector2.ONE * zoom
		var bounds: Vector2 = cloud.crossing_bounds()
		var half_canvas: float = cloud.texture.get_width() * cloud.scale.x / 2.0
		var half_view: float = cloud.get_viewport_rect().size.x / 0.5 / 2.0
		check(is_equal_approx(bounds.x + half_canvas, 900.0 - half_view) and is_equal_approx(bounds.y - half_canvas, 900.0 + half_view), "Cloud transitions stay at the widest view edges across camera zoom and pan")
	boundary_camera.free()
	cloud.set_variant(0)
	for cycle in range(8):
		seen[cloud.variant_index] = true
		cloud.global_position.x = cloud.crossing_bounds().y + 1.0
		cloud._process(0.0)
	check(seen.size() == 8, "Real offscreen wrap uses all eight cloud variants")
	cloud.position.x = 100.0
	var original_x: float = cloud.position.x
	await create_timer(0.45).timeout
	check(foam.frame != original_frame, "Shore foam advances")
	check(rock.frame != original_rock_frame, "Water rock ripples advance")
	check(cloud.position.x > original_x, "Cloud drifts")
	# Fast-forward a full cycle and verify clouds never all leave the view.
	for step in range(240):
		var visible_clouds := 0
		for moving_cloud in level.get_node("Clouds").get_children():
			moving_cloud._process(10.0)
			var half_width: float = moving_cloud.texture.get_width() * moving_cloud.scale.x / 2
			var half_view: float = moving_cloud.get_viewport_rect().size.x / 0.5 / 2.0
			if moving_cloud.position.x + half_width > 576.0 - half_view and moving_cloud.position.x - half_width < 576.0 + half_view:
				visible_clouds += 1
		check(visible_clouds >= 1, "Clouds remain present in the widest view as their speeds vary")
	check(load("res://scenes/pawn_playground.tscn") != null, "Reusable pawn playground preserved")
	var passing = level.get_node("PassingCloud")
	passing.set_process(false)
	check(not passing.visible, "Center cloud starts absent")
	passing.wait_remaining = 90.0
	passing._process(89.0)
	check(not passing.visible, "No frequent center cloud at startup")
	passing._process(2.0)
	check(passing.visible and passing.z_index > 0, "Rare cloud passes in front of terrain and pawn")
	passing._process(abs(576.0 - passing.position.x) / passing.speed)
	check(abs(passing.position.x - 576.0) < 1.0, "Rare cloud crosses the main island")
	passing._process((passing.crossing_bounds().y - passing.crossing_bounds().x) / passing.speed + 1.0)
	check(not passing.visible and passing.wait_remaining >= 360.0, "Cloud leaves before a long quiet interval")
	print("Environment checks: ", "PASS" if failures == 0 else "FAIL (%s)" % failures)
	quit(0 if failures == 0 else 1)
