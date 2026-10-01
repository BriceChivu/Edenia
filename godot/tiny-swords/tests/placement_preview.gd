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
 assert(second.size == Vector2(192, 256) * 0.8, "Tree ghost matches placed tree size")
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
 for height in [64, 128, 192]:
  level.layout.elevations[right] = height
  # Higher previews require a receiving terrace, never stacked cliffs.
  var below := raised_extension + Vector2i.DOWN
  level.layout.cells[below] = level.layout.kind_at_height(height - 64)
  level.layout.elevations[below] = height - 64
  view.preview_position = level.layout.center(raised_extension) - Vector2(0, height) + Vector2(7, 3)
  var rendered_center: Vector2 = level.layout.center(raised_extension) - Vector2(0, level.layout.automatic_height(raised_extension)) + view.placement_offset()
  assert(rendered_center == view.preview_position, "Raised ground preview must center on the cursor, not the square above it")
  assert(level.clicked_cell(view.preview_position) == raised_extension, "Raised preview and click resolve to the same tile")
 level.layout.elevations[right] = 64
 var stock: Dictionary = level.layout.stock.duplicate()
 assert(level.apply_edit(grass), "Clicking flat grass beside higher ground transforms it")
 assert(level.layout.height_at(grass) == level.layout.height_at(right), "Transformed grass joins the ground on its right")
 assert(level.layout.stock == stock, "Click transformation consumes no grass")
 print("Placement preview checks: PASS")
 quit()
