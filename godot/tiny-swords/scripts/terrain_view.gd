extends Node2D

const LevelFiveArt = preload("res://scripts/level_five_art.gd")

const InventoryOutline = preload("res://scripts/inventory_outline.gd")

const TreeArt = preload("res://scripts/tree_art.gd")

var changes: Array[Dictionary] = []
var outline_trees: Array[Node] = []
var transform_preview := false
var editor_source = null
var render_source = null
var proposed_terrain = null
var piece = null
var shadow_height := -1.0
var backing_height := -1.0
var layout
var editing := false
var hover := Vector2i(999, 999)
var preview_position := Vector2.ZERO
var ground_preview_height := -1.0
var tree_texture: Texture2D = TreeArt.TEXTURE
var tree_preview_texture: Texture2D
var tree_preview_kind := ""
var tree_preview_ground := {}
var tree_preview_offset := Vector2(INF, INF)
var valid := false
var tool := "meadow"
var elapsed := 0.0
var textures: Dictionary = {}
var drawing_inputs: Array = []
var drawing_revision := 0
var geometry_inputs: Array = []
var geometry_revision := 0
var sorted_cells: Array = []
var foam_layer
var shadow_textures: Array[Texture2D] = []
var shadow_positions: Array[Vector2] = []
var shadow_source: Image
var shadow_atlases: Dictionary = {}
var shadow_cache_cells: Dictionary = {}
var shadow_cache_elevations: Dictionary = {}
var shadow_cache_stairs: Dictionary = {}
var shadow_cache_height := INF
var shadow_receiver_mask: Dictionary = {}
var shadow_receivers_ready := false
var shadow_textures_ready := false
var shadow := preload("res://Tiny Swords (Free Pack)/Terrain/Tileset/Shadow.png")
var foam := preload("res://Tiny Swords (Free Pack)/Terrain/Tileset/Water Foam.png")
var water_stair := preload("res://assets/terrain/stair-ramp-water.png")

func _ready() -> void:
	for kind in layout.KINDS:
		textures[kind] = load("res://Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color%s.png" % layout.COLORS[kind])
	if piece == null and shadow_height < 0 and backing_height < 0 and editor_source == null:
		foam_layer = preload("res://scripts/terrain_foam.gd").new()
		foam_layer.terrain = self
		foam_layer.show_behind_parent = true
		add_child(foam_layer)

func _process(delta: float) -> void:
	elapsed += delta
	refresh_drawing()
	if foam_layer != null:
		foam_layer.update_frame(sorted_cells, int(elapsed * 5.0) % 16)

func display_layout():
	var source = render_source if render_source != null else self
	var proposed = source.terrain_render_layout() if editor_source == null else null
	return proposed if proposed != null else layout

func refresh_drawing() -> bool:
	var current = display_layout()
	if current == null:
		return false
	var geometry: Array = [current.cells, current.elevations, current.stair_directions, current.manual_ground_elevation]
	if geometry != geometry_inputs:
		geometry_inputs = geometry.duplicate(true)
		geometry_revision += 1
		if piece == null and shadow_height < 0 and backing_height < 0 and editor_source == null:
			sorted_cells = current.cells.keys()
			sorted_cells.sort_custom(func(a, b): return a.y < b.y if a.y != b.y else a.x < b.x)
	var inputs: Array = [geometry_revision, piece, shadow_height, backing_height]
	if editor_source != null:
		var source = editor_source
		inputs.append_array([source.editing, source.hover, source.valid, source.tool,
			source.preview_position, source.ground_preview_height, source.changes,
			source.transform_preview, current.trees, current.tree_types, current.houses,
			current.house_offsets, current.house_bundle, current.bridges, current.next_tree_variant])
		if source.editing:
			for tree in source.outline_trees:
				inputs.append_array([tree.get_meta("cell"), tree.frame])
	if inputs == drawing_inputs:
		return false
	drawing_inputs = inputs.duplicate(true)
	drawing_revision += 1
	queue_redraw()
	return true

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
	# Water-level grass ends beside a shoreline cliff; neither surface
	# extends into the other. Stair ramps retain their receiving joins.
	if water_level_cliff(cell, height):
		return [false, false]
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
		elif not layout.cells.has(below):
			# Keep receiving grass at the side joins, leaving the bottom in water.
			var sides := cliff_grass_sides(cell, floor_height + 64)
			for side in range(2):
				if sides[side]:
					regions.append(Rect2(ground.position + Vector2(0 if side == 0 else 48, 0), Vector2(16, 64)))
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

