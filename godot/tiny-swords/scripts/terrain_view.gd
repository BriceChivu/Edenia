extends Node2D

var editor_source = null
var piece = null
var shadow_height := -1.0
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
	if piece != null or shadow_height >= 0:
		return
	elapsed += delta
	queue_redraw()

func joined(cell: Vector2i, step: Vector2i) -> bool:
	var neighbor := cell + step
	if not layout.cells.has(neighbor):
		return false
	if layout.cells[neighbor] == "stairs":
		var direction: Vector2i = layout.stair_direction(neighbor)
		return (neighbor + direction == cell and layout.height_at(cell) == layout.height_at(neighbor) + 64) or (neighbor - direction == cell and layout.height_at(cell) == layout.height_at(neighbor))
	return layout.height_at(cell) == layout.height_at(neighbor)

func stair_joins(cell: Vector2i, side: Vector2i) -> bool:
	var neighbor := cell + side
	return layout.cells.get(neighbor) == "stairs" and neighbor + layout.stair_direction(neighbor) == cell

func cliff_region(cell: Vector2i, layer_height: float = -1) -> Rect2:
	var height: float = layout.height_at(cell) if layer_height < 0 else layer_height
	# Cliff columns join solid supports at this layer, including ramp bases.
	var left: bool = layout.cells.has(cell + Vector2i.LEFT) and layout.height_at(cell + Vector2i.LEFT) >= height
	var right: bool = layout.cells.has(cell + Vector2i.RIGHT) and layout.height_at(cell + Vector2i.RIGHT) >= height
	# The ramp's upper edge connects the top cliff to its landing.
	if height == layout.height_at(cell):
		left = left or stair_joins(cell, Vector2i.LEFT)
		right = right or stair_joins(cell, Vector2i.RIGHT)
	var column := (1 if left else 0) if right else (2 if left else 3)
	var below := cell + Vector2i.DOWN
	# Only the lowest exposed layer can contain the authored water edge.
	var shoreline: bool = height == 64 and not layout.cells.has(below)
	return Rect2(320 + column * 64, 320 if shoreline else 256, 64, 64)

func draw_support(cell: Vector2i, height: float, tint: Color) -> void:
	var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64
	var below := cell + Vector2i.DOWN
	var covered: float = layout.height_at(below) if layout.cells.has(below) else 0.0
	for layer in range(64, int(height) + 1, 64):
		if layer <= covered:
			continue
		var texture = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % layout.palette_at_height(layer))
		draw_texture_rect_region(texture, Rect2(origin - Vector2(0, layer - 64), Vector2(64, 64)), cliff_region(cell, layer), tint)

func shadow_rect(cell: Vector2i, layer_height: float = -1) -> Rect2:
	var height: float = layout.height_at(cell) if layer_height < 0 else layer_height
	var top: Vector2 = layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, height)
	# A 128px shadow centered on the 64px top, shifted one full tile down.
	return Rect2(top + Vector2(-32, 32), Vector2(128, 128))

func draw_shadows(height: float) -> void:
	for cell in layout.cells:
		# Each supporting tier has its own footprint, even when another floor
		# covers its top. Elevated ramp bases also contain solid supports.
		if layout.height_at(cell) >= height:
			draw_texture_rect_region(shadow, shadow_rect(cell, height), Rect2(32, 32, 128, 128))

func ground_region(cell: Vector2i, kind: String) -> Rect2:
	# The guide's sixteen full 64px pieces: three edges/center plus a
	# dedicated narrow-strip column and row. Do not repeat half-tile art.
	# The bottom layer is continuous beneath elevated ground. Its shore
	# follows the island footprint, not changes in walking elevation.
	var raised := kind.begins_with("high_")
	var left: bool = joined(cell, Vector2i.LEFT) if raised else layout.cells.has(cell + Vector2i.LEFT)
	var right: bool = joined(cell, Vector2i.RIGHT) if raised else layout.cells.has(cell + Vector2i.RIGHT)
	var up: bool = joined(cell, Vector2i.UP) if raised else layout.cells.has(cell + Vector2i.UP)
	var down: bool = joined(cell, Vector2i.DOWN) if raised else layout.cells.has(cell + Vector2i.DOWN)
	var column := (1 if left else 0) if right else (2 if left else 3)
	var row := (1 if up else 0) if down else (2 if up else 3)
	# Stairs open the horizontal join, but never erase the bottom grass
	# edge. Guide example 2 uses atlas (384,128) above cliff (384,256).
	return Rect2(column * 64 + (320 if kind.begins_with("high_") else 0), row * 64, 64, 64)

func draw_tile(cell: Vector2i, kind: String, tint := Color.WHITE, preview_height: float = -1) -> void:
	var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64
	var raised: bool = kind.begins_with("high_")
	var height: float = layout.height_at(cell) if layout.cells.has(cell) else layout.automatic_height(cell)
	if preview_height >= 0:
		height = preview_height
	var texture = textures[kind] if kind == "meadow" else load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % layout.palette_at_height(height + 64 if kind == "stairs" else height))
	if kind == "stairs":
		var direction: Vector2i = layout.stair_direction(cell) if layout.cells.get(cell) == "stairs" else layout.available_stair_direction(cell)
		if layout.cells.get(cell) != "stairs" and direction != Vector2i.ZERO:
			height = layout.height_at(cell - direction)
			texture = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % layout.palette_at_height(height + 64))
		draw_support(cell, height, tint)
		draw_texture_rect_region(texture, Rect2(origin - Vector2(0, height + 64), Vector2(64, 128)), Rect2(0 if direction.x >= 0 else 192, 256, 64, 128), tint)
		return
	if raised:
		origin.y -= height
		draw_support(cell, height, tint)
	draw_texture_rect_region(texture, Rect2(origin, Vector2(64, 64)), ground_region(cell, kind), tint)

func _draw() -> void:
	if layout == null:
		return
	if shadow_height >= 0:
		draw_shadows(shadow_height)
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
	# Shadow layers render separately above their receiving floor.
	for cell in keys:
		draw_tile(cell, "meadow")
	# Raised surfaces are separate Y-sorted World pieces.

func placement_offset() -> Vector2:
	# Only the target cell snaps; the held artwork follows every mouse motion.
	return preview_position - (layout.center(hover) - Vector2(0, layout.height_at(hover)))

func tree_preview_rect() -> Rect2:
	var frame_size := Vector2(tree_texture.get_width() / 8.0, tree_texture.get_height())
	return Rect2(preview_position + (Vector2(0, -112) - frame_size / 2) * 0.8, frame_size * 0.8)

func pickup_outline() -> PackedVector2Array:
	var origin: Vector2 = layout.ORIGIN + Vector2(hover) * 64 - Vector2(0, layout.height_at(hover))
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
					draw_tile(landing, layout.kind_at_height(layout.height_at(hover - layout.available_stair_direction(hover)) + 64), tint, layout.height_at(hover - layout.available_stair_direction(hover)) + 64)
			draw_set_transform(Vector2.ZERO)
			if tool == "tree":
				draw_texture_rect_region(tree_texture, tree_preview_rect(), Rect2(0, 0, tree_texture.get_width() / 8.0, tree_texture.get_height()), tint)
			if tool == "remove" and layout.cells.get(hover) == "stairs":
				draw_polyline(pickup_outline(), Color(0.85, 1, 0.8, 0.55), 1)
			else:
				draw_rect(Rect2(layout.ORIGIN + Vector2(hover) * 64 - Vector2(0, layout.height_at(hover)), Vector2(64, 64)), Color(0.85, 1, 0.8, 0.45), false, 1)
