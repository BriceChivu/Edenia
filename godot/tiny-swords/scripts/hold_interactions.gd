extends RefCounted

const Art = preload("res://scripts/level_five_art.gd")
const Dust = preload("res://scripts/dust_effect.gd")
const NO_CELL := Vector2i(999, 999)
const COLOR_SECONDS := 0.7
const CLEAR_SECONDS := 2.0
var world
var kind := ""
var cell := NO_CELL
var elapsed := 0.0
var consumed := false

func _init(owner) -> void:
	world = owner

func cancel() -> void:
	kind = ""
	elapsed = 0.0
	consumed = false

func begin(point: Vector2) -> void:
	cancel()
	if world.water_phase != world.WaterPhase.READY or world.ui.celebration != null or world.house_placement_active() or (world.editing and world.selected not in ["", "house"]):
		return
	if world.pawn.visible and opaque(world.pawn.sprite, point):
		kind = "pawn"
		return
	for node in world.asset_nodes:
		if not node.is_queued_for_deletion() and node.has_meta("house_cell") and opaque(node, point):
			kind = "house"
			cell = node.get_meta("house_cell")
			return
	cell = world.log_at(point)
	if int(world.layout.log_piles.get(cell, 0)) == 6:
		kind = "logs"

func opaque(sprite, point: Vector2) -> bool:
	var local: Vector2 = sprite.to_local(world.to_global(point))
	var texture: Texture2D = sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame) if sprite is AnimatedSprite2D else sprite.texture
	var size := texture.get_size()
	var area := Rect2(sprite.offset - (size / 2 if sprite.centered else Vector2.ZERO), size)
	if not area.has_point(local):
		return false
	var pixel: Vector2 = local - area.position
	if sprite.flip_h:
		pixel.x = size.x - 1 - pixel.x
	return texture.get_image().get_pixelv(Vector2i(pixel)).a > 0.1

func advance(delta: float) -> void:
	if kind.is_empty() or world.world_pointer_down == null or world.world_dragging or world.pinch_gesture or not world.pointer_focused or not world.pointer_inside or world.ui.celebration != null or world.water_phase != world.WaterPhase.READY:
		return
	elapsed += delta
	var seconds := CLEAR_SECONDS if kind == "logs" else COLOR_SECONDS
	while elapsed >= seconds and not kind.is_empty():
		elapsed -= seconds
		if kind == "logs":
			if int(world.layout.log_piles.get(cell, 0)) != 6:
				kind = ""
				return
			world.layout.discard_logs(cell)
			world.history.clear()
			world.rebuild_decorations()
			var effect := Dust.new()
			effect.position = world.layout.center(cell)
			effect.z_index = int(world.layout.height_at(cell) / 64) + 1
			effect.setup_dust(world.layout.height_at(cell))
			effect.visible = not GamePresentation.reduced_motion
			world.get_node("World").add_child(effect)
			kind = ""
		elif kind == "pawn":
			record_color_change()
			world.layout.pawn_color = (world.layout.pawn_color + 1) % Art.COLORS.size()
			world.pawn.set_color(world.layout.pawn_color)
		elif world.layout.houses.has(cell):
			record_color_change()
			world.layout.house_colors[cell] = (int(world.layout.house_colors.get(cell, 0)) + 1) % Art.COLORS.size()
			for node in world.asset_nodes:
				if not node.is_queued_for_deletion() and node.get_meta("house_cell", NO_CELL) == cell:
					node.texture = Art.house_texture(world.layout, cell, world.layout.houses[cell])
		else:
			kind = ""
			return
		consumed = true
		world.save_layout()

func record_color_change() -> void:
	if consumed:
		return
	if world.editing:
		world.history.append(world.layout.snapshot())
	else:
		world.history.clear()
