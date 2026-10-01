extends SceneTree

var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

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
	var grass := Vector2i(8,-1)
	var target := Vector2i(8,0)
	var front := Vector2i(8,1)
	var upper := Vector2i(7,0)
	layout.cells = {Vector2i(3,0):"meadow", Vector2i(4,0):"stairs", Vector2i(5,0):"high_gold", Vector2i(6,0):"stairs", Vector2i(5,1):"meadow", target:"meadow", upper:"high_meadow", Vector2i(7,1):"high_gold", Vector2i(6,1):"high_gold", grass:"meadow", front:"high_gold"}
	layout.elevations = {Vector2i(5,0):64, Vector2i(6,0):64, upper:128, Vector2i(7,1):64, Vector2i(6,1):64, front:64}
	layout.stair_directions = {Vector2i(4,0):Vector2i.RIGHT,Vector2i(6,0):Vector2i.RIGHT}
	layout.stock = {"gold":0,"high_gold":4,"high_meadow":0,"meadow":0,"stairs":0,"tree":1,"violet":0}
	layout.trees.clear()
	layout.flora.clear()
	layout.decorations = {target:{"kind":"bush","variant":2}}
	layout.manual_ground_elevation = true
	level.pawn.position = layout.center(Vector2i(3,0))
	var initial: Dictionary = layout.snapshot()
	check(layout.restore(initial), "Screenshot layout has valid save accounting")
	var point: Vector2 = layout.center(grass)
	var option: Dictionary = level.ground_placement_at(point)
	check(option.cell == grass and option.height == 64, "Hovered ground offers one floor despite the hidden flat destination")
	if option.height != 64:
		quit(1)
		return
	check(not layout.can_edit(grass,"ground",target,64), "Occupied destination cannot be merged")
	layout.flora[grass] = 2
	check(layout.next_ground_height(grass) == -1, "Conflicting source foliage and destination bush cannot be discarded by merging")
	layout.flora.erase(grass)
	var stock: int = layout.ground_count()
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = level.get_global_transform_with_canvas() * point
	level.handle_world_click(click)
	check(not layout.cells.has(grass) and layout.height_at(target) == 64, "Click continues the visible square into floor one")
	check(layout.ground_count() == stock + 1, "Combining two ground tiles returns exactly one spare tile")
	check(layout.decorations.get(target,{}).get("kind") == "bush", "Existing hidden bush survives the continuation")
	check(layout.can_cross(target,front), "Raised ground connects to the receiving terrace")
	check(layout.restore(layout.snapshot()), "Merged ground preserves save accounting")
	check(level.ground_placement_at(point).height == 128, "Next click can extend the upper floor")
	level.handle_world_click(click)
	check(layout.height_at(target) == 128 and layout.can_cross(target,upper), "Second click connects to the upper landing")
	level.undo()
	level.undo()
	check(layout.snapshot() == initial, "Undo restores both original tiles, bush, and inventory")
	print("Overlapping ground continuation: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
