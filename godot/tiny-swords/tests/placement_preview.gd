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
 print("Placement preview checks: PASS")
 quit()
