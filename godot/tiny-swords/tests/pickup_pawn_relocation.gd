extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var world = preload("res://scenes/level_two_preview.tscn").instantiate()
	world.preview_save_enabled = false
	world.camera_save_enabled = false
	world.island_start_enabled = false
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = true
	world.selected = "remove"
	for kind in ["ground", "tree", "chicken", "sheep", "house", "stairs", "landing"]:
		world.layout = Layout.new()
		world.layout.level = 5
		var target := Vector2i(3, 2)
		var occupied := target
		if kind == "tree":
			world.layout.trees[target] = Vector2.ZERO
		elif kind == "chicken":
			world.layout.chickens.append(world.layout.center(target))
		elif kind == "sheep":
			world.layout.sheep.append(world.layout.center(target))
		elif kind == "house":
			world.layout.houses[target] = 1
			var free: Array[Vector2i] = []
			for square in world.layout.house_cells(target):
				world.layout.cells[square] = "high_meadow"
				world.layout.elevations[square] = 128
				free.append(square)
			world.layout.house_free_tiles[target] = free
			world.layout.free_house_grass = free.size()
		elif kind in ["stairs", "landing"]:
			world.layout.cells[target] = "stairs"
			world.layout.stair_directions[target] = Vector2i.RIGHT
			world.layout.cells[target + Vector2i.RIGHT] = "high_meadow"
			world.layout.elevations[target + Vector2i.RIGHT] = 64
			if kind == "landing":
				occupied += Vector2i.RIGHT
		world.pawn.position = world.layout.center(occupied)
		var old_position: Vector2 = world.pawn.position
		world.pawn.walk_to(old_position + Vector2(20, 0))
		world.waypoints.assign([old_position + Vector2(40, 0)])
		world.terrain.layout = world.layout
		world.update_inventory_preview(world.layout.center(target) - Vector2(0, world.layout.height_at(target)))
		if kind == "house":
			world.update_inventory_preview(world.LevelFiveArt.house_rect(world.layout, target).get_center())
			check(world.terrain.valid, "Visible raised-house pickup cursor stays valid with pawn on foundation")
		check(world.layout.can_edit(target, "remove", occupied), kind + " pickup ignores pawn occupancy")
		check(world.apply_edit(target), kind + " pickup succeeds under pawn")
		check(world.pawn.position != old_position and world.layout.walkable_point(world.pawn.position), kind + " pickup moves pawn onto safe ground")
		check(world.waypoints.is_empty() and world.pawn.destination == world.pawn.position, kind + " pickup cancels the old walking route")
		if kind == "house":
			check(world.layout.houses.is_empty() and world.layout.resources.wood == 6, "House pickup still returns six logs")
		elif kind == "ground":
			check(not world.layout.cells.has(target), "Ground beneath pawn is collected")
	# A pawn occupying the only refund tile must not prevent house pickup.
	var layout = Layout.new()
	layout.level = 5
	var house := Vector2i(6, 3)
	layout.cells.clear()
	layout.cells[Vector2i.ZERO] = "meadow"
	layout.houses[house] = 1
	var free: Array[Vector2i] = []
	for square in layout.house_cells(house):
		layout.cells[square] = "meadow"
		free.append(square)
	layout.house_free_tiles[house] = free
	check(layout.can_edit(house, "remove", Vector2i.ZERO) and layout.edit(house, "remove", Vector2i.ZERO), "Pawn on only surviving refund tile does not block house pickup")
	check(layout.log_piles.get(Vector2i.ZERO) == 6, "Six logs refunded on pawn's former tile")
	# Exercise the same refund-only case through the live edit/relocation seam.
	world.layout = Layout.new()
	world.layout.level = 5
	world.layout.cells.clear()
	world.layout.cells[Vector2i.ZERO] = "meadow"
	world.layout.houses[house] = 1
	for square in free:
		world.layout.cells[square] = "meadow"
	world.layout.house_free_tiles[house] = free
	world.layout.free_house_grass = free.size()
	world.pawn.position = world.layout.center(Vector2i.ZERO)
	var refund_position: Vector2 = world.pawn.position
	check(world.apply_edit(house), "House pickup succeeds with pawn on only refund tile")
	check(world.pawn.position != refund_position and world.layout.walkable_point(world.pawn.position), "Pawn relocates away from refunded logs even on a one-tile island")
	# An unrelated pickup preserves the pawn's position and route.
	world.layout = Layout.new()
	world.layout.level = 5
	world.pawn.position = world.layout.center(Vector2i.ZERO)
	world.pawn.walk_to(world.layout.center(Vector2i(1, 0)))
	var destination: Vector2 = world.pawn.destination
	check(world.apply_edit(Vector2i(3, 2)) and world.pawn.position == world.layout.center(Vector2i.ZERO) and world.pawn.destination == destination, "Unrelated pickup preserves pawn movement")
	world.layout.cells.clear()
	world.layout.cells[Vector2i.ZERO] = "meadow"
	check(not world.layout.can_edit(Vector2i.ZERO, "remove", Vector2i(999, 999)), "Last grass is protected independently of pawn occupancy")
	world.queue_free()
	await process_frame
	print("Pickup pawn relocation checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
