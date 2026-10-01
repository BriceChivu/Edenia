extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	level.set_process(false)
	level.pawn.set_physics_process(false)
	level.editing = true
	level.selected = "ground"
	var layout = level.layout
	# Upper platform, receiving terrace, lower platform on the right, shore.
	layout.cells = {Vector2i.ZERO:"high_meadow", Vector2i.DOWN:"high_gold", Vector2i(1,1):"high_gold", Vector2i(2,0):"high_gold", Vector2i(1,2):"meadow", Vector2i(2,1):"meadow"}
	layout.elevations = {Vector2i.ZERO:128, Vector2i.DOWN:64, Vector2i(1,1):64, Vector2i(2,0):64}
	layout.trees.clear()
	layout.flora.clear()
	layout.decorations.clear()
	level.pawn.position = layout.center(Vector2i(1,2))
	var target := Vector2i(1,0)
	assert(layout.ground_options(target) == [0.0,64.0,128.0])
	var upper_point: Vector2 = layout.center(target) - Vector2(24,128)
	var lower_point: Vector2 = layout.center(target) - Vector2(-24,64)
	var shore := Vector2i(2,2)
	var shore_point: Vector2 = layout.center(shore)
	var upper: Dictionary = level.ground_placement_at(upper_point)
	var lower: Dictionary = level.ground_placement_at(lower_point)
	var water: Dictionary = level.ground_placement_at(shore_point)
	assert(upper.cell == target and upper.height == 128, "Near upper surface offers floor two")
	assert(lower.cell == target and lower.height == 64, "Near lower surface offers floor one at the same footprint")
	assert(water.cell == shore and water.height == 0, "Near shore offers water-level grass")
	assert(level.clicked_cell(upper_point) == upper.cell and level.clicked_cell(lower_point) == lower.cell)
	# Selection is independent of camera zoom because it uses world coordinates.
	level.game_camera.zoom = Vector2(1.7,1.7)
	assert(level.ground_placement_at(lower_point) == lower)
	var stock: int = layout.ground_count()
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = level.get_global_transform_with_canvas() * lower_point
	level.handle_world_click(click)
	assert(layout.height_at(target) == 64, "Click places the previewed lower option rather than the highest neighbor")
	assert(layout.ground_count() == stock - 1, "One placed grass consumes one tile")
	layout.cells.erase(target)
	layout.elevations.erase(target)
	# No receiving terrace means floor two would create two stacked cliffs.
	layout.cells.erase(Vector2i(1,1))
	layout.elevations.erase(Vector2i(1,1))
	assert(128.0 not in layout.ground_options(target))
	var before: Dictionary = layout.snapshot()
	assert(not layout.edit(target, "ground", Vector2i(1,2), 128))
	assert(layout.snapshot() == before, "Forbidden option cannot spend inventory or mutate terrain")
	assert(level.ground_placement_at(upper_point).height != 128, "Forbidden floor two is never previewed")
	# Stair endpoints cannot be transformed even when a higher neighbor is nearby.
	layout.cells[Vector2i(-1,0)] = "stairs"
	layout.stair_directions[Vector2i(-1,0)] = Vector2i.RIGHT
	assert(layout.ground_options(Vector2i.ZERO).is_empty())
	# Empty inventory still permits existing grass transformations, but no new tile.
	layout.cells[target] = "meadow"
	layout.elevations[target] = 0
	for kind in Layout.KINDS:
		if kind != "stairs":
			layout.stock[kind] = 0
	assert(layout.can_edit(target, "ground", Vector2i(1,2), 64))
	assert(not layout.can_edit(shore, "ground", Vector2i(1,2), 0))
	assert(layout.edit(target, "ground", Vector2i(1,2), 64))
	assert(layout.height_at(target) == 64 and layout.ground_count() == 0)
	var terrace = Layout.new()
	terrace.cells = {Vector2i.ZERO:"high_meadow"}
	terrace.elevations = {Vector2i.ZERO:128}
	assert(terrace.ground_options(Vector2i.DOWN) == [64.0], "Below floor two only floor one can receive its cliff")
	# Real reward accounting verifies persistence and undo of a chosen lower floor.
	var saved = Layout.new()
	saved.unlock(2)
	saved.unlock(3)
	assert(saved.edit(Vector2i(1,0), "stairs", Layout.HOME))
	var lower_target := Vector2i(2,1)
	assert(saved.automatic_height(lower_target) == 64)
	level.layout = saved
	level.terrain.layout = saved
	level.ui.layout = saved
	level.pawn.position = saved.center(Layout.HOME)
	var initial: Dictionary = saved.snapshot()
	assert(level.apply_edit(lower_target, 0))
	assert(saved.height_at(lower_target) == 0)
	assert(saved.restore(saved.snapshot()) and saved.height_at(lower_target) == 0, "Save retains the chosen water-level option")
	level.undo()
	assert(saved.snapshot() == initial, "Undo restores chosen placement and inventory")
	print("Cursor grass options: PASS")
	quit()
