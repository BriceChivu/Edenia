extends Node2D

var layout
var editing := false
var hover := Vector2i(999, 999)
var valid := false
var tool := "meadow"
var elapsed := 0.0
var textures: Dictionary = {}
var shadow := preload("res://art/builder/Shadow.png")
var foam := preload("res://art/environment/Water Foam.png")

func _ready() -> void:
	for kind in layout.KINDS:
		textures[kind] = load("res://art/builder/Tilemap_color%s.png" % layout.COLORS[kind])

func _process(delta: float) -> void:
	elapsed += delta
	queue_redraw()

func joined(cell: Vector2i, step: Vector2i) -> bool:
	var neighbor := cell + step
	if not layout.cells.has(neighbor):
		return false
	if layout.cells[neighbor] == "stairs":
		var direction: Vector2i = layout.stair_direction(neighbor)
		return (neighbor + direction == cell and layout.height_at(cell) == 64) or (neighbor - direction == cell and layout.height_at(cell) == 0)
	return layout.height_at(cell) == layout.height_at(neighbor)

func cliff_region(cell: Vector2i, half: int) -> Rect2:
	# The guide distinguishes left, center and right cliff faces. A stair at
	# the high edge opens both the walkable rim and the cliff beneath it.
	var connected := joined(cell, Vector2i.LEFT if half == 0 else Vector2i.RIGHT)
	var sx := 384 + half * 32 if connected else (320 if half == 0 else 480)
	var sy := 256 if layout.cells.has(cell + Vector2i.DOWN) else 320
	return Rect2(sx, sy, 32, 64)

func draw_tile(cell: Vector2i, kind: String, tint := Color.WHITE) -> void:
	var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64
	var raised: bool = kind.begins_with("high_")
	if kind == "stairs":
		var direction: Vector2i = layout.stair_direction(cell)
		draw_texture_rect_region(textures[kind], Rect2(origin - Vector2(0, 64), Vector2(64, 128)), Rect2(0 if direction.x >= 0 else 192, 256, 64, 128), tint)
		return
	if raised:
		origin.y -= 64
		if not joined(cell, Vector2i.DOWN):
			for half in range(2):
				draw_texture_rect_region(textures[kind], Rect2(origin + Vector2(half * 32, 64), Vector2(32, 64)), cliff_region(cell, half), tint)
	# Quarter tiles let narrow strips and isolated squares share clean edges.
	for y in range(2):
		for x in range(2):
			var horizontal := joined(cell, Vector2i(-1 if x == 0 else 1, 0))
			var vertical := joined(cell, Vector2i(0, -1 if y == 0 else 1))
			var sx := (64 if horizontal else (0 if x == 0 else 160))
			var sy := (64 if vertical else (0 if y == 0 else 160))
			if raised:
				sx += 320
			draw_texture_rect_region(textures[kind], Rect2(origin + Vector2(x, y) * 32, Vector2(32, 32)), Rect2(sx, sy, 32, 32), tint)

func _draw() -> void:
	if layout == null:
		return
	var keys: Array = layout.cells.keys()
	keys.sort_custom(func(a, b): return a.y < b.y if a.y != b.y else a.x < b.x)

	for cell in keys:
		var p: Vector2 = layout.ORIGIN + Vector2(cell) * 64
		# Neighboring waves start at different frames.
		var frame := (int(elapsed * 5.0) + absi(cell.x * 7 + cell.y * 11)) % 16
		draw_texture_rect_region(foam, Rect2(p - Vector2(32, 32), Vector2(128, 128)), Rect2(frame * 192 + 32, 32, 128, 128))
	# Flat ground first; elevated shadows sit on top of it, one tile below tops.
	for cell in keys:
		if layout.height_at(cell) == 0:
			draw_tile(cell, "meadow" if layout.cells[cell] == "stairs" else layout.cells[cell])
	for cell in keys:
		if layout.height_at(cell) > 0:
			var p: Vector2 = layout.ORIGIN + Vector2(cell) * 64
			draw_texture_rect_region(shadow, Rect2(p - Vector2(32, 32), Vector2(128, 128)), Rect2(32, 32, 128, 128))
	for cell in keys:
		if layout.height_at(cell) > 0 or layout.cells[cell] == "stairs":
			draw_tile(cell, layout.cells[cell])
	if editing:
		for y in range(layout.MIN_CELL.y, layout.MAX_CELL.y + 1):
			for x in range(layout.MIN_CELL.x, layout.MAX_CELL.x + 1):
				draw_rect(Rect2(layout.ORIGIN + Vector2(x, y) * 64, Vector2(64, 64)), Color(0.9, 1, 0.9, 0.14), false, 1)
		if layout.in_bounds(hover):
			var tint := Color(0.7, 1, 0.65, 0.6) if valid else Color(1, 0.35, 0.3, 0.6)
			if (tool == "ground" or tool in layout.KINDS) and not layout.cells.has(hover):
				draw_tile(hover, layout.automatic_kind(hover) if tool == "ground" else tool, tint)
			draw_rect(Rect2(layout.ORIGIN + Vector2(hover) * 64 - Vector2(0, layout.height_at(hover)), Vector2(64, 64)), Color(0.85, 1, 0.8, 0.45) if valid else tint, false, 1 if valid else 3)
