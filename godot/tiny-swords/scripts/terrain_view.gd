extends Node2D

var editor_source = null
var piece = null
var shadow_height := -1.0
var backing_height := -1.0
var layout
var editing := false
var hover := Vector2i(999, 999)
var preview_position := Vector2.ZERO
var ground_preview_height := -1.0
var tree_texture := preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")
var valid := false
var tool := "meadow"
var elapsed := 0.0
var textures: Dictionary = {}
var shadow_textures: Array[Texture2D] = []
var shadow := preload("res://Tiny Swords (Free Pack)/Terrain/Tileset/Shadow.png")
var foam := preload("res://Tiny Swords (Free Pack)/Terrain/Tileset/Water Foam.png")

func _ready() -> void:
	for kind in layout.KINDS:
		textures[kind] = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % layout.COLORS[kind])

func _process(delta: float) -> void:
	if piece != null or shadow_height >= 0 or backing_height >= 0:
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
	var below: Vector2i = cell + Vector2i.DOWN
	# Choose the foot from the receiving tile, not the platform's height.
	# A lower support is solid too; only a cliff directly above open water
	# gets the authored water edge. This also applies to raised ramp bases.
	var receiving_height: float = layout.height_at(below) if layout.cells.has(below) else 0.0
	var above_grass: bool = layout.cells.has(below) and receiving_height == height - 64
	var above_support: bool = height > receiving_height + 64
	var shoreline: bool = not above_grass and not above_support
	return Rect2(320 + column * 64, 320 if shoreline else 256, 64, 64)

func cliff_grass_sides(cell: Vector2i, height: float) -> Array[bool]:
	var sides: Array[bool] = []
	for direction in [Vector2i.LEFT, Vector2i.RIGHT]:
		var neighbor: Vector2i = cell + direction
		sides.append(layout.cells.has(neighbor) and layout.height_at(neighbor) == height - 64 and not (height == layout.height_at(cell) and stair_joins(cell, direction)))
	return sides

func floor_texture(height: float) -> Texture2D:
	var key := "floor:%s" % layout.palette_at_height(height)
	if not textures.has(key):
		textures[key] = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % layout.palette_at_height(height))
	return textures[key]

func receiving_ground_region(cell: Vector2i, floor_height: float) -> Rect2:
	if floor_height == 0:
		return ground_region(cell, "meadow")
	var neighbors: Array[bool] = []
	for direction in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
		var neighbor: Vector2i = cell + direction
		neighbors.append(layout.cells.has(neighbor) and layout.height_at(neighbor) >= floor_height)
	var column := (1 if neighbors[0] else 0) if neighbors[1] else (2 if neighbors[0] else 3)
	var row := (1 if neighbors[2] else 0) if neighbors[3] else (2 if neighbors[2] else 3)
	return Rect2(column * 64, row * 64, 64, 64)

func ground_backing_regions(cell: Vector2i, floor_height: float) -> Array[Rect2]:
	var regions: Array[Rect2] = []
	var ground := receiving_ground_region(cell, floor_height)
	var below: Vector2i = cell + Vector2i.DOWN
	if layout.cells.get(cell) == "stairs" and layout.height_at(cell) == floor_height:
		if layout.cells.has(below) and layout.height_at(below) == floor_height:
			regions.append(ground)
	elif layout.height_at(cell) > floor_height:
		# A tier covered by the tile in front has no visible cliff roots.
		if layout.cells.has(below) and layout.height_at(below) >= floor_height + 64:
			return regions
		if cliff_region(cell, floor_height + 64).position.y == 256:
			regions.append(ground)
		else:
			var sides := cliff_grass_sides(cell, floor_height + 64)
			for side in range(2):
				if sides[side]:
					regions.append(Rect2(ground.position + Vector2(0 if side == 0 else 48, 0), Vector2(16, 64)))
	return regions

func draw_cliff_ground(destination: Rect2, cell: Vector2i, height: float, tint: Color) -> void:
	var floor_height := height - 64
	var ground := receiving_ground_region(cell, floor_height)
	for region in ground_backing_regions(cell, floor_height):
		var offset := region.position - ground.position
		draw_texture_rect_region(floor_texture(floor_height), Rect2(destination.position + offset, region.size), region, tint)

func draw_floor_backing(floor_height: float) -> void:
	for cell in layout.cells:
		var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, floor_height)
		draw_cliff_ground(Rect2(origin, Vector2(64, 64)), cell, floor_height + 64, Color.WHITE)

