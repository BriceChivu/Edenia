extends SceneTree
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 root.size = Vector2i(1152,496)
 var level = load("res://scenes/level_two_preview.tscn").instantiate()
 level.preview_save_enabled = false
 root.add_child(level)
 level.game_camera.zoom = Vector2.ONE
 level.game_camera.force_update_scroll()
 await process_frame
 var layout = level.layout
 var mismatches := 0
 var checked := 0
 var shaded := 0
 for direction in [Vector2i.RIGHT,Vector2i.LEFT]:
  layout.cells = {Vector2i.ZERO:"high_gold",Vector2i.RIGHT:"stairs",Vector2i(2,0):"high_meadow",Vector2i.DOWN:"high_gold",Vector2i(1,1):"high_gold",Vector2i(2,1):"high_gold"}
  layout.elevations = {Vector2i.ZERO:64,Vector2i.RIGHT:64,Vector2i(2,0):128,Vector2i.DOWN:64,Vector2i(1,1):64,Vector2i(2,1):64}
  layout.stair_directions = {Vector2i.RIGHT:Vector2i.RIGHT}
  if direction == Vector2i.LEFT:
   var mirrored := {}
   var heights := {}
   for cell in layout.cells:
    var mirror := Vector2i(2-cell.x,cell.y)
    mirrored[mirror] = layout.cells[cell]
    heights[mirror] = layout.height_at(cell)
   layout.cells = mirrored
   layout.elevations = heights
  layout.stair_directions = {Vector2i.RIGHT:direction}
  layout.flora.clear()
  layout.decorations.clear()
  level.pawn.hide()
  level.rebuild_decorations()
  for node in level.get_children():
   if "Cloud" in node.name or node.has_meta("terrain_shadow"):
    node.hide()
  for frame in range(3):
   await process_frame
  await RenderingServer.frame_post_draw
  var rendered = root.get_texture().get_image()
  var gold = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color1.png").get_image()
  var teal = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color2.png").get_image()
  # The bottom of the cliff and ramp have transparent roots. Those roots
  # must reveal the receiving gold grass rather than water or shore foam.
  for cell in [Vector2i.RIGHT,Vector2i(2 if direction == Vector2i.RIGHT else 0,0)]:
   for y in range(48,64):
    for x in range(16,48):
     var source: Color = teal.get_pixel((0 if direction == Vector2i.RIGHT else 192)+x,320+y) if cell == Vector2i.RIGHT else teal.get_pixel((448 if direction == Vector2i.RIGHT else 320)+x,256+y)
     if source.a > 0:
      continue
     var expected: Color = gold.get_pixel(64+x,y) if cell == Vector2i.RIGHT else gold.get_pixel((128 if direction == Vector2i.RIGHT else 0)+x,y)
     if expected.a < 0.99:
      continue
     checked += 1
     var actual: Color = rendered.get_pixel(512+cell.x*64+x,112+y)
     if absf(actual.r-expected.r)>0.01 or absf(actual.g-expected.g)>0.01 or absf(actual.b-expected.b)>0.01:
      mismatches += 1
  # Foreground terrace grass continues beneath the higher cliff/ramp.
  # Its top row must use continuous grass, without an exposed leafy rim.
  for cell in [Vector2i(1,1),Vector2i(2 if direction == Vector2i.RIGHT else 0,1)]:
   var column := 64 if cell.x == 1 else (128 if cell.x == 2 else 0)
   for y in range(16):
    for x in range(16,48):
     var expected: Color = gold.get_pixel(column+x,128+y)
     if expected.a < 0.99:
      continue
     checked += 1
     var actual: Color = rendered.get_pixel(512+cell.x*64+x,176+y)
     if absf(actual.r-expected.r)>0.01 or absf(actual.g-expected.g)>0.01 or absf(actual.b-expected.b)>0.01:
      mismatches += 1
  for node in level.get_children():
   if node.has_meta("terrain_shadow"):
    node.show()
  await process_frame
  await RenderingServer.frame_post_draw
  var with_shadow = root.get_texture().get_image()
  for x in range(16,48):
   for y in range(16):
    var pixel := Vector2i(512+(2 if direction == Vector2i.RIGHT else 0)*64+x,176+y)
    if with_shadow.get_pixelv(pixel).get_luminance() < rendered.get_pixelv(pixel).get_luminance()-0.03:
     shaded += 1
  with_shadow.save_png("/tmp/edenia-cliff-terrace-roots-%s.png" % direction.x)
 print("Raised cliff and stair roots meet grass: ",mismatches," mismatches among ",checked," pixels")
 print("Shadow across corrected terrace seam: ", shaded, " shaded pixels")
 quit(0 if mismatches == 0 and checked > 50 and shaded > 100 else 1)