func update_shadow_geometry(height: float) -> void:
	# _draw can substitute a newly allocated preview every frame. Compare the
	# actual geometry, not layout identity or the transient proposed_terrain.
	# Rebuild paths replace these views; this also covers in-place edits/restores.
	if shadow_cache_height == height and shadow_cache_cells == layout.cells and shadow_cache_elevations == layout.elevations and shadow_cache_stairs == layout.stair_directions:
		return
	shadow_cache_height = height
	shadow_cache_cells = layout.cells.duplicate()
	shadow_cache_elevations = layout.elevations.duplicate()
	shadow_cache_stairs = layout.stair_directions.duplicate()
	shadow_receiver_mask.clear()
	shadow_textures.clear()
	shadow_positions.clear()
	shadow_receivers_ready = false
	shadow_textures_ready = false

func draw_shadows(height: float) -> void:
	prepare_shadow_textures(height)
	for index in shadow_textures.size():
		draw_texture(shadow_textures[index], shadow_positions[index])

func prepare_shadow_textures(height: float) -> void:
	update_shadow_geometry(height)
	if shadow_textures_ready:
		return
	var receivers := shadow_receivers(height - 64)
	if shadow_source == null:
		shadow_source = shadow.get_image()
	var source := shadow_source
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
		shadow_positions.append(destination.position)
	shadow_textures_ready = true

func add_shadow_receiver(receivers: Dictionary, destination: Vector2, region: Rect2, atlas: Image) -> void:
	for y in range(int(region.size.y)):
		for x in range(int(region.size.x)):
			if atlas.get_pixel(int(region.position.x) + x, int(region.position.y) + y).a > 0.99:
				receivers[Vector2i(destination) + Vector2i(x, y)] = true

func shadow_receivers(floor_height: float) -> Dictionary:
	update_shadow_geometry(floor_height + 64)
	if shadow_receivers_ready:
		return shadow_receiver_mask
	var receivers := shadow_receiver_mask
	var palette: int = layout.palette_at_height(floor_height)
	if not shadow_atlases.has(palette):
		shadow_atlases[palette] = floor_texture(floor_height).get_image()
	var atlas: Image = shadow_atlases[palette]
	for cell in layout.cells:
		var origin: Vector2 = layout.ORIGIN + Vector2(cell) * 64 - Vector2(0, floor_height)
		if layout.height_at(cell) == floor_height:
			# Water-facing ramp roots have no grass backing to receive shadows.
			if layout.cells[cell] != "stairs" or layout.cells.has(cell + Vector2i.DOWN):
				var kind: String = "meadow" if floor_height == 0 else layout.kind_at_height(floor_height)
				add_shadow_receiver(receivers, origin, ground_region(cell, kind), atlas)
		# Backing under roots receives the same shadows as the terrace.
		var ground := receiving_ground_region(cell, floor_height)
		for region in ground_backing_regions(cell, floor_height):
			add_shadow_receiver(receivers, origin + region.position - ground.position, region, atlas)
	shadow_receivers_ready = true
	return receivers

func water_level_cliff(cell: Vector2i, height: float = -1) -> bool:
	if not layout.cells.has(cell) or layout.cells[cell] == "stairs":
		return false
	var layer: float = layout.height_at(cell) if height < 0 else height
	# Only an exposed base closes neighboring grass. A raised tile in
	# front covers this cliff tier, so the grass beside the rear tile joins.
	var below := cell + Vector2i.DOWN
	if layout.cells.has(below) and layout.height_at(below) >= layer:
		return false
	return layer == 64 and cliff_region(cell, layer).position.y == 320

