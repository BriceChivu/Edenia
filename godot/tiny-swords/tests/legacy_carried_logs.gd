extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")

func _initialize() -> void:
	var original = Layout.new()
	for level in range(2, 8): original.unlock(level)
	original.resources.wood = 3
	original.carried_wood = 3
	var saved: Dictionary = JSON.parse_string(JSON.stringify(original.snapshot()))
	saved.version = 24
	saved.stock.chicken -= 1 # Version 24 predates the level-two chicken reward.
	var restored = Layout.new()
	if not restored.restore(saved) or restored.carried_wood != 3:
		push_error("Older islands with three carried logs must reload without loss")
		quit(1)
		return
	var again = Layout.new()
	if not again.restore(restored.snapshot()) or again.carried_wood != 3:
		push_error("Resaving migrated logs must retain reload compatibility")
		quit(1)
		return
	saved.resources.wood = 2
	if Layout.new().restore(saved):
		push_error("Carried logs still require matching harvested wood")
		quit(1)
		return
	print("Legacy carried-log reload checks passed")
	quit(0)
