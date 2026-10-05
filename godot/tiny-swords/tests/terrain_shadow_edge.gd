extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
const View = preload("res://scripts/terrain_view.gd")
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 root.size = Vector2i(1152,496)
 var background := ColorRect.new()
 background.z_index = -20
 background.color = Color("47aba9")
 background.size = Vector2(1152,496)
 root.add_child(background)
 var layout = Layout.new()
 layout.cells = {Vector2i.ZERO:"high_gold",Vector2i.LEFT:"meadow"}
 var base = View.new()
 base.z_index = -16
 base.layout = layout
 root.add_child(base)
 var shadows = View.new()
 shadows.z_index = -1
 shadows.layout = layout
 shadows.shadow_height = 64
 root.add_child(shadows)
 var cliff = View.new()
 cliff.layout = layout
 cliff.piece = Vector2i.ZERO
 root.add_child(cliff)
 await process_frame
 await RenderingServer.frame_post_draw
 var rendered = root.get_texture().get_image()
 rendered.save_png("/tmp/edenia-terrain-shadow-edge.png")
 var source = shadows.shadow.get_image()
 var atlas = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color1.png").get_image()
 var grass = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color3.png").get_image()
 var missed := 0
 var samples := 0
 # The left grass backing must receive the same shadow as adjacent ground.
 # Sample only opaque grass exposed through transparent cliff pixels.
 for y in range(64):
  for x in range(16):
   var shade = source.get_pixel(64+x,64+y)
   var ground = grass.get_pixel(128+x,192+y)
   if shade.a > 0 and ground.a > 0.99 and atlas.get_pixel(512+x,256+y).a == 0:
    samples += 1
    var expected = ground.blend(shade)
    var actual = rendered.get_pixel(512+x,176+y)
    if absf(actual.r-expected.r)+absf(actual.g-expected.g)+absf(actual.b-expected.b) > 0.03:
     missed += 1
 print("Cliff-side shadow: ", missed, " missing pixels / ", samples, " samples")
 quit(1 if missed > 0 or samples == 0 else 0)
