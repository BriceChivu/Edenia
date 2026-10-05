extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	for kind in level.layout.KINDS:
		level.layout.stock[kind] = 0
	level.ui.refresh(true, "ground", false)
	var ground: Button = level.ui.buttons["ground"]
	for state in ["normal", "hover", "pressed", "focus", "hover_pressed"]:
		if not is_equal_approx(ground.get_theme_color("icon_" + state + "_color").a, 0.25):
			push_error("Zero-stock grass must stay faded even while hovered or pressed")
			quit(1)
			return
	assert(not ground.disabled, "Ground remains selectable for free transformations")
	level.layout.stock["meadow"] = 1
	level.ui.refresh(true, "ground", false)
	for state in ["normal", "hover", "pressed", "focus", "hover_pressed"]:
		assert(is_equal_approx(ground.get_theme_color("icon_" + state + "_color").a, 1.0), "Restocking restores the grass icon")
	print("Inventory opacity: PASS")
	quit()