func base_grass_side_join(cell: Vector2i, direction: Vector2i) -> bool:
	var neighbor := cell + direction
	return layout.cells.has(neighbor) and not water_level_cliff(neighbor)

func ground_region(cell: Vector2i, kind: String) -> Rect2:
	# The guide's sixteen full 64px pieces: three edges/center plus a
	# dedicated narrow-strip column and row. Do not repeat half-tile art.
	# The bottom layer is continuous beneath elevated ground. Its shore
	# follows the island footprint, except at the sides of water cliffs.
	# There the water-level grass keeps its own closed end edge.
	var raised := kind.begins_with("high_")
	var left: bool = joined(cell, Vector2i.LEFT) if raised else base_grass_side_join(cell, Vector2i.LEFT)
	var right: bool = joined(cell, Vector2i.RIGHT) if raised else base_grass_side_join(cell, Vector2i.RIGHT)
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
		var ramp_rect := Rect2(origin - Vector2(0, height + 64), Vector2(64, 128))
		if not layout.cells.has(cell + Vector2i.DOWN):
			if piece == null and height == 0:
				draw_cliff_ground(Rect2(origin, Vector2(64, 64)), cell, 64, tint)
			# Only the bottom 16px use the custom shoreline. Keep the original
			# ramp and its side joins above that edge, in the current floor palette.
			draw_texture_rect_region(texture, Rect2(ramp_rect.position, Vector2(64, 112)), Rect2(0 if direction.x >= 0 else 192, 256, 64, 112), tint)
			var edge_rect := Rect2(ramp_rect.position + Vector2(0, 112), Vector2(64, 16))
			if direction.x >= 0:
				edge_rect.size.x = -64
			draw_texture_rect_region(water_stair, edge_rect, Rect2(0, 112, 64, 16), tint)
		else:
			draw_texture_rect_region(texture, ramp_rect, Rect2(0 if direction.x >= 0 else 192, 256, 64, 128), tint)
		return
	if raised:
		origin.y -= height
		draw_support(cell, height, tint)
	draw_texture_rect_region(texture, Rect2(origin, Vector2(64, 64)), ground_region(cell, kind), tint)

func _draw() -> void:
	refresh_drawing()
	var live_layout = layout
	var source = render_source if render_source != null else self
	if editor_source == null:
		var proposed = source.terrain_render_layout()
		if proposed != null:
			layout = proposed
	draw_contents()
	layout = live_layout

func terrain_render_layout():
	if not editing or not valid:
		return null
	if editor_source != null:
		return editor_source.terrain_render_layout()
	if tool == "house":
		return proposed_terrain
	if not transform_preview or tool not in ["ground", "stairs"]:
		return null
	if proposed_terrain == null:
		proposed_terrain = layout.terrain_edit_preview(hover, tool, grass_preview_height() if tool == "ground" else -1)
	return proposed_terrain

func draw_contents() -> void:
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
		changes = editor_source.changes
		outline_trees = editor_source.outline_trees
		transform_preview = editor_source.transform_preview
		draw_editor()
		return
	if piece != null:
		if not layout.cells.has(piece) or (layout.height_at(piece) == 0 and layout.cells[piece] != "stairs"):
			return
		draw_set_transform(-position)
		draw_tile(piece, layout.cells[piece])
		return
	var keys: Array = sorted_cells
	if foam_layer != null:
		foam_layer.update_frame(keys, int(elapsed * 5.0) % 16)
	# Shadow layers render separately above their receiving floor.
	for cell in keys:
		# Solid cliff supports replace the base tile. Drawing grass beneath
		# them leaks its leafy rim through the water cliff's transparent foot.
		if layout.height_at(cell) == 0:
			# Shoreline ramps supply their own base. Grass here would fill the
			# custom ramp's transparent roots after placement, unlike its preview.
			if layout.cells[cell] == "stairs" and not layout.cells.has(cell + Vector2i.DOWN):
				draw_cliff_ground(Rect2(layout.ORIGIN + Vector2(cell) * 64, Vector2(64, 64)), cell, 64, Color.WHITE)
				continue
			draw_tile(cell, "meadow")
	# Grass behind transparent cliff roots belongs to the receiving floor.
	# Draw it before shadows, rather than repainting it in the raised piece.
	for cell in keys:
		if layout.height_at(cell) > 0:
			draw_cliff_ground(Rect2(layout.ORIGIN + Vector2(cell) * 64, Vector2(64, 64)), cell, 64, Color.WHITE)
	# Raised surfaces are separate Y-sorted World pieces.

