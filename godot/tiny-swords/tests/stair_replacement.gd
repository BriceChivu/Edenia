extends SceneTree
var failures := 0
func check(ok: bool, message: String) -> void:
 if not ok:
  failures += 1
  push_error(message)
func _initialize() -> void:
 var layout = load("res://scripts/terrain_layout.gd").new()
 layout.unlock()
 var occupied := Vector2i(0,1)
 # Extend the initial row so both bundle cells already contain grass.
 check(layout.edit(Vector2i(2,0), "ground", occupied), "Prepare landing grass")
 var before: int = layout.ground_count()
 var stair_stock: int = layout.stock.stairs
 check(not layout.can_edit(Vector2i(1,0), "stairs", Vector2i(2,0)), "Cannot raise ground under pawn")
 layout.trees[Vector2i(2,0)] = true
 check(layout.available_stair_direction(Vector2i(1,0)) != Vector2i.RIGHT, "Cannot replace a tree support")
 layout.trees.clear()
 check(layout.edit(Vector2i(1,0), "stairs", occupied), "Stairs replace existing grass")
 check(layout.ground_count() == before + 2, "Both replaced grass tiles returned")
 check(layout.stock.stairs == stair_stock - 1, "Exactly one stair kit spent")
 check(layout.cells[Vector2i(2,0)] == "high_gold", "Replaced landing raised correctly")
 check(layout.can_cross(Vector2i(0,0), Vector2i(1,0)) and layout.can_cross(Vector2i(1,0),Vector2i(2,0)), "Connected stair route")
 check(layout.restore(layout.snapshot()), "Replacement conserves inventory across saves")
 check(layout.edit(Vector2i(1,0), "remove", occupied), "Replacement bundle can be picked up")
 check(layout.stock.stairs == stair_stock and layout.ground_count() == before + 2, "Pickup does not duplicate grass refunds")
 print("Stair replacement checks: ", "PASS" if failures == 0 else "FAIL")
 quit(0 if failures == 0 else 1)
