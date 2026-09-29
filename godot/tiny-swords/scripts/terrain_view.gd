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

func stair_joins(cell: Vector2i, side: Vector2i) -> bool:
	var neighbor := cell + side
	return layout.cells.get(neighbor) == "stairs" and neighbor + layout.stair_direction(neighbor) == cell

func cliff_region(cell: Vector2i) -> Rect2:
	var left := joined(cell, Vector2i.LEFT)
	var right := joined(cell, Vector2i.RIGHT)
	var column := (1 if left else 0) if right else (2 if left else 3)
	# Complete cliff pieces, including the authored center and narrow pillar.
	var below := cell + Vector2i.DOWN
	var meets_land: bool = layout.cells.has(below) and layout.height_at(below) == 0
	return Rect2(320 + column * 64, 256 if meets_land else 320, 64, 64)

func shadow_rect(cell: Vector2i) -> Rect2:
	var top: Vector2 = layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, layout.height_at(cell))
	# A 128px shadow centered on the 64px top, shifted one full tile down.
	return Rect2(top + Vector2(-32, 32), Vector2(128, 128))

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
			draw_texture_rect_region(textures[kind], Rect2(origin + Vector2(0, 64), Vector2(64, 64)), cliff_region(cell), tint)
	var region := ground_region(cell, kind)
	if raised and (stair_joins(cell, Vector2i.LEFT) or stair_joins(cell, Vector2i.RIGHT)):
		# The ramp joins the walkable surface and cliff, so no grass lip
		# may cut across that connection. Preserve the far edge and top rim.
		var connector := region
		connector.position.y = 64 if joined(cell, Vector2i.UP) else 0
		for half in range(2):
			var side := Vector2i.LEFT if half == 0 else Vector2i.RIGHT
			var source := connector if stair_joins(cell, side) else region
			source.position.x += half * 32
			source.size.x = 32
			draw_texture_rect_region(textures[kind], Rect2(origin + Vector2(half * 32, 0), Vector2(32, 64)), source, tint)
	else:
		draw_texture_rect_region(textures[kind], Rect2(origin, Vector2(64, 64)), region, tint)

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
			draw_texture_rect_region(shadow, shadow_rect(cell), Rect2(32, 32, 128, 128))
	# Raised surfaces are separate Y-sorted World pieces.

func placement_offset() -> Vector2:
	# Only the target cell snaps; the held artwork follows every mouse motion.
	return preview_position - (layout.center(hover) - Vector2(0, layout.height_at(hover)))

func tree_preview_rect() -> Rect2:
	var frame_size := Vector2(tree_texture.get_width() / 8.0, tree_texture.get_height())
	return Rect2(preview_position + (Vector2(0, -112) - frame_size / 2) * 0.8, frame_size * 0.8)

func pickup_outline() -> PackedVector2Array:
	var origin: Vector2 = layout.ORIGIN + Vector2(hover) * 64
	var direction: Vector2i = layout.stair_direction(hover)
	# Trace the ramp and elevated landing together in world space.
	var points := PackedVector2Array([Vector2(0, -64), Vector2(128, -64), Vector2(128, 0), Vector2(64, 0), Vector2(64, 64), Vector2(0, 64), Vector2(0, -64)])
	for i in points.size():
		if direction.x < 0:
			points[i].x = 64 - points[i].x
		points[i] += origin
	return points

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
			if tool == "remove" and layout.cells.get(hover) == "stairs":
				draw_polyline(pickup_outline(), Color(0.85, 1, 0.8, 0.55), 1)
			else:
				draw_rect(Rect2(layout.ORIGIN + Vector2(hover) * 64 - Vector2(0, layout.height_at(hover)), Vector2(64, 64)), Color(0.85, 1, 0.8, 0.45), false, 1)
