extends Node2D

var editor_source = null
var piece = null
var layout
var editing := false
var hover := Vector2i(999, 999)
var preview_position := Vector2.ZERO
var tree_texture := preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")
var valid := false
var tool := "meadow"
var elapsed := 0.0
var textures: Dictionary = {}
var shadow := preload("res://Tiny Swords (Free Pack)/Terrain/Tileset/Shadow.png")
var foam := preload("res://Tiny Swords (Free Pack)/Terrain/Tileset/Water Foam.png")

func _ready() -> void:
	for kind in layout.KINDS:
		textures[kind] = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % layout.COLORS[kind])

func _process(delta: float) -> void:
	if piece != null:
		return
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

func ground_region(cell: Vector2i, kind: String) -> Rect2:
	# The guide's sixteen full 64px pieces: three edges/center plus a
	# dedicated narrow-strip column and row. Do not repeat half-tile art.
	var left := joined(cell, Vector2i.LEFT)
	var right := joined(cell, Vector2i.RIGHT)
	var up := joined(cell, Vector2i.UP)
	var down := joined(cell, Vector2i.DOWN)
	var column := (1 if left else 0) if right else (2 if left else 3)
	var row := (1 if up else 0) if down else (2 if up else 3)
	return Rect2(column * 64 + (320 if kind.begins_with("high_") else 0), row * 64, 64, 64)

func draw_tile(cell: Vector2i, kind: String, tint := Color.WHITE) -> void:
	var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64
	var raised: bool = kind.begins_with("high_")
	if kind == "stairs":
		var direction: Vector2i = layout.stair_direction(cell) if layout.cells.get(cell) == "stairs" else layout.available_stair_direction(cell)
		draw_texture_rect_region(textures[kind], Rect2(origin - Vector2(0, 64), Vector2(64, 128)), Rect2(0 if direction.x >= 0 else 192, 256, 64, 128), tint)
		return
	if raised:
		origin.y -= 64
		if not joined(cell, Vector2i.DOWN):
			for half in range(2):
				draw_texture_rect_region(textures[kind], Rect2(origin + Vector2(half * 32, 64), Vector2(32, 64)), cliff_region(cell, half), tint)
	draw_texture_rect_region(textures[kind], Rect2(origin, Vector2(64, 64)), ground_region(cell, kind), tint)

func _draw() -> void:
	if layout == null:
		return
	if editor_source != null:
		editing = editor_source.editing
		hover = editor_source.hover
		valid = editor_source.valid
		tool = editor_source.tool
		preview_position = editor_source.preview_position
		draw_editor()
		return
	if piece != null:
		draw_set_transform(-position)
		draw_tile(piece, layout.cells[piece])
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
	# Raised surfaces are separate Y-sorted World pieces.

func placement_offset() -> Vector2:
	# Only the target cell snaps; the held artwork follows every mouse motion.
	return preview_position - (layout.center(hover) - Vector2(0, layout.height_at(hover)))

func tree_preview_rect() -> Rect2:
	var frame_size := Vector2(tree_texture.get_width() / 8.0, tree_texture.get_height())
	return Rect2(preview_position + (Vector2(0, -112) - frame_size / 2) * 0.8, frame_size * 0.8)

func draw_editor() -> void:
	if editing:
		for y in range(layout.MIN_CELL.y, layout.MAX_CELL.y + 1):
			for x in range(layout.MIN_CELL.x, layout.MAX_CELL.x + 1):
				draw_rect(Rect2(layout.ORIGIN + Vector2(x, y) * 64, Vector2(64, 64)), Color(0.9, 1, 0.9, 0.14), false, 1)
		if layout.in_bounds(hover) and valid:
			var tint := Color(0.7, 1, 0.65, 0.6)
			draw_set_transform(placement_offset())
			if (tool == "ground" or tool in layout.KINDS) and (tool == "stairs" or not layout.cells.has(hover)):
				draw_tile(hover, layout.automatic_kind(hover) if tool == "ground" else tool, tint)
				if tool == "stairs" and valid:
					var landing: Vector2i = hover + layout.available_stair_direction(hover)
					draw_tile(landing, "high_gold", tint)
			draw_set_transform(Vector2.ZERO)
			if tool == "tree":
				draw_texture_rect_region(tree_texture, tree_preview_rect(), Rect2(0, 0, tree_texture.get_width() / 8.0, tree_texture.get_height()), tint)
			draw_rect(Rect2(layout.ORIGIN + Vector2(hover) * 64 - Vector2(0, layout.height_at(hover)), Vector2(64, 64)), Color(0.85, 1, 0.8, 0.45), false, 1)
