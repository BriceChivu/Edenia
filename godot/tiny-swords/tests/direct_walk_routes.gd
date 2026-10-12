extends SceneTree

var failures := 0

func _initialize() -> void:
 run.call_deferred()

func check(ok: bool, message: String) -> void:
 if not ok:
  failures += 1
  push_error(message)

func run() -> void:
 var world = load("res://previews/level_four.tscn").instantiate()
 world.preview_save_enabled = false
 world.camera_save_enabled = false
 root.add_child(world)
 await process_frame
 world.set_process(false)
 world.pawn.set_physics_process(false)
 world.layout.cells.clear()
 world.layout.flora.clear()
 world.layout.decorations.clear()
 world.layout.trees.clear()
 world.layout.log_piles.clear()
 for y in range(-1, 3):
  for x in range(-2, 6):
   world.layout.cells[Vector2i(x, y)] = "meadow"
 world.layout.trees[Vector2i(3, -1)] = Vector2(0, 10)
 world.layout.tree_types[Vector2i(3, -1)] = "tree"
 var start: Vector2 = world.layout.center(Vector2i.ZERO)
 var clear_target: Vector2 = world.layout.center(Vector2i(5, 2))
 var blocked_start: Vector2 = world.layout.center(Vector2i(2, -1))
 var blocked_target: Vector2 = world.layout.center(Vector2i(4, -1))
 # Walk behind the root contact in this row, where its footprint crosses it.
 blocked_start.y -= 10
 blocked_target.y -= 10
 check(world.clear_segment(start, clear_target), "Distant tree does not block the clear route")
 check(not world.clear_segment(blocked_start, blocked_target), "Root contact blocks the direct route")
 for pair in [[start, clear_target], [blocked_start, blocked_target], [start, Vector2(1200, 1000)]]:
  ProjectSettings.set_setting("gameplay/direct_walk_routes_enabled", false)
  var baseline: Array[Vector2] = world.land_route(pair[0], world.layout.cell_at(pair[1]), pair[1])
  ProjectSettings.set_setting("gameplay/direct_walk_routes_enabled", true)
  var trial: Array[Vector2] = world.land_route(pair[0], world.layout.cell_at(pair[1]), pair[1])
  check(trial == baseline, "Fast path retains clear, blocked and water route results")
  var previous: Vector2 = pair[0]
  for point in trial:
   check(world.clear_segment(previous, point), "Every route segment retains terrain and solid contact checks")
   previous = point
 print("Direct walking route checks: ", failures, " failures")
 quit(0 if failures == 0 else 1)
