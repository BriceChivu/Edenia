extends SceneTree
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 root.size = Vector2i(1152,496)
 var game = load("res://previews/level_three.tscn").instantiate()
 root.add_child(game)
 await process_frame
 game.set_process(false)
 game.pawn.set_physics_process(false)
 game.pawn.hide()
 game.game_camera.zoom = Vector2.ONE
 game.game_camera.force_update_scroll()
 for name in ["Clouds","PassingCloud"]:
  game.get_node(name).hide()
 var layout = game.layout
 var grass := Vector2i(1,-1)
 var target := Vector2i(1,0)
 layout.cells = {Vector2i.ZERO:"high_meadow",Vector2i.DOWN:"high_gold",Vector2i(1,1):"high_gold",grass:"meadow"}
 layout.elevations = {Vector2i.ZERO:128,Vector2i.DOWN:64,Vector2i(1,1):64,grass:0}
 layout.trees.clear()
 layout.flora.clear()
 layout.decorations.clear()
 layout.manual_ground_elevation = true
 game.pawn.position = layout.center(Vector2i.DOWN)
 game.editing = true
 game.selected = "ground"
 game.rebuild_decorations()
 game.refresh()
 var point: Vector2 = layout.center(grass)
 for i in range(2):
  var option: Dictionary = game.ground_placement_at(point)
  game.terrain.hover = option.cell
  game.terrain.tool = "ground"
  game.terrain.ground_preview_height = option.height
  game.terrain.preview_position = point
  game.terrain.valid = layout.can_edit(option.cell,"ground",Vector2i.DOWN,option.height)
  await process_frame
  await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png("/Users/brice/Documents/Coding/Edenia/artifacts/visible-ground-extension/preview-floor-%s.png" % int(option.height/64))
  assert(game.apply_edit(option.cell,option.height))
 game.editing = false
 game.refresh()
 await process_frame
 await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png("/Users/brice/Documents/Coding/Edenia/artifacts/visible-ground-extension/placed-floor-two.png")
 quit()
