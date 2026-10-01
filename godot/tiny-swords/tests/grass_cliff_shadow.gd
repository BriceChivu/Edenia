extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
const View = preload("res://scripts/terrain_view.gd")
class ShadowExample extends View:
 var show_shadows := false
 func _draw() -> void:
  super._draw()
  if show_shadows:
   draw_shadows(64)
  for cell in [Vector2i.ZERO,Vector2i.DOWN]:
   draw_tile(cell,layout.cells[cell])
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 root.content_scale_size = Vector2i.ZERO
 root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
 root.size = Vector2i(1152,496)
 var background := ColorRect.new()
 background.color = Color("47aba9")
 background.size = Vector2(1152,496)
 root.add_child(background)
 var failed := false
 for side in [Vector2i.LEFT,Vector2i.RIGHT]:
  var model = Layout.new()
  model.cells = {Vector2i.ZERO:"high_gold",Vector2i.DOWN:"high_gold",side:"meadow",side+Vector2i.DOWN:"meadow"}
  var view := ShadowExample.new()
  view.layout = model
  root.add_child(view)
  await process_frame
  await RenderingServer.frame_post_draw
  var before = root.get_texture().get_image()
  view.show_shadows = true
  view.queue_redraw()
  await process_frame
  await RenderingServer.frame_post_draw
  var after = root.get_texture().get_image()
  var shaded := 0
  var water_shaded := 0
  var receivers = view.shadow_receivers(0)
  var atlas = view.floor_texture(0).get_image()
  var grass_region = view.ground_region(side,"meadow")
  for y in range(64):
   for x in range(16):
    var local_x := 48+x if side == Vector2i.LEFT else x
    var point: Vector2i = Vector2i(Layout.ORIGIN)+side*64+Vector2i(local_x,y)
    if atlas.get_pixel(int(grass_region.position.x)+local_x,int(grass_region.position.y)+y).a > 0.99:
     if after.get_pixelv(point).get_luminance() < before.get_pixelv(point).get_luminance()-0.01:
      shaded += 1
  for y in range(112,400):
   for x in range(400,720):
    var point := Vector2i(x,y)
    if not receivers.has(point) and after.get_pixelv(point) != before.get_pixelv(point):
     water_shaded += 1
  print("Middle-piece shadow side ",side.x,": ",shaded," grass pixels, ",water_shaded," non-grass pixels")
  failed = failed or shaded < 20 or water_shaded != 0
  view.free()
 quit(1 if failed else 0)
