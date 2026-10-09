extends SceneTree
# Offline diagnostic metadata: reads original PNGs rather than GPU textures.
func _initialize() -> void:
 var result: Array = []
 for i in range(1,9):
  var image := Image.load_from_file("res://Tiny Swords (Free Pack)/Terrain/Decorations/Clouds/Clouds_%02d.png" % i)
  var body_sum := Vector2.ZERO
  var shadow_sum := Vector2.ZERO
  var body_count := 0
  var shadow_count := 0
  for y in image.get_height():
   for x in image.get_width():
    var color := image.get_pixel(x,y)
    if color.a < 0.1: continue
    if color.get_luminance() < 0.52:
     shadow_sum += Vector2(x,y)
     shadow_count += 1
    else:
     body_sum += Vector2(x,y)
     body_count += 1
  var body_image := Image.load_from_file("res://assets/clouds/Clouds_%02d_without_shadow.png" % i)
  var offset := shadow_sum/shadow_count-body_sum/body_count
  var center := body_sum/body_count-Vector2(image.get_size())/2.0
  result.append({"width":image.get_used_rect().size.x,"body_width":body_image.get_used_rect().size.x,"offset":[offset.x,offset.y],"center":[center.x,center.y]})
 var args := OS.get_cmdline_user_args()
 var file := FileAccess.open(args[0],FileAccess.WRITE)
 file.store_string(JSON.stringify(result,"",true,true))
 print("Baked original cloud metadata for ",result.size()," variants")
 quit()
