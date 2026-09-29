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
	check(cloud.z_index < level.get_node("World").z_index, "Low clouds stay behind trees and pawn")
	var low_scale: float = cloud.scale.x
	var low_opacity: float = cloud.shadow_sprite.material.get_shader_parameter("opacity")
	cloud.set_altitude(0.9)
	check(cloud.z_index > level.get_node("World").z_index, "High clouds may cover the world")
	check((cloud.shadow_sprite.position.y + cloud.baked_shadow_offset.y) * cloud.scale.y > 80 and cloud.shadow_sprite.material.get_shader_parameter("opacity") < low_opacity, "High clouds have farther fainter shadows")
	check(cloud.scale.x > low_scale * 1.5, "High clouds look closer and larger")
	for moving_cloud in level.get_node("Clouds").get_children():
		moving_cloud.set_altitude(1.0)
		check(moving_cloud.scale.x <= 1.351, "Cloud enlargement stays bounded")
	var all_clouds: Array = level.get_node("Clouds").get_children()
	all_clouds.append(level.get_node("PassingCloud"))
	for moving_cloud in all_clouds:
		for height in [0.0, 0.3, 0.7, 1.0]:
			moving_cloud.set_altitude(height)
			check(moving_cloud.baked_shadow_offset.y > 0 and moving_cloud.shadow_sprite.position.y >= 0, "Shadow always stays below cloud with at least original PNG spacing")
			if height == 0.0:
				check(moving_cloud.shadow_sprite.position == Vector2.ZERO, "Minimum cloud height preserves original PNG shadow placement exactly")
	var seen := {}
	for variant in range(8):
		cloud.set_variant(variant)
		cloud.set_altitude(1.0)
		check(cloud.texture == cloud.VARIANTS[variant] and cloud.shadow_sprite.texture == cloud.texture, "Each original variant supplies its body and matching shadow")
		if cloud.texture.get_image().get_used_rect().size.x < 400:
			check(cloud.scale.x <= 1.0 and cloud.altitude <= 0.3 and cloud.z_index < 0, "Small source art stays small and low")
	cloud.set_variant(0)
	for cycle in range(8):
		seen[cloud.variant_index] = true
		cloud.position.x = 1600.0
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
			if moving_cloud.position.x + half_width > 0 and moving_cloud.position.x - half_width < 1152:
				visible_clouds += 1
		check(visible_clouds >= 1, "Clouds remain present as their speeds vary")
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
	passing._process(110.0)
	check(not passing.visible and passing.wait_remaining >= 360.0, "Cloud leaves before a long quiet interval")
	print("Environment checks: ", "PASS" if failures == 0 else "FAIL (%s)" % failures)
	quit(0 if failures == 0 else 1)
