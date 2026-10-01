extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> bool:
	if not ok:
		push_error(message)
		quit(1)
	return ok

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	level.set_process(false)
	level.pawn.set_physics_process(false)
	level.editing = true
	level.selected = "ground"
	var layout = level.layout
	var upper := Vector2i.ZERO
	var terrace := Vector2i(1,1)
	var grass := Vector2i(1,-1)
	var target := Vector2i(1,0)
	layout.cells = {upper:"high_meadow", Vector2i.DOWN:"high_gold", terrace:"high_gold", grass:"meadow"}
	layout.elevations = {upper:128, Vector2i.DOWN:64, terrace:64, grass:0}
	layout.trees.clear()
	layout.flora = {grass:2}
	layout.decorations.clear()
	layout.manual_ground_elevation = true
	# Four authored cells plus remaining pooled rewards total level three's 15.
	layout.stock.meadow += 1
	var initial: Dictionary = layout.snapshot()
	assert(layout.restore(initial))
	level.pawn.position = layout.center(Vector2i.DOWN)
	var point: Vector2 = layout.center(grass)
	var option: Dictionary = level.ground_placement_at(point)
	if not check(option.height == 64, "Visible grass must offer the adjoining floor-one terrace rather than an invalid cursor"):
		return
	assert(option.cell == grass)
	level.terrain.hover = grass
	level.terrain.tool = "ground"
	level.terrain.ground_preview_height = option.height
	level.terrain.preview_position = point
	var preview_cell: Vector2i = level.terrain.grass_preview_cell()
	assert(preview_cell == target)
	var preview_center: Vector2 = layout.center(preview_cell) - Vector2(0,option.height) + level.terrain.placement_offset()
	assert(preview_center == point, "The receiving-floor continuation keeps the grass top in its visible square")
	var stock: Dictionary = layout.stock.duplicate()
	var tiles: int = layout.cells.size()
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = level.get_global_transform_with_canvas() * point
	level.handle_world_click(click)
	assert(not layout.cells.has(grass) and layout.height_at(target) == 64)
	assert(layout.cells.size() == tiles and layout.stock == stock and layout.flora.get(target) == 2)
	assert(layout.can_cross(target,terrace), "Continued grass connects to the visible lower terrace")
	var continued: Dictionary = layout.snapshot()
	assert(layout.restore(continued) and layout.snapshot() == continued, "Save preserves the continued footprint and flora")
	option = level.ground_placement_at(point)
	assert(option.cell == target and option.height == 128, "The following click can extend the upper platform")
	level.terrain.hover = target
	level.terrain.ground_preview_height = option.height
	assert(layout.center(target)-Vector2(0,128)+level.terrain.placement_offset() == point-Vector2(0,64))
	level.handle_world_click(click)
	assert(layout.height_at(target) == 128 and layout.stock == stock)
	assert(layout.can_cross(target,upper))
	assert(layout.height_at(target)-layout.height_at(terrace) == 64, "Exactly one cliff faces the receiving terrace")
	assert(layout.restore(layout.snapshot()) and layout.height_at(target) == 128)
	level.undo()
	assert(layout.snapshot() == continued)
	level.undo()
	assert(layout.snapshot() == initial, "Undo restores the original water-level footprint and inventory")
	var decorated = Layout.new()
	assert(decorated.restore(initial))
	decorated.flora.erase(grass)
	decorated.decorations[grass] = {"kind":"bush", "variant":1}
	assert(decorated.edit(grass,"ground",Vector2i.DOWN,64))
	assert(decorated.decorations.get(target,{}).get("kind") == "bush")
	assert(decorated.restore(decorated.snapshot()), "Land decorations remain valid after the move")
	assert(decorated.restore(initial))
	decorated.flora.erase(grass)
	decorated.decorations[grass] = {"kind":"water_rock", "variant":1, "water":grass+Vector2i.RIGHT}
	assert(decorated.edit(grass,"ground",Vector2i.DOWN,64))
	assert(not decorated.decorations.has(target))
	assert(decorated.restore(decorated.snapshot()), "Continuation cannot leave an invalid aquatic decoration reference")
	# No receiving terrace, a blocked destination, and stair endpoints stay invalid.
	var blocked = Layout.new()
	blocked.cells = {upper:"high_meadow", grass:"meadow"}
	blocked.elevations = {upper:128, grass:0}
	assert(blocked.next_ground_height(grass) == -1)
	blocked.cells[terrace] = "high_gold"
	blocked.elevations[terrace] = 64
	blocked.cells[target] = "stairs"
	assert(blocked.next_ground_height(grass) == -1)
	blocked.cells.erase(target)
	blocked.elevations.erase(target)
	assert(not blocked.can_edit(grass,"ground",grass,64), "A continuation cannot relocate occupied grass")
	blocked.cells[grass+Vector2i.LEFT] = "stairs"
	blocked.stair_directions[grass+Vector2i.LEFT] = Vector2i.RIGHT
	assert(blocked.next_ground_height(grass) == -1)
	print("Visible ground extension: PASS")
	quit()