func grass_preview_height() -> float:
	return ground_preview_height if ground_preview_height >= 0 else layout.automatic_height(hover)

func grass_preview_cell() -> Vector2i:
	return layout.ground_target(hover, grass_preview_height())

func placement_offset() -> Vector2:
	# Follow mouse motion relative to the current surface. draw_tile already
	# raises grass to its proposed floor; using that floor here cancels the rise.
	var height: float = layout.height_at(hover)
	var offset: Vector2 = preview_position - (layout.center(hover) - Vector2(0, height))
	return offset

func tree_preview_variant() -> String:
	if layout.trees.has(hover):
		var current: int = layout.TREE_VARIANTS.find(layout.tree_types.get(hover, "tree"))
		return layout.TREE_VARIANTS[(current + 1) % layout.TREE_VARIANTS.size()]
	return layout.next_tree_variant

func tree_preview_position() -> Vector2:
	if layout.trees.has(hover):
		return layout.center(hover) + layout.tree_offset(hover) - Vector2(0, layout.height_at(hover))
	return preview_position

func clipped_tree_preview_texture() -> Texture2D:
	var offset: Vector2 = layout.tree_offset(hover) if layout.trees.has(hover) else placement_offset()
	offset = Vector2(clampf(offset.x, layout.TREE_OFFSET_X_MIN, layout.TREE_OFFSET_X_MAX), clampf(offset.y, layout.TREE_OFFSET_Y_MIN, layout.TREE_OFFSET_Y_MAX))
	var ground := TreeArt.shadow_ground(layout, hover)
	var kind := tree_preview_variant()
	if tree_preview_texture == null or offset != tree_preview_offset or kind != tree_preview_kind or ground != tree_preview_ground:
		tree_preview_ground = ground
		tree_preview_kind = kind
		tree_preview_offset = offset
		tree_preview_texture = TreeArt.texture_at(offset, kind, false, ground)
	return tree_preview_texture

func tree_preview_rect() -> Rect2:
	var kind := tree_preview_variant()
	var frame_size := TreeArt.frame_size(kind)
	return Rect2(tree_preview_position() + (TreeArt.art_offset(kind) - frame_size / 2) * TreeArt.SCALE, frame_size * TreeArt.SCALE)

func house_preview_rect() -> Rect2:
	var area := LevelFiveArt.house_rect(layout, hover)
	# Rotation changes the facing at the existing anchor. Only a new house
	# follows the pointer while choosing its construction location.
	if not layout.houses.has(hover):
		area.position += placement_offset()
	return area

func pickup_outline(cell := hover, direction := Vector2i.ZERO) -> PackedVector2Array:
	var origin: Vector2 = layout.stair_pickup_rects(cell)[0].position
	if direction == Vector2i.ZERO:
		direction = layout.stair_direction(cell)
	# Trace the same three squares used by pickup hit testing.
	var points := PackedVector2Array([Vector2(0, 0), Vector2(64, 0), Vector2(64, -64), Vector2(128, -64), Vector2(128, 64), Vector2(0, 64), Vector2(0, 0)])
	for i in points.size():
		if direction.x < 0:
			points[i].x = 64 - points[i].x
		points[i] += origin
	return points

