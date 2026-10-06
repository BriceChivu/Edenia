extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
func _initialize() -> void:
 var layout = Layout.new()
 layout.unlock(2)
 var flat := Vector2i(3, 2)
 var base := Vector2i(3, 3)
 var front := Vector2i(3, 4)
 assert(layout.edit(front, "ground", Layout.HOME))
 layout.cells[front] = "high_gold"
 layout.elevations[front] = 64
 var stock: Dictionary = layout.stock.duplicate()
 assert(layout.restore(layout.snapshot()))
 assert(layout.cells.has(base) and layout.height_at(base) == 64, "Visually adjoining flat grass must continue the front level-one platform")
 assert(not layout.cells.has(flat), "Continuation keeps the visible top in place by moving its base down one square")
 assert(layout.flora.get(base) == 1 and layout.stock == stock)
 assert(layout.can_cross(base, front))
 assert(layout.restore(layout.snapshot()) and layout.height_at(base) == 64 and layout.stock == stock, "Reload is idempotent")
 # A real intervening grid tile must not be overwritten.
 var blocked = Layout.new()
 blocked.cells = {flat:"meadow", base:"meadow", front:"high_gold"}
 blocked.elevations = {front:64}
 blocked.normalize_cliff_terraces()
 assert(blocked.cells.has(flat) and blocked.height_at(base) == 0)
 # Low stair endpoints must remain connected to their ramps.
 var protected = Layout.new()
 protected.cells = {flat:"meadow", front:"high_gold", flat + Vector2i.LEFT:"stairs"}
 protected.elevations = {front:64}
 protected.stair_directions = {flat + Vector2i.LEFT:Vector2i.LEFT}
 protected.normalize_cliff_terraces()
 assert(protected.cells.has(flat) and not protected.cells.has(base))
 print("Raised ground visual continuation: PASS")
 quit()
