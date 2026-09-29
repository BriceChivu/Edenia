extends Node2D

const GRASS_BOUNDS := Rect2(128, 64, 128, 128)
const FOOT_MARGIN := Vector2(8, 8)
const CURSOR := preload("res://art/Cursor_02.png")

func _ready() -> void:
	Input.set_custom_mouse_cursor(CURSOR, Input.CURSOR_ARROW, Vector2(24, 17))

func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var point: Vector2 = get_global_transform_with_canvas().affine_inverse() * event.position
		if GRASS_BOUNDS.has_point(point):
			$Pawn.walk_to(point.clamp(GRASS_BOUNDS.position + FOOT_MARGIN,
				GRASS_BOUNDS.end - FOOT_MARGIN))
