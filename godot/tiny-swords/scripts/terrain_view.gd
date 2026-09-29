extends Node2D

var layout
var editing := false
var hover := Vector2i(999, 999)
var valid := false
var tool := "meadow"
var elapsed := 0.0
var textures: Dictionary = {}
var foam := preload("res://art/environment/Water Foam.png")

func _ready() -> void:
	for kind in layout.KINDS:
		textures[kind] = load("res://art/builder/Tilemap_color%s.png" % layout.COLORS[kind])

func _process(delta: float) -> void:
	elapsed += delta
	queue_redraw()

func joined(cell: Vector2i, step: Vector2i) -> bool:
	return layout.cells.has(cell + step) and layout.height_at(cell) == layout.height_at(cell + step)

func draw_tile(cell: Vector2i, kind: String, tint := Color.WHITE) -> void:
	var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64
	var raised: bool = kind.begins_with("high_")
	if raised:
		origin.y -= 32
		if not joined(cell, Vector2i.DOWN):
			draw_texture_rect_region(textures[kind], Rect2(origin + Vector2(0, 64), Vector2(64, 32)), Rect2(512, 256, 64, 64), tint)
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
	var frame := int(elapsed * 5.0) % 16
	for cell in keys:
		var p: Vector2 = layout.ORIGIN + Vector2(cell) * 64
		# Foam is hidden beneath connected grass; visible only at the shoreline.
		draw_texture_rect_region(foam, Rect2(p - Vector2(32, 32), Vector2(128, 128)), Rect2(frame * 192, 0, 192, 192))
	for cell in keys:
		draw_tile(cell, layout.cells[cell])
	if editing:
		for y in range(layout.MIN_CELL.y, layout.MAX_CELL.y + 1):
			for x in range(layout.MIN_CELL.x, layout.MAX_CELL.x + 1):
				draw_rect(Rect2(layout.ORIGIN + Vector2(x, y) * 64, Vector2(64, 64)), Color(0.9, 1, 0.9, 0.14), false, 1)
		if layout.in_bounds(hover):
			var tint := Color(0.7, 1, 0.65, 0.6) if valid else Color(1, 0.35, 0.3, 0.6)
			if tool in layout.KINDS and not layout.cells.has(hover):
				draw_tile(hover, tool, tint)
			if not valid:
				draw_rect(Rect2(layout.ORIGIN + Vector2(hover) * 64 - Vector2(0, layout.height_at(hover)), Vector2(64, 64)), tint, false, 3)
