extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
const View = preload("res://scripts/terrain_view.gd")
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 root.size = Vector2i(1152,496)
 var water := Color("47aba9")
 var background := ColorRect.new()
 background.color = water
 background.size = Vector2(1152,496)
 root.add_child(background)
 var layout = Layout.new()
 layout.cells = {Vector2i.ZERO:"high_gold"}
 var base = View.new()
 base.layout = layout
 root.add_child(base)
 var cliff = View.new()
 cliff.layout = layout
 cliff.piece = Vector2i.ZERO
 root.add_child(cliff)
 await process_frame
 await RenderingServer.frame_post_draw
 var rendered = root.get_texture().get_image()
 var atlas = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color1.png").get_image()
 var grass = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color3.png").get_image()
 var leaked := 0
 # Water cliff's transparent foot must not expose the hidden base grass.
 for y in range(54,64):
  for x in range(64):
   if atlas.get_pixel(512+x,320+y).a == 0 and grass.get_pixel(192+x,192+y).a > 0.9:
    var pixel = rendered.get_pixel(512+x,176+y)
    if pixel.g > pixel.b * 1.15:
     leaked += 1
 rendered.save_png("/tmp/edenia-cliff-water-foot.png")
 base.free()
 cliff.free()
 print("Water cliff grass leakage: ", leaked, " pixels (expected 0)")
 quit(0 if leaked == 0 else 1)
