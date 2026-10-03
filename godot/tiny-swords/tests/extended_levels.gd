extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	for entry in ["six", "seven", "eight", "nine", "ten"]:
		var world = load("res://previews/level_%s.tscn" % entry).instantiate()
		root.add_child(world)
		var target: int = ["six", "seven", "eight", "nine", "ten"].find(entry) + 6
		check(world.layout.level == target, "Fresh scene starts at level %s" % target)
		world.ui.celebrate()
		var popup: Control = world.ui.celebration
		check(popup.get_node("Title").text == "LEVEL %s" % target, "Correct reward title")
		check(popup.get_node("GroundCount").text == "+3", "Three grass reward")
		for hidden in ["StairsButton", "StairsCount", "PineReward", "PineCount"]:
			check(not popup.get_node(hidden).visible, "No ungranted reward shown")
		popup.get_node("BuildButton").pressed.emit()
		check(world.ui.celebration == null and not world.editing, "Confirmation closes popup and toggles editing")
		world.queue_free()
		await process_frame
	print("Extended level scene checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