func draw_cliff(texture: Texture2D, destination: Rect2, cell: Vector2i, height: float, tint: Color) -> void:
	var region := cliff_region(cell, height)
	var sides := cliff_grass_sides(cell, height)
	if region.position.y != 320 or not (sides[0] or sides[1]):
		draw_texture_rect_region(texture, destination, region, tint)
		return
	# Composite source pixels without overlaying transparent water onto grass.
	# Grass-facing sides own the full edge, including the bottom corner.
	# The water foot stays between them and never wraps onto the land side.
	for x in range(64):
		var grass_height := 0
		if sides[0] and x < 16:
			grass_height = 64
		if sides[1] and x >= 48:
			grass_height = 64
		if grass_height > 0:
			draw_texture_rect_region(texture, Rect2(destination.position + Vector2(x, 0), Vector2(1, grass_height)), Rect2(region.position.x + x, 256, 1, grass_height), tint)
		if grass_height < 64:
			draw_texture_rect_region(texture, Rect2(destination.position + Vector2(x, grass_height), Vector2(1, 64 - grass_height)), Rect2(region.position + Vector2(x, grass_height), Vector2(1, 64 - grass_height)), tint)

func draw_support(cell: Vector2i, height: float, tint: Color) -> void:
	var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64
	var below: Vector2i = cell + Vector2i.DOWN
	var covered: float = layout.height_at(below) if layout.cells.has(below) else 0.0
	for layer in range(64, int(height) + 1, 64):
		if layer <= covered:
			continue
		var texture = floor_texture(layer)
		if piece == null:
			draw_cliff_ground(Rect2(origin - Vector2(0, layer - 64), Vector2(64, 64)), cell, layer, tint)
		draw_cliff(texture, Rect2(origin - Vector2(0, layer - 64), Vector2(64, 64)), cell, layer, tint)

func shadow_rect(cell: Vector2i, layer_height: float = -1) -> Rect2:
	var height: float = layout.height_at(cell) if layer_height < 0 else layer_height
	var top: Vector2 = layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, height)
	# A 128px shadow centered on the 64px top, shifted one full tile down.
	return Rect2(top + Vector2(-32, 32), Vector2(128, 128))

func draw_shadows(height: float) -> void:
	shadow_textures.clear()
	var receivers := shadow_receivers(height - 64)
	var source := shadow.get_image()
	for cell in layout.cells:
		# Each supporting tier has its own footprint, even when another floor
		# covers its top. The ramp itself also casts onto its lower floor.
		var casting_height: float = layout.height_at(cell) + (64 if layout.cells[cell] == "stairs" else 0)
		if casting_height < height:
			continue
		var destination := shadow_rect(cell, height)
		var clipped := Image.create(128, 128, false, Image.FORMAT_RGBA8)
		# Clip to authored grass pixels, including the irregular shoreline.
		# A tile-sized clip would still darken water through transparent edges.
		for y in range(128):
			for x in range(128):
				if receivers.has(Vector2i(destination.position) + Vector2i(x, y)):
					clipped.set_pixel(x, y, source.get_pixel(32 + x, 32 + y))
		var texture := ImageTexture.create_from_image(clipped)
		shadow_textures.append(texture)
		draw_texture(texture, destination.position)

func add_shadow_receiver(receivers: Dictionary, destination: Vector2, region: Rect2, atlas: Image) -> void:
	for y in range(int(region.size.y)):
		for x in range(int(region.size.x)):
			if atlas.get_pixel(int(region.position.x) + x, int(region.position.y) + y).a > 0.99:
				receivers[Vector2i(destination) + Vector2i(x, y)] = true

func shadow_receivers(floor_height: float) -> Dictionary:
	var receivers: Dictionary = {}
	var atlas = floor_texture(floor_height).get_image()
	for cell in layout.cells:
		var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, floor_height)
		if layout.height_at(cell) == floor_height:
			var kind: String = "meadow" if floor_height == 0 else layout.kind_at_height(floor_height)
			add_shadow_receiver(receivers, origin, ground_region(cell, kind), atlas)
		# Backing under roots receives the same shadows as the terrace.
		var ground := receiving_ground_region(cell, floor_height)
		for region in ground_backing_regions(cell, floor_height):
			add_shadow_receiver(receivers, origin + region.position - ground.position, region, atlas)
	return receivers