func draw_stair_preview(tint: Color) -> void:
	var reversing: bool = layout.cells.get(hover) == "stairs"
	var direction: Vector2i = layout.stair_direction(hover) if reversing else layout.available_stair_direction(hover)
	var ramp := hover + direction if reversing else hover
	var landing := hover if reversing else hover + direction
	var height: float = layout.height_at(hover) if reversing else layout.height_at(hover - direction)
	var live_layout = layout
	var proposed = layout.get_script().new()
	proposed.cells = layout.cells.duplicate()
	proposed.elevations = layout.elevations.duplicate()
	proposed.stair_directions = layout.stair_directions.duplicate()
	proposed.flora = layout.flora.duplicate()
	if reversing:
		proposed.reverse_stair(hover)
	else:
		proposed.cells[ramp] = "stairs"
		proposed.elevations[ramp] = height
		proposed.stair_directions[ramp] = direction
		proposed.cells[landing] = layout.kind_at_height(height + 64)
		proposed.elevations[landing] = height + 64
	layout = proposed
	draw_tile(ramp, "stairs", tint)
	draw_tile(landing, proposed.cells[landing], tint)
	layout = live_layout

func draw_ground_preview(tint: Color) -> void:
	var height := grass_preview_height()
	var target := grass_preview_cell()
	# Atlas joins and cliff roots must see the proposed height and footprint,
	# including removal of the old square when continuing a visible terrace.
	var live_layout = layout
	var proposed = layout.get_script().new()
	proposed.cells = layout.cells.duplicate()
	proposed.elevations = layout.elevations.duplicate()
	proposed.stair_directions = layout.stair_directions.duplicate()
	proposed.flora = layout.flora.duplicate()
	proposed.manual_ground_elevation = true
	if target != hover:
		proposed.cells.erase(hover)
		proposed.elevations.erase(hover)
	proposed.cells[target] = proposed.kind_at_height(height)
	proposed.elevations[target] = height
	proposed.normalize_cliff_terraces()
	layout = proposed
	draw_tile(target, proposed.cells[target], tint)
	layout = live_layout

func draw_art_outline(texture: Texture2D, area: Rect2, region := Rect2i(), mirrored := false) -> void:
	if region.size == Vector2i.ZERO:
		region = Rect2i(Vector2i.ZERO, Vector2i(texture.get_size()))
	var scale := area.size / Vector2(region.size)
	area = area.grow_individual(InventoryOutline.WIDTH * scale.x, InventoryOutline.WIDTH * scale.y, InventoryOutline.WIDTH * scale.x, InventoryOutline.WIDTH * scale.y)
	if mirrored:
		# Negative width flips the texture while keeping the rectangle origin.
		area.size.x *= -1
	draw_texture_rect(InventoryOutline.texture_for(texture, region), area, false, InventoryOutline.COLOR)

func draw_change_outlines() -> void:
	for change in changes:
		var cell: Vector2i = change.cell
		# Replacement artwork hides the hovered tree or house's original border.
		if transform_preview and valid and cell == hover and change.tool == tool and tool in ["tree", "house"]:
			continue
		match change.tool:
			"tree":
				for sprite in outline_trees:
					if sprite.get_meta("cell") != cell:
						continue
					var kind: String = layout.tree_types.get(cell, "tree")
					var size := TreeArt.frame_size(kind)
					var area := Rect2(layout.tree_position(cell) - Vector2(0, layout.height_at(cell)) + TreeArt.art_offset(kind) - size / 2, size)
					draw_art_outline(TreeArt.TEXTURES[kind], area, Rect2i(Vector2i(sprite.frame * int(size.x), 0), Vector2i(size)))
			"house":
				var facing: int = layout.houses[cell]
				draw_art_outline(LevelFiveArt.HOUSE_TEXTURES[facing], LevelFiveArt.house_rect(layout, cell), Rect2i(), facing == 3)
			"stairs":
				draw_polyline(pickup_outline(cell), InventoryOutline.COLOR, InventoryOutline.WIDTH)
			"ground":
				draw_rect(layout.ground_surface_rect(cell), InventoryOutline.COLOR, false, InventoryOutline.WIDTH)

