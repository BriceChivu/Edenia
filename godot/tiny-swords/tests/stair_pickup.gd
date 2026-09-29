extends SceneTree
var failures := 0
func check(ok: bool, label: String) -> void:
 if not ok:
  failures += 1
  push_error(label)
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 for stair in [Vector2i(2,0),Vector2i(-1,0)]:
  var level = load("res://previews/level_two.tscn").instantiate()
  root.add_child(level)
  await process_frame
  level.selected = "stairs"
  check(level.apply_edit(stair), "Place stair fixture")
  var landing: Vector2i = stair + level.layout.stair_direction(stair)
  var point: Vector2 = level.layout.center(landing) - Vector2(0,64)
  level.selected = "remove"
  check(level.clicked_cell(point) == stair, "Landing targets its stair bundle in both orientations")
  level.terrain.hover = level.clicked_cell(point)
  level.terrain.valid = level.layout.can_edit(level.terrain.hover,"remove",level.layout.cell_at(level.pawn.position))
  level.pointer_position = level.get_global_transform_with_canvas() * point
  level.pointer_inside = true
  level.update_cursor()
  check(level.cursor_mode == "build" and level.pointer.texture.get_size() == Vector2(71,71), "Landing shows the centered pickup cursor")
  var expected_offset := 35.5
  check(is_equal_approx(level.pointer.position.x,level.pointer_position.x - expected_offset), "Pointer keeps the same centered hotspot")
  var outline: PackedVector2Array = level.terrain.pickup_outline()
  var previous_pointer: Vector2 = level.pointer.position
  var previous_input: Vector2 = level.pointer_position
  var stair_point: Vector2 = level.layout.center(stair) - Vector2(0,32)
  level.terrain.hover = level.clicked_cell(stair_point)
  level.pointer_position = level.get_global_transform_with_canvas() * stair_point
  level.update_cursor()
  check((level.pointer.position - previous_pointer).is_equal_approx(level.pointer_position - previous_input), "Crossing between bundle halves never shifts the cursor anchor")
  check(level.terrain.pickup_outline() == outline, "Bundle outline stays fixed across both halves")
  # A tree must be picked up before removing the supporting bundle.
  level.layout.trees[landing] = true
  check(level.clicked_cell(point) == landing, "Tree on landing remains separately selectable")
  level.layout.trees.erase(landing)
  var before: int = level.layout.stock.stairs
  check(level.apply_edit(level.clicked_cell(point)), "Clicking landing collects the bundle")
  check(not level.layout.cells.has(stair) and not level.layout.cells.has(landing) and level.layout.stock.stairs == before + 1, "Both squares return as one stair bundle")
  level.queue_free()
  await process_frame
 print("Stair pickup checks: ","PASS" if failures == 0 else "FAIL")
 quit(0 if failures == 0 else 1)
