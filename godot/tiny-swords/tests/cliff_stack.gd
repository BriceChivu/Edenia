extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 # Real edits apply the same rule, conserve inventory, and persist it.
 var model = Layout.new()
 model.unlock(2)
 var upper := Vector2i(1,0)
 var lower := Vector2i(1,1)
 model.cells[upper] = "high_meadow"
 model.elevations[upper] = 128
 var stock: Dictionary = model.stock.duplicate()
 assert(model.edit(lower,"ground",Vector2i(3,2)))
 assert(model.height_at(lower) == 64 and model.height_at(upper) == 128)
 assert(model.stock == stock and not model.can_raise_ground(lower))
 assert(model.restore(model.snapshot()) and model.height_at(lower) == 64)
 # Existing saves with the old stack are repaired once on load.
 model.cells[lower] = "high_meadow"
 model.elevations[lower] = 128
 assert(model.restore(model.snapshot()) and model.height_at(lower) == 64)
 assert(model.restore(model.snapshot()) and model.stock == stock)
 # Placing the upper row after the lower row gives the same terrace.
 model.cells[Vector2i.ZERO] = "high_gold"
 model.elevations[Vector2i.ZERO] = 64
 model.cells[Vector2i.DOWN] = "high_meadow"
 model.elevations[Vector2i.DOWN] = 128
 assert(model.edit(Vector2i.ZERO,"ground",Vector2i(3,2)))
 assert(model.height_at(Vector2i.ZERO) == 128 and model.height_at(Vector2i.DOWN) == 64)
 root.size = Vector2i(1152,496)
 var level = load("res://scenes/level_two_preview.tscn").instantiate()
 level.preview_save_enabled = false
 root.add_child(level)
 level.game_camera.zoom = Vector2.ONE
 level.game_camera.force_update_scroll()
 await process_frame
 var layout = level.layout
 # Two adjacent raised rows reproduce the four squares in the annotation.
 layout.cells = {Vector2i.ZERO:"high_meadow",Vector2i.DOWN:"high_meadow"}
 layout.elevations = {Vector2i.ZERO:128,Vector2i.DOWN:128}
 layout.flora.clear()
 layout.decorations.clear()
 level.pawn.hide()
 for cloud in level.get_children():
  if "Cloud" in cloud.name:
   cloud.hide()
 layout.normalize_cliff_terraces()
 level.rebuild_decorations()
 for node in level.get_children():
  if node.has_meta("terrain_shadow"):
   node.hide()
 for frame in range(3):
  await process_frame
 await RenderingServer.frame_post_draw
 var rendered = root.get_texture().get_image()
 var mismatches := 0
 # Red: upper grass, then a grass-facing cliff. Orange: lower grass,
 # then one water-facing cliff. Compare opaque artwork independently of foam.
 for square in [[48,2,Rect2i(512,192,64,64)],[112,2,Rect2i(512,256,64,64)],[176,1,Rect2i(512,128,64,64)],[240,1,Rect2i(512,320,64,64)]]:
  var atlas = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % square[1]).get_image()
  for y in range(64):
   for x in range(64):
    var source: Color = atlas.get_pixel(square[2].position.x+x,square[2].position.y+y)
    if source.a < 0.99:
     continue
    var actual: Color = rendered.get_pixel(512+x,square[0]+y)
    if absf(actual.r-source.r) > 0.01 or absf(actual.g-source.g) > 0.01 or absf(actual.b-source.b) > 0.01:
     mismatches += 1
 rendered.save_png("/tmp/edenia-cliff-terrace.png")
 print("Annotated cliff / grass / shoreline arrangement: ", mismatches, " pixel mismatches (expected 0)")
 quit(0 if mismatches == 0 else 1)
