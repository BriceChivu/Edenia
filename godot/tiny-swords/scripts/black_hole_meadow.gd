extends RefCounted

const Layout = preload("res://scripts/terrain_layout.gd")

# Populated local testing fixture using real inventory, placement and save rules.
static func create():
	var layout = Layout.new()
	for level in range(2, 11): layout.unlock(level)
	layout.manual_ground_elevation = true
	layout.stock.meadow += 100
	layout.playground_grants.ground = 100
	for kind in ["tree", "chicken", "sheep"]:
		var amount := 10 if kind == "tree" else 6
		layout.stock[kind] += amount
		layout.playground_grants[kind] = amount
	layout.flora.clear()
	layout.decorations.clear()
	for y in range(-3, 4):
		for x in range(-5, 7):
			if not layout.cells.has(Vector2i(x, y)):
				place(layout, Vector2i(x, y), "ground", Vector2i(999, 999), 0)
	# Two raised landings with stairs sit above a wide receiving grass terrace.
	for ramp in [Vector2i(-2, -3), Vector2i(3, -3)]:
		place(layout, ramp, "stairs", Vector2i(999, 999))
	for cell in [Vector2i(-4, -2), Vector2i(4, -2)]:
		layout.resources.wood += 6
		layout.log_piles[Vector2i(5, 3)] = 6
		place(layout, cell, "house", Vector2i.ZERO)
	layout.log_piles.clear()
	for cell in [Vector2i(-5, -3), Vector2i(-2, -2), Vector2i(1, -3), Vector2i(6, -2), Vector2i(-5, 1), Vector2i(5, 1), Vector2i(-3, 3), Vector2i(2, 3), Vector2i(6, 3)]:
		if cell in [Vector2i(-3, 3), Vector2i(2, 3)]: layout.next_tree_variant = "tree4"
		place(layout, cell, "tree", Vector2i.ZERO)
	for cell in [Vector2i(-2, 0), Vector2i(2, 0), Vector2i(-4, 2), Vector2i(4, 2), Vector2i(0, 3), Vector2i(6, 0)]:
		place(layout, cell, "chicken", Vector2i.ZERO)
	for cell in [Vector2i(-3, 1), Vector2i(3, 1), Vector2i(-1, 2), Vector2i(1, 2), Vector2i(-5, 3), Vector2i(5, 3)]:
		place(layout, cell, "sheep", Vector2i.ZERO)
	# Keep an open central approach for testing the airborne lens.
	for y in range(0, 4):
		for x in range(-2, 3):
			layout.flora.erase(Vector2i(x, y))
			layout.decorations.erase(Vector2i(x, y))
	return layout

static func place(layout, cell: Vector2i, kind: String, occupied: Vector2i, height: float = -1.0) -> void:
	var placed: bool = layout.edit(cell, kind, occupied, height)
	if not placed: push_error("Portal meadow placement failed: %s at %s" % [kind, cell])
