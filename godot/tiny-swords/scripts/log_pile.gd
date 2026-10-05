extends Node2D

var layout
var cell: Vector2i
var pawn: Node2D

func _process(_delta: float) -> void:
	update_depth()

func update_depth() -> void:
	# Pawn drawing has its own foot-depth offset. Compensate it so the
	# comparison uses the movement/ground plane on both sides of the pile.
	var next_y: float = layout.log_depth_y(cell, pawn.position.x) + pawn.FOOT_DEPTH_Y
	var shift := position.y - next_y
	position.y = next_y
	for sprite: Sprite2D in get_children():
		sprite.position.y += shift