func draw_editor() -> void:
	if editing:
		var grid_start: Vector2 = layout.ORIGIN + Vector2(layout.MIN_CELL) * 64
		var grid_end: Vector2 = layout.ORIGIN + Vector2(layout.MAX_CELL + Vector2i.ONE) * 64
		var grid_color := Color(0.9, 1, 0.9, 0.14)
		# Negative-width lines stay one screen pixel wide under camera and
		# viewport scaling. Thin rectangle borders can vanish between pixels.
		for x in range(layout.MIN_CELL.x, layout.MAX_CELL.x + 2):
			var line_x: float = layout.ORIGIN.x + x * 64
			draw_line(Vector2(line_x, grid_start.y), Vector2(line_x, grid_end.y), grid_color, -1)
		for y in range(layout.MIN_CELL.y, layout.MAX_CELL.y + 2):
			var line_y: float = layout.ORIGIN.y + y * 64
			draw_line(Vector2(grid_start.x, line_y), Vector2(grid_end.x, line_y), grid_color, -1)
		draw_change_outlines()
		if layout.in_bounds(hover) and valid:
			var tint := Color.WHITE if transform_preview else Color(0.7, 1, 0.65, 0.6)
			if tool == "bridge" or (tool == "remove" and layout.bridges.has(layout.BridgeRules.owner(layout, hover))):
				var start: Vector2i = layout.BridgeRules.candidate(layout, hover) if tool == "bridge" else layout.BridgeRules.owner(layout, hover)
				var area: Rect2 = layout.BridgeRules.art_rect(layout, start)
				if tool == "bridge":
					draw_texture_rect(layout.BridgeRules.TEXTURE, area, false, tint)
				else:
					draw_rect(area, (InventoryOutline.COLOR if transform_preview else Color(0.85, 1, 0.8, 0.45)), false, InventoryOutline.WIDTH if transform_preview else 1)
				return
			draw_set_transform(placement_offset())
			if not transform_preview and (tool == "ground" or tool in layout.KINDS) and (tool in ["stairs", "ground"] or not layout.cells.has(hover)):
				if tool == "stairs":
					draw_stair_preview(tint)
				elif tool == "ground":
					draw_ground_preview(tint)
				else:
					draw_tile(hover, tool, tint)
			draw_set_transform(Vector2.ZERO)
			if tool == "house":
				draw_set_transform(Vector2.ZERO)
				var facing := (int(layout.houses[hover]) + 1) % 4 if layout.houses.has(hover) else (1 if layout.house_bundle > 0 else 0)
				var area := house_preview_rect()
				if facing == 3:
					area.size.x *= -1
				draw_texture_rect(LevelFiveArt.HOUSE_TEXTURES[facing], area, false, tint)
			if tool == "chicken":
				draw_set_transform(placement_offset())
				draw_texture_rect(LevelFiveArt.CHICKEN, LevelFiveArt.chicken_rect(layout, hover), false, tint)
				draw_set_transform(Vector2.ZERO)
			if tool == "sheep":
				draw_set_transform(placement_offset())
				draw_texture_rect_region(LevelFiveArt.SHEEP_IDLE, LevelFiveArt.sheep_rect(layout, hover), Rect2(0, 0, 128, 128), tint)
				draw_set_transform(Vector2.ZERO)
			if tool == "tree":
				draw_texture_rect_region(clipped_tree_preview_texture(), tree_preview_rect(), Rect2(Vector2.ZERO, TreeArt.frame_size(tree_preview_variant())), tint)
			# Other change targets keep their outlines while showing replacement art.
			if transform_preview:
				return
			if tool == "remove" and layout.cells.get(hover) == "stairs":
				draw_polyline(pickup_outline(), Color(0.85, 1, 0.8, 0.55), 1)
			else:
				var outline_height: float = grass_preview_height() if tool == "ground" else layout.height_at(hover)
				var outline_cell: Vector2i = grass_preview_cell() if tool == "ground" else hover
				draw_rect(Rect2(layout.ORIGIN + Vector2(outline_cell) * 64 - Vector2(0, outline_height), Vector2(64, 64)), InventoryOutline.COLOR if transform_preview else Color(0.85, 1, 0.8, 0.45), false, InventoryOutline.WIDTH if transform_preview else 1)
