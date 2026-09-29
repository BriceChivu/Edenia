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
	var original_x: float = cloud.position.x
	await create_timer(0.45).timeout
	check(foam.frame != original_frame, "Shore foam advances")
	check(rock.frame != original_rock_frame, "Water rock ripples advance")
	check(cloud.position.x > original_x, "Cloud drifts")
	# Fast-forward a full cycle and verify clouds never all leave the view.
	for step in range(60):
		var visible_clouds := 0
		for moving_cloud in level.get_node("Clouds").get_children():
			moving_cloud._process(10.0)
			if moving_cloud.position.x > 0 and moving_cloud.position.x < 1152:
				visible_clouds += 1
		check(visible_clouds >= 4, "At least four cloud centers remain in view throughout the cycle")
	check(load("res://scenes/pawn_playground.tscn") != null, "Reusable pawn playground preserved")
	var passing = level.get_node("PassingCloud")
	passing.set_process(false)
	check(not passing.visible, "Center cloud starts absent")
	passing._process(89.0)
	check(not passing.visible, "No frequent center cloud at startup")
	passing._process(2.0)
	check(passing.visible and passing.z_index > 0, "Rare cloud passes in front of terrain and pawn")
	passing._process(37.8)
	check(abs(passing.position.x - 576.0) < 1.0, "Rare cloud crosses the main island")
	passing._process(40.0)
	check(not passing.visible and passing.wait_remaining >= 180.0, "Cloud leaves before a long quiet interval")
	print("Environment checks: ", "PASS" if failures == 0 else "FAIL (%s)" % failures)
	quit(0 if failures == 0 else 1)
