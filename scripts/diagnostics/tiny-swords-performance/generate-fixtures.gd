extends SceneTree
# Uses Godot's owning generator/validation. Run against the diagnostic project.
func _initialize() -> void:
 var args := OS.get_cmdline_user_args()
 if args.is_empty():
  push_error("Pass an absolute diagnostic output directory after --")
  quit(1)
  return
 var generator = load("res://scripts/playground_terrain.gd")
 var source = generator.fresh(10)
 var generated = generator.generate(source,20261005)
 var snapshot: Dictionary = generated.snapshot()
 var verification = load("res://scripts/terrain_layout.gd").new()
 if not verification.restore(snapshot):
  push_error("Generated diagnostic fixture failed Godot validation")
  quit(1)
  return
 var file := FileAccess.open(args[0].path_join("terraced-fixture.json"),FileAccess.WRITE)
 file.store_string(JSON.stringify(snapshot))
 var simple = load("res://scripts/terrain_layout.gd").new()
 simple.unlock(2)
 var placed := false
 for cell in [Vector2i(2,0),Vector2i(2,1),Vector2i(-1,0),Vector2i(1,-1)]:
  if simple.edit(cell,"stairs",simple.HOME):
   placed = true
   break
 if not placed:
  push_error("Minimal stairs fixture failed")
  quit(1)
  return
 var stairs_file := FileAccess.open(args[0].path_join("stair-fixture.json"),FileAccess.WRITE)
 stairs_file.store_string(JSON.stringify(simple.snapshot()))
 print("Terraced fixture: ",generated.cells.size()," tiles, ",generated.stair_directions.size()," stairs, ",generated.trees.size()," trees")
 quit()
