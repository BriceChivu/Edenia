extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
const View = preload("res://scripts/terrain_view.gd")
class GroundBacking extends View:
 func _draw() -> void:
  draw_cliff_ground(Rect2(layout.ORIGIN,Vector2(64,64)),Vector2i.ZERO,64,Color.WHITE)
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 root.size = Vector2i(1152,496)
 var water := Color("47aba9")
 var background := ColorRect.new()
 background.color = water
 background.size = Vector2(1152,496)
 root.add_child(background)
 var atlas = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color1.png").get_image()
 var grass = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color3.png").get_image()
 var mismatches := 0
 for direction in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.DOWN]:
  var layout = Layout.new()
  layout.cells = {Vector2i.ZERO:"high_gold",direction:"meadow"}
  # Uniform water isolates the cliff's own ground backing from foam.
  var backing_view = GroundBacking.new()
  backing_view.layout = layout
  root.add_child(backing_view)
  var cliff = View.new()
  cliff.layout = layout
  cliff.piece = Vector2i.ZERO
  root.add_child(cliff)
  await process_frame
  await RenderingServer.frame_post_draw
  var rendered = root.get_texture().get_image()
  var ground: Rect2 = cliff.ground_region(Vector2i.ZERO,"meadow")
  for y in range(64):
   for x in range(64):
    var land: bool = direction == Vector2i.DOWN or (direction == Vector2i.LEFT and x < 16) or (direction == Vector2i.RIGHT and x >= 48)
    var source: Color = atlas.get_pixel(512+x,(256 if land else 320)+y)
    var backing := water
    if land:
     backing = backing.blend(grass.get_pixel(int(ground.position.x)+x,int(ground.position.y)+y))
    var expected := backing.blend(source)
    var actual: Color = rendered.get_pixel(512+x,176+y)
    if absf(actual.r-expected.r) > 0.01 or absf(actual.g-expected.g) > 0.01 or absf(actual.b-expected.b) > 0.01:
     mismatches += 1
  cliff.free()
  backing_view.free()
 print("Grass cliff pixel mismatches: ", mismatches, " (expected 0)")
 quit(0 if mismatches == 0 else 1)
