extends RefCounted

# Old-reader fixtures need the actual pre-v38 shape, not a current snapshot
# with only its version label changed.
static func capture(layout) -> Dictionary:
	var saved: Dictionary = layout.snapshot()
	saved.chickens = []
	for point in layout.chickens: saved.chickens.append([point.x, point.y])
	saved.sheep = []
	for point in layout.sheep: saved.sheep.append([point.x, point.y])
	saved.erase("chicken_count")
	saved.erase("sheep_count")
	if not saved.house_build.is_empty():
		var point: Vector2 = layout.center(Vector2i(saved.house_build.x, saved.house_build.y))
		saved.house_build.pawn_x = point.x
		saved.house_build.pawn_y = point.y
	return saved
