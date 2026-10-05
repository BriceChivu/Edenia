extends SceneTree

func _initialize() -> void:
 run.call_deferred()

func run() -> void:
 var level = load("res://previews/level_three.tscn").instantiate()
 root.add_child(level)
 await process_frame
 var view = level.terrain
 view.hover = Vector2i(2, 1)
 view.preview_position = level.layout.center(view.hover)
 var before: Vector2 = view.placement_offset()
 view.preview_position += Vector2(7, 3)
 assert(view.placement_offset() - before == Vector2(7, 3), "Preview follows sub-cell motion without snapping")
 var first: Rect2 = view.tree_preview_rect()
 view.preview_position += Vector2(2, 5)
 var second: Rect2 = view.tree_preview_rect()
 assert(second.position - first.position == Vector2(2, 5), "Tree ghost follows the pointer")
 assert(second.size == level.TreeArt.frame_size(level.layout.next_tree_variant), "Tree ghost uses the chosen variant's full-size artwork")
 var house_before: Rect2 = view.house_preview_rect()
 view.preview_position += Vector2(2, 5)
 assert(view.house_preview_rect().position - house_before.position == Vector2(2, 5), "House ghost follows sub-cell pointer motion")
 var house_position: Vector2 = view.house_preview_rect().position
 view.hover += Vector2i.RIGHT
 assert(view.house_preview_rect().position == house_position, "House ghost does not jump when the selected grid cell changes")
 level.layout.unlock(2)
 level.editing = true
 level.selected = "ground"
 var grass := Vector2i(1, 1)
 var right := grass + Vector2i.RIGHT
 level.layout.cells[right] = "high_gold"
 level.layout.elevations[right] = 64
 assert(level.clicked_cell(level.layout.center(grass)) == grass, "Existing flat grass wins over an overlapping empty raised-ground ghost")
 var raised_extension := Vector2i(3, 1)
 view.tool = "ground"
 view.hover = raised_extension
 view.ground_preview_height = 0
 view.preview_position = level.layout.center(raised_extension) + Vector2(7, 3)
 assert(level.ground_placement_at(view.preview_position).height == 0, "New grass previews water level beside higher ground")
 assert(level.clicked_cell(view.preview_position) == raised_extension, "Water-level preview and click resolve to the same tile")
 var rendered_center: Vector2 = level.layout.center(raised_extension) + view.placement_offset()
 assert(rendered_center == view.preview_position, "New grass follows the pointer at water level")
 # Raising previews must rise with the proposed floor instead of being
 # translated back down onto the current mouse/grass surface.
 view.hover = grass
 var below := grass + Vector2i.DOWN
 for current_height in [0, 64, 128]:
  level.layout.cells[grass] = level.layout.kind_at_height(current_height)
  level.layout.elevations[grass] = current_height
  level.layout.cells[right] = level.layout.kind_at_height(current_height + 64)
  level.layout.elevations[right] = current_height + 64
  level.layout.cells[below] = level.layout.kind_at_height(current_height)
  level.layout.elevations[below] = current_height
  view.preview_position = level.layout.center(grass) - Vector2(0, current_height) + Vector2(7, 3)
  var option: Dictionary = level.ground_placement_at(view.preview_position)
  assert(option.cell == grass and option.height == current_height + 64)
  view.ground_preview_height = option.height
  var raised_center: Vector2 = level.layout.center(grass) - Vector2(0, option.height) + view.placement_offset()
  var expected: Vector2 = view.preview_position - Vector2(0, 64)
  if raised_center != expected:
   push_error("Raised grass ghost must be one square above the pointer: expected %s, got %s" % [expected, raised_center])
   quit(1)
   return
  view.preview_position += Vector2(2, 5)
  raised_center = level.layout.center(grass) - Vector2(0, option.height) + view.placement_offset()
  assert(raised_center == expected + Vector2(2, 5), "Raising ghost still follows sub-cell pointer motion")
 level.layout.cells[grass] = "meadow"
 level.layout.elevations[grass] = 0
 level.layout.cells[below] = "meadow"
 level.layout.elevations[below] = 0
 level.layout.elevations[right] = 64
 var stock: Dictionary = level.layout.stock.duplicate()
 assert(level.apply_edit(grass), "Clicking flat grass beside higher ground transforms it")
 assert(level.layout.height_at(grass) == level.layout.height_at(right), "Transformed grass joins the ground on its right")
 assert(level.layout.stock == stock, "Click transformation consumes no grass")
 view.tool = "tree"
 view.hover = grass
 level.layout.trees[grass] = Vector2(6, 4)
 for kind in level.layout.TREE_VARIANTS:
  level.layout.tree_types[grass] = kind
  var expected_kind = level.layout.TREE_VARIANTS[(level.layout.TREE_VARIANTS.find(kind) + 1) % 4]
  assert(view.tree_preview_variant() == expected_kind, "Existing tree hover previews the next click variant")
  var anchored: Rect2 = view.tree_preview_rect()
  view.preview_position += Vector2(9, 7)
  assert(view.tree_preview_rect() == anchored, "Variant preview stays at the existing tree anchor")
  view.clipped_tree_preview_texture()
  assert(view.tree_preview_kind == expected_kind, "Preview artwork uses the replacement variant")
 print("Placement preview checks: PASS")
 quit()
