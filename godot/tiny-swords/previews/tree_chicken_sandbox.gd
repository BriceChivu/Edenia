extends "res://previews/chicken_carry_sandbox.gd"

func _ready() -> void:
	super._ready()
	black_hole_enabled = false
	# One nearby Tree 1, plus the existing terrain and animal fixtures.
	layout.trees[Vector2i(-1, 0)] = Vector2.ZERO
	layout.tree_types[Vector2i(-1, 0)] = "tree"
	layout.trees[Vector2i(3, 0)] = Vector2.ZERO
	layout.tree_types[Vector2i(3, 0)] = "tree"
	rebuild_decorations()
	var help := Label.new()
	help.text = "Carrying a chicken: click Tree 1 to place it. Click the occupied tree to retrieve it."
	help.position = Vector2(18, 14)
	ui.root.add_child(help)
