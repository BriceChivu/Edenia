extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")

func _initialize() -> void:
	run.call_deferred()

func click_grass(level, cell: Vector2i) -> void:
	var point: Vector2 = level.layout.center(cell) - Vector2(0, level.layout.height_at(cell))
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = level.get_global_transform_with_canvas() * point
	level.handle_world_click(click)

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	level.set_process(false)
	level.pawn.set_physics_process(false)
	level.editing = true
	level.selected = "ground"
	var layout = level.layout
	layout.cells = {Vector2i.ZERO:"high_meadow", Vector2i.DOWN:"high_gold", Vector2i(2,0):"high_gold", Vector2i(1,2):"meadow", Vector2i(2,1):"meadow"}
	layout.elevations = {Vector2i.ZERO:128, Vector2i.DOWN:64, Vector2i(2,0):64}
	layout.trees.clear()
	layout.flora.clear()
	layout.decorations.clear()
	level.pawn.position = layout.center(Vector2i(1,2))
	var target := Vector2i(1,0)
	var stock: int = layout.ground_count()
	for offset in [Vector2(-24,-24),Vector2(24,24)]:
		var option: Dictionary = level.ground_placement_at(layout.center(target) + offset)
		assert(option.cell == target and option.height == 0, "New grass starts at water level regardless of proximity to higher terrain")
	click_grass(level, target)
	assert(layout.height_at(target) == 0 and layout.ground_count() == stock - 1)
	var option: Dictionary = level.ground_placement_at(layout.center(target))
	assert(option.cell == target and option.height == 64, "Hovering placed grass previews its next higher extension")
	click_grass(level, target)
	assert(layout.height_at(target) == 64 and layout.ground_count() == stock - 1, "Second click raises grass for free")
	var before: Dictionary = layout.snapshot()
	click_grass(level, target)
	assert(layout.height_at(target) == 0, "Without floor-one support, raised grass cycles back to water level")
	assert(not layout.edit(target, "ground", Vector2i(1,2), 128))
	click_grass(level, target)
	assert(layout.height_at(target) == 64)
	# Once a receiving terrace is present, the same tile can extend floor two.
	layout.cells[Vector2i(1,1)] = "high_gold"
	layout.elevations[Vector2i(1,1)] = 64
	var point: Vector2 = layout.center(target) - Vector2(0,64)
	assert(level.ground_placement_at(point).height == 128)
	level.game_camera.zoom = Vector2(1.7,1.7)
	click_grass(level, target)
	assert(layout.height_at(target) == 128 and layout.ground_count() == stock - 1)
	before = layout.snapshot()
	click_grass(level, target)
	assert(layout.height_at(target) == 0, "Highest available grass cycles back to water level")
	# Stair endpoints stay protected, and raising works with empty inventory.
	layout.cells[Vector2i(-1,0)] = "stairs"
	layout.stair_directions[Vector2i(-1,0)] = Vector2i.RIGHT
	assert(layout.next_ground_height(Vector2i.ZERO) == -1)
	layout.elevations[target] = 0
	layout.cells[target] = "meadow"
	for kind in Layout.KINDS:
		if kind != "stairs":
			layout.stock[kind] = 0
	assert(layout.can_edit(target, "ground", Vector2i(1,2), layout.next_ground_height(target)))
	assert(not layout.can_edit(Vector2i(5,2), "ground", Vector2i(1,2), 0))
	var terrace = Layout.new()
	terrace.cells = {Vector2i.ZERO:"high_meadow"}
	terrace.elevations = {Vector2i.ZERO:128}
	assert(terrace.next_ground_height(Vector2i.DOWN) == -1, "An unsafe water-level first placement is blocked, never replaced with a higher tile")
	# Real reward accounting verifies saving and undo after both clicks.
	var saved = Layout.new()
	saved.unlock(2)
	saved.unlock(3)
	assert(saved.edit(Vector2i(1,0), "stairs", Layout.HOME))
	var lower_target := Vector2i(2,1)
	level.layout = saved
	level.terrain.layout = saved
	level.ui.layout = saved
	level.pawn.position = saved.center(Layout.HOME)
	var initial: Dictionary = saved.snapshot()
	click_grass(level, lower_target)
	assert(saved.height_at(lower_target) == 0)
	assert(saved.restore(saved.snapshot()) and saved.height_at(lower_target) == 0, "Save retains the first water-level placement")
	var placed: Dictionary = saved.snapshot()
	click_grass(level, lower_target)
	assert(saved.height_at(lower_target) == 64)
	assert(saved.restore(saved.snapshot()) and saved.height_at(lower_target) == 64)
	level.undo()
	assert(saved.snapshot() == placed, "Undo of raising restores water-level grass without refunding it")
	level.undo()
	assert(saved.snapshot() == initial, "Undo of placement restores inventory")
	# Explicit water-level choices must not be silently raised by old migration.
	var legacy = Layout.new()
	var flat := Vector2i(3,2)
	legacy.cells[Vector2i(3,4)] = "high_gold"
	legacy.elevations[Vector2i(3,4)] = 64
	legacy.elevations[flat] = 0
	legacy.manual_ground_elevation = true
	legacy.normalize_cliff_terraces()
	assert(legacy.cells.has(flat) and legacy.height_at(flat) == 0, "An explicitly placed base tile waits for a click to raise")
	print("Repeated-click grass elevation: PASS")
	quit()
