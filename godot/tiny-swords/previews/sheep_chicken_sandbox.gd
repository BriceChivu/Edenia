extends "res://previews/chicken_carry_sandbox.gd"

func _ready() -> void:
	super._ready()
	black_hole_enabled = false
	layout.sheep.assign([layout.center(Vector2i(-1, 0)), layout.center(Vector2i(3, 0))])
	var backdrop := PanelContainer.new()
	backdrop.position = Vector2(18, 14)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.12, 0.15, 0.9)
	style.set_content_margin_all(10.0)
	backdrop.add_theme_stylebox_override("panel", style)
	var panel := VBoxContainer.new()
	backdrop.add_child(panel)
	var help := Label.new()
	help.text = "Click a sheep to place the chicken. Click it again to carry."
	panel.add_child(help)
	var buttons := HBoxContainer.new()
	panel.add_child(buttons)
	for title in ["Carry chicken", "Next day", "Restart"]:
		var button := Button.new()
		button.text = title
		buttons.add_child(button)
		if title == "Carry chicken":
			button.pressed.connect(func():
				if layout.chicken_release_at > 0:
					layout.chicken_release_at = Time.get_unix_time_from_system() + chicken_carry.HOLD_SECONDS
				elif not layout.chickens.is_empty():
					chicken_carry.released_cell = Vector2i(999, 999)
					chicken_carry.pickup(0, Time.get_unix_time_from_system()))
		elif title == "Next day":
			button.pressed.connect(func(): sheep_chicken.advance(Time.get_unix_time_from_system(), preload("res://scripts/black_hole_state.gd").today() + 1))
		else:
			button.pressed.connect(func(): get_tree().reload_current_scene())
	ui.root.add_child(backdrop)
