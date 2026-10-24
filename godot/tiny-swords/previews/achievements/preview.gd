extends "res://previews/chicken_run_sandbox.gd"

func _ready() -> void:
	super._ready()
	playground_enabled = false
	var draft := preload("res://previews/achievements/achievements_draft.tscn").instantiate()
	ui.root.add_child(draft)
	# Match the real cogwheel, including its idle opacity and hover treatment.
	var button: Button = draft.get_node("AchievementButton")
	button.visible = ui.launch.visible
	ui.launch.visibility_changed.connect(func(): button.visible = ui.launch.visible)
	for state in ["normal", "hover", "pressed", "focus", "hover_pressed"]:
		button.add_theme_color_override("icon_" + state + "_color", ui.launch.get_theme_color("icon_" + state + "_color"))
