extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const View = preload("res://scripts/terrain_view.gd")

class TerrainConcept extends View:
 var option_height := 0.0
 func _draw() -> void:
  if textures.is_empty(): return
  var keys = layout.cells.keys()
  keys.sort_custom(func(a,b): return a.y < b.y if a.y != b.y else a.x < b.x)
  for cell in keys:
   draw_tile(cell, layout.cells[cell])
  var target := Vector2i(2,2) if option_height == 0 else Vector2i(1,0)
  draw_tile(target, layout.kind_at_height(option_height), Color(1,1,1,0.72), option_height)
  var p = layout.ORIGIN + Vector2(target)*64 - Vector2(0,option_height)
  draw_rect(Rect2(p+Vector2(2,2),Vector2(60,60)),Color("fff3af"),false,2)
  var mouse = p + Vector2(12,24)
  var cursor = PackedVector2Array([mouse,mouse+Vector2(0,25),mouse+Vector2(6,19),mouse+Vector2(12,30),mouse+Vector2(17,27),mouse+Vector2(11,17),mouse+Vector2(20,17)])
  draw_colored_polygon(cursor,Color("fffdf5"))
  cursor.append(mouse)
  draw_polyline(cursor,Color("273e41"),1.6)

func label(parent, text_value: String, pos: Vector2, size: int, color: Color) -> void:
 var node := Label.new()
 node.text = text_value
 node.position = pos
 node.add_theme_font_size_override("font_size",size)
 node.add_theme_color_override("font_color",color)
 parent.add_child(node)

func _initialize() -> void:
 run.call_deferred()

func run() -> void:
 root.size = Vector2i(1440,740)
 root.content_scale_size = Vector2i(1440,740)
 var canvas := Node2D.new()
 root.add_child(canvas)
 var background := ColorRect.new()
 background.color = Color("142c30")
 background.size = Vector2(1440,740)
 canvas.add_child(background)
 label(canvas,"Grass placement follows your cursor",Vector2(40,25),32,Color("fff8df"))
 label(canvas,"CONCEPT MOCKUP  /  Same terrain, different cursor positions",Vector2(42,73),17,Color("a5c1bf"))
 var heights := [128.0,64.0,0.0]
 var titles := ["Near the upper grass","Near the lower terrace","Near the shoreline"]
 var subtitles := ["Preview: floor 2","Preview: floor 1","Preview: water level"]
 for i in range(3):
  var x := 40 + i*465
  var panel := ColorRect.new()
  panel.color = Color("47aba9")
  panel.position = Vector2(x,125)
  panel.size = Vector2(430,472)
  canvas.add_child(panel)
  var top := ColorRect.new()
  top.color = Color("203c3f")
  top.position = Vector2(x,125)
  top.size = Vector2(430,80)
  canvas.add_child(top)
  label(canvas,titles[i],Vector2(x+20,139),23,Color("fff8df"))
  label(canvas,subtitles[i],Vector2(x+20,171),18,Color("d1deba"))
  var layout := Layout.new()
  layout.cells = {Vector2i(-1,0):"high_meadow",Vector2i(0,0):"high_meadow",Vector2i(-1,1):"high_gold",Vector2i(0,1):"high_gold",Vector2i(-1,2):"meadow",Vector2i(0,2):"meadow",Vector2i(1,1):"high_gold",Vector2i(1,2):"meadow",Vector2i(2,0):"high_gold",Vector2i(3,0):"high_gold",Vector2i(2,1):"meadow",Vector2i(3,1):"meadow"}
  layout.elevations = {Vector2i(-1,0):128,Vector2i(0,0):128,Vector2i(-1,1):64,Vector2i(0,1):64,Vector2i(2,0):64,Vector2i(3,0):64,Vector2i(1,1):64}
  var terrain := TerrainConcept.new()
  terrain.layout = layout
  terrain.option_height = heights[i]
  terrain.position = Vector2(x+104-512,270-48)
  canvas.add_child(terrain)
  var footer := ColorRect.new()
  footer.color = Color("203c3f")
  footer.position = Vector2(x,597)
  footer.size = Vector2(430,45)
  canvas.add_child(footer)
  label(canvas,["Extends the upper platform","Extends the lower terrace","Adds grass at the water surface"][i],Vector2(x+20,610),18,Color("fff8df"))
 label(canvas,"Grass held    •    Highlighted tile = what a click would place",Vector2(42,670),21,Color("fff3af"))
 label(canvas,"Only valid options appear. Floor 2 needs a floor-1 terrace below it; two stacked cliffs are never offered.",Vector2(42,705),17,Color("a5c1bf"))
 await process_frame
 await RenderingServer.frame_post_draw
 var error = root.get_texture().get_image().save_png("/Users/brice/Documents/Coding/Edenia/artifacts/grass-hover-concept/grass-hover-concept-corrected.png")
 print("Screenshot saved: ",error)
 quit()
