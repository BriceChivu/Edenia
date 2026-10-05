extends SceneTree
var failures := 0
func check(ok: bool, message: String) -> void:
 if not ok:
  failures += 1
  push_error(message)
func _initialize() -> void:
 var layout = load("res://scripts/terrain_layout.gd").new()
 layout.unlock()
 layout.decorations.clear()
 var occupied := Vector2i(0,1)
 # Extend the initial row so both bundle cells already contain grass.
 check(layout.edit(Vector2i(2,0), "ground", occupied), "Prepare landing grass")
 check(layout.edit(Vector2i(3,0), "ground", occupied), "Prepare opposite approach")
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
 layout.flora[Vector2i(2,0)] = 1
 var placed: Dictionary = layout.snapshot()
 layout.elevations[Vector2i(3,0)] = 64
 check(not layout.can_reverse_stair(Vector2i(1,0), occupied), "Wrong opposite approach height blocks reversal")
 layout.elevations[Vector2i(3,0)] = 0
 layout.trees[Vector2i(2,0)] = true
 check(not layout.can_reverse_stair(Vector2i(1,0), occupied), "Landing tree blocks reversal")
 layout.trees.clear()
 layout.stock.stairs = 0
 check(layout.edit(Vector2i(1,0), "stairs", occupied), "Reverse existing staircase with no spare kits")
 check(layout.stair_direction(Vector2i(2,0)) == Vector2i.LEFT, "Staircase faces the opposite direction")
 check(layout.height_at(Vector2i(1,0)) == 64 and layout.height_at(Vector2i(2,0)) == 0 and layout.height_at(Vector2i(0,0)) == 0 and layout.height_at(Vector2i(3,0)) == 0, "Same two squares swap roles and surrounding heights stay fixed")
 check(layout.restore(layout.snapshot()), "Reversed bundle survives save restoration")
 check(layout.cells[Vector2i(2,0)] == "stairs" and not layout.stair_directions.has(Vector2i(1,0)), "Ramp anchor moves to the old landing")
 check(layout.can_cross(Vector2i(3,0), Vector2i(2,0)) and layout.can_cross(Vector2i(2,0), Vector2i(1,0)), "Reversed route connects the opposite approach")
 var reversed: Dictionary = layout.snapshot()
 check(not layout.edit(Vector2i(2,0), "stairs", Vector2i(2,0)), "Occupied endpoint blocks reversal")
 check(layout.snapshot() == reversed, "Rejected reversal preserves state")
 check(layout.edit(Vector2i(2,0), "stairs", occupied), "Staircase can switch back")
 layout.stock.stairs = placed.stock.stairs
 check(layout.snapshot() == placed, "Two reversals preserve terrain and inventory")
 check(layout.edit(Vector2i(1,0), "remove", occupied), "Replacement bundle can be picked up")
 check(layout.stock.stairs == stair_stock and layout.ground_count() == before + 2, "Pickup does not duplicate grass refunds")
 # Both orientations also reverse in place on an elevated terrace.
 for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
  for height in [0, 64]:
   var fixture = layout.get_script().new()
   fixture.unlock()
   fixture.cells.clear()
   fixture.elevations.clear()
   fixture.flora.clear()
   fixture.decorations.clear()
   fixture.manual_ground_elevation = true
   for x in range(-2, 3):
    for y in range(3):
     var square := Vector2i(x,y)
     fixture.cells[square] = fixture.kind_at_height(height)
     fixture.elevations[square] = height
   var ramp := Vector2i.ZERO
   var landing: Vector2i = direction
   fixture.cells[ramp] = "stairs"
   fixture.stair_directions[ramp] = direction
   fixture.cells[landing] = fixture.kind_at_height(height + 64)
   fixture.elevations[landing] = height + 64
   fixture.flora[landing] = 1
   var original: Dictionary = fixture.snapshot()
   check(fixture.edit(ramp, "stairs", Vector2i(99,99)), "Both orientations reverse at either elevation")
   check(fixture.cells[landing] == "stairs" and fixture.height_at(landing) == height and fixture.height_at(ramp) == height + 64, "Elevated bundle keeps its two-square footprint")
   check(fixture.flora.get(ramp) == 1 and not fixture.flora.has(landing), "Landing foliage follows the grass instead of covering the ramp")
   check(fixture.edit(landing, "stairs", Vector2i(99,99)), "Reverse back")
   check(fixture.snapshot() == original, "Both orientations return exactly to their original state")
 print("Stair replacement checks: ", "PASS" if failures == 0 else "FAIL")
 quit(0 if failures == 0 else 1)
