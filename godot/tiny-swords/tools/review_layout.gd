extends "res://scripts/terrain_layout.gd"

# Review-only object identities allow several independently positioned objects on
# the same grass tile. The normal contact, navigation and drawing code is reused.
var review_points: Dictionary = {}
var review_kinds: Dictionary = {}

func register_object(id: int, kind: String, point: Vector2) -> Vector2i:
	var slot := Vector2i(1000 + id, 1000)
	review_points[slot] = point
	review_kinds[slot] = kind
	return slot

func center(cell: Vector2i) -> Vector2:
	if review_points.has(cell):
		var point: Vector2 = review_points[cell]
		return super.center(cell_at(point)) if review_kinds[cell] == "tree" else point
	return super.center(cell)

func tree_offset(cell: Vector2i) -> Vector2:
	if review_points.has(cell): return review_points[cell] - center(cell)
	return super.tree_offset(cell)

func height_at(cell: Vector2i) -> float:
	return super.height_at(cell_at(review_points[cell])) if review_points.has(cell) else super.height_at(cell)
