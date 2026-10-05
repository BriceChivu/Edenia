extends Sprite2D

## The six axe poses and eight ambient poses repeat together every 24 ticks.
const TreeArt = preload("res://scripts/tree_art.gd")
const Harvesting = preload("res://scripts/tree_harvesting.gd")
const REACTION_SHADER = preload("res://shaders/tree_cut_reaction.gdshader")
const IMPACT_DEGREES := [1.9, 4.3, 1.5, 4.9]
const REBOUND_DEGREES := [-1.9, -2.2, -1.2, -1.5]
var world
var kind := "tree"
var elapsed := 0.0
var bend_angle := 0.0
var source_image: Image

func _ready() -> void:
	if hframes == 1:
		set_process(false)
		return
	# Stable per-cell phases keep ambient loops staggered after every rebuild.
	var cell: Vector2i = get_meta("cell")
	elapsed = fposmod(cell.x * 0.173 + cell.y * 0.317, hframes / 10.0)
	var reaction := ShaderMaterial.new()
	reaction.shader = REACTION_SHADER
	var size := TreeArt.frame_size(kind)
	reaction.set_shader_parameter("frame_size", size)
	reaction.set_shader_parameter("root_pixel", size / 2.0 - TreeArt.art_offset(kind))
	material = reaction
	source_image = TreeArt.sources[kind]
	world.pawn.sprite.frame_changed.connect(update_pose)
	update_pose()

func _process(delta: float) -> void:
	elapsed += delta
	update_pose()

func update_pose() -> void:
	if is_queued_for_deletion() or hframes == 1 or material == null:
		return
	var angle := 0.0
	var harvesting = world.harvesting
	if harvesting != null and harvesting.phase == Harvesting.Phase.CUTTING and harvesting.target == get_meta("cell") and world.pawn.sprite.animation == "axe_interact":
		var pose: int = world.pawn.sprite.frame
		var swing: int = harvesting.swing_count
		frame = posmod(swing * 6 + pose, hframes)
		if pose == 2:
			angle = IMPACT_DEGREES[posmod(swing, 4)]
		elif pose == 3:
			angle = REBOUND_DEGREES[posmod(swing, 4)]
		if world.pawn.sprite.flip_h:
			angle = -angle
	else:
		frame = posmod(int(elapsed * 10.0), hframes)
	bend_angle = deg_to_rad(angle)
	material.set_shader_parameter("bend_angle", bend_angle)

func is_visual_pixel_opaque(point: Vector2) -> bool:
	if hframes == 1 or is_zero_approx(bend_angle):
		return is_pixel_opaque(point)
	var size := TreeArt.frame_size(kind)
	var pixel := point - offset + size / 2.0
	if not Rect2(Vector2.ZERO, size).has_point(pixel):
		return false
	var pivot := size / 2.0 - TreeArt.art_offset(kind)
	var source := (pixel - pivot).rotated(-bend_angle) + pivot
	if Rect2(Vector2.ZERO, size).has_point(source):
		if source_image.get_pixel(int(source.x) + frame * int(size.x), int(source.y)).a > 0.99:
			return true
	var shadow_alpha := source_image.get_pixel(int(pixel.x) + frame * int(size.x), int(pixel.y)).a
	return shadow_alpha > 0.0 and shadow_alpha < 0.99 and is_pixel_opaque(point)