func ground_region(cell: Vector2i, kind: String) -> Rect2:
	# The guide's sixteen full 64px pieces: three edges/center plus a
	# dedicated narrow-strip column and row. Do not repeat half-tile art.
	# The bottom layer is continuous beneath elevated ground. Its shore
	# follows the island footprint, not changes in walking elevation.
	var raised := kind.begins_with("high_")
	var left: bool = joined(cell, Vector2i.LEFT) if raised else layout.cells.has(cell + Vector2i.LEFT)
	var right: bool = joined(cell, Vector2i.RIGHT) if raised else layout.cells.has(cell + Vector2i.RIGHT)
	# Taller neighbors have solid backing at this floor too. Continue the
	# grass into their cliff instead of drawing a shoreline rim beside it.
	if raised:
		left = left or (layout.cells.has(cell + Vector2i.LEFT) and layout.height_at(cell + Vector2i.LEFT) > layout.height_at(cell))
		right = right or (layout.cells.has(cell + Vector2i.RIGHT) and layout.height_at(cell + Vector2i.RIGHT) > layout.height_at(cell))
	# A higher tile or ramp behind this terrace covers its back edge.
	# Continue the receiving grass beneath the cliff instead of adding a rim.
	var up: bool = layout.cells.has(cell + Vector2i.UP) and (not raised or layout.height_at(cell + Vector2i.UP) >= layout.height_at(cell))
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
	var texture = textures[kind] if kind == "meadow" else floor_texture(height + 64 if kind == "stairs" else height)
	if kind == "stairs":
		var direction: Vector2i = layout.stair_direction(cell) if layout.cells.get(cell) == "stairs" else layout.available_stair_direction(cell)
		if layout.cells.get(cell) != "stairs" and direction != Vector2i.ZERO:
			height = layout.height_at(cell - direction)
			texture = floor_texture(height + 64)
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
	if backing_height >= 0:
		draw_floor_backing(backing_height)
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
		ground_preview_height = editor_source.ground_preview_height
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
		# Solid cliff supports replace the base tile. Drawing grass beneath
		# them leaks its leafy rim through the water cliff's transparent foot.
		if layout.height_at(cell) == 0:
			draw_tile(cell, "meadow")
	# Grass behind transparent cliff roots belongs to the receiving floor.
	# Draw it before shadows, rather than repainting it in the raised piece.
	for cell in keys:
		if layout.height_at(cell) > 0:
			draw_cliff_ground(Rect2(layout.ORIGIN + Vector2(cell) * 64, Vector2(64, 64)), cell, 64, Color.WHITE)
	# Raised surfaces are separate Y-sorted World pieces.

func grass_preview_height() -> float:
	return ground_preview_height if ground_preview_height >= 0 else layout.automatic_height(hover)

func placement_offset() -> Vector2:
	# Only the target cell snaps; the held artwork follows every mouse motion.
	var height: float = grass_preview_height() if tool == "ground" else layout.height_at(hover)
	return preview_position - (layout.center(hover) - Vector2(0, height))

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
			if (tool == "ground" or tool in layout.KINDS) and (tool in ["stairs", "ground"] or not layout.cells.has(hover)):
				draw_tile(hover, layout.kind_at_height(grass_preview_height()) if tool == "ground" else tool, tint, grass_preview_height() if tool == "ground" else -1)
				if tool == "stairs" and valid:
					var landing: Vector2i = hover + layout.available_stair_direction(hover)
					draw_tile(landing, layout.kind_at_height(layout.height_at(hover - layout.available_stair_direction(hover)) + 64), tint, layout.height_at(hover - layout.available_stair_direction(hover)) + 64)
			draw_set_transform(Vector2.ZERO)
			if tool == "tree":
				draw_texture_rect_region(tree_texture, tree_preview_rect(), Rect2(0, 0, tree_texture.get_width() / 8.0, tree_texture.get_height()), tint)
			if tool == "remove" and layout.cells.get(hover) == "stairs":
				draw_polyline(pickup_outline(), Color(0.85, 1, 0.8, 0.55), 1)
			else:
				var outline_height: float = grass_preview_height() if tool == "ground" else layout.height_at(hover)
				draw_rect(Rect2(layout.ORIGIN + Vector2(hover) * 64 - Vector2(0, outline_height), Vector2(64, 64)), Color(0.85, 1, 0.8, 0.45), false, 1)
