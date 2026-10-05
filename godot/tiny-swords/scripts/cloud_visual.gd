extends Sprite2D

const MIN_VIEW_ZOOM := 0.5

const ORIGINAL_VARIANTS := [
	preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Clouds/Clouds_01.png"),
	preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Clouds/Clouds_02.png"),
	preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Clouds/Clouds_03.png"),
	preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Clouds/Clouds_04.png"),
	preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Clouds/Clouds_05.png"),
	preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Clouds/Clouds_06.png"),
	preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Clouds/Clouds_07.png"),
	preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Clouds/Clouds_08.png"),
]

const VARIANTS := [
	preload("res://assets/clouds/Clouds_01_without_shadow.png"),
	preload("res://assets/clouds/Clouds_02_without_shadow.png"),
	preload("res://assets/clouds/Clouds_03_without_shadow.png"),
	preload("res://assets/clouds/Clouds_04_without_shadow.png"),
	preload("res://assets/clouds/Clouds_05_without_shadow.png"),
	preload("res://assets/clouds/Clouds_06_without_shadow.png"),
	preload("res://assets/clouds/Clouds_07_without_shadow.png"),
	preload("res://assets/clouds/Clouds_08_without_shadow.png"),
]
const SHADOW_VARIANTS := [
	preload("res://assets/clouds/Clouds_01_shadow.png"),
	preload("res://assets/clouds/Clouds_02_shadow.png"),
	preload("res://assets/clouds/Clouds_03_shadow.png"),
	preload("res://assets/clouds/Clouds_04_shadow.png"),
	preload("res://assets/clouds/Clouds_05_shadow.png"),
	preload("res://assets/clouds/Clouds_06_shadow.png"),
	preload("res://assets/clouds/Clouds_07_shadow.png"),
	preload("res://assets/clouds/Clouds_08_shadow.png"),
]
# Ground-depth lines inferred from the eight annotated shadow screenshots,
# in native 576×256 texture coordinates (top edge is Y = 0).
const SHADOW_DEPTH_Y := [146.0, 148.0, 134.0, 134.0, 149.0, 144.0, 131.0, 126.0]
var variant_index := 0
var shadow_sprite: Sprite2D
var altitude := 0.0
var baked_shadow_offset := Vector2.ZERO
var shadow_center := Vector2.ZERO
var depth_viewport: SubViewport
var depth_occluders: Dictionary = {}
const TerrainPiece = preload("res://scripts/terrain_view.gd")

func _ready() -> void:
	var body_material := ShaderMaterial.new()
	body_material.shader = preload("res://shaders/cloud_layer.gdshader")
	material = body_material
	shadow_sprite = Sprite2D.new()
	shadow_sprite.texture = texture
	shadow_sprite.z_as_relative = false
	shadow_sprite.z_index = -10
	var shadow_material := ShaderMaterial.new()
	shadow_material.shader = preload("res://shaders/cloud_layer.gdshader")
	shadow_material.set_shader_parameter("shadow_only", true)
	shadow_sprite.material = shadow_material
	add_child(shadow_sprite)
	set_variant(get_index() % VARIANTS.size())
	set_altitude(0.0)
	setup_depth_mask()

func set_variant(index: int) -> void:
	variant_index = posmod(index, VARIANTS.size())
	texture = VARIANTS[variant_index]
	if shadow_sprite != null:
		shadow_sprite.texture = SHADOW_VARIANTS[variant_index]
	# Original sheets retain the established body-to-shadow spacing.
	var pixels: Image = ORIGINAL_VARIANTS[variant_index].get_image()
	var body_sum := Vector2.ZERO
	var shadow_sum := Vector2.ZERO
	var body_count := 0
	var shadow_count := 0
	for y in range(pixels.get_height()):
		for x in range(pixels.get_width()):
			var color := pixels.get_pixel(x, y)
			if color.a < 0.1:
				continue
			if color.get_luminance() < 0.52:
				shadow_sum += Vector2(x, y)
				shadow_count += 1
			else:
				body_sum += Vector2(x, y)
				body_count += 1
	if shadow_count > 0 and body_count > 0:
		baked_shadow_offset = shadow_sum / shadow_count - body_sum / body_count
		shadow_center = body_sum / body_count - Vector2(texture.get_size()) / 2.0
	set_altitude(altitude)

func next_variant(large_only: bool = false) -> void:
	var next := (variant_index + 1) % VARIANTS.size()
	while large_only and VARIANTS[next].get_image().get_used_rect().size.x < 400:
		next = (next + 1) % VARIANTS.size()
	set_variant(next)

func set_altitude(value: float) -> void:
	var painted_width := float(texture.get_image().get_used_rect().size.x)
	# Small source art remains a small, low cloud; only large art goes overhead.
	altitude = clampf(value, 0.0, 1.0 if painted_width >= 400 else 0.3)
	# Body depth is resolved against each world object by its ground shadow.
	z_index = 100
	# Perspective and shadow distance share one height, with bounded variation.
	scale = Vector2.ONE * (lerpf(1.0, 1.35, altitude) if painted_width >= 400 else 1.0)
	if shadow_sprite != null:
		# Flatten around the painted shadow's center so its ground anchor stays
		# fixed while increasing separation makes the projection flatter and fainter.
		var projection := sqrt(altitude)
		shadow_sprite.scale = Vector2(1.0, lerpf(0.72, 0.12, projection))
		shadow_sprite.position = baked_shadow_offset + shadow_center * (Vector2.ONE - shadow_sprite.scale) + Vector2(0.0, altitude * 110.0) / scale
		shadow_sprite.material.set_shader_parameter("opacity", lerpf(0.48, 0.18, projection))

func shadow_ground_position() -> Vector2:
	var anchor := Vector2(shadow_center.x, SHADOW_DEPTH_Y[variant_index] - texture.get_height() / 2.0)
	return shadow_sprite.to_global(anchor)

func setup_depth_mask() -> void:
	depth_viewport = SubViewport.new()
	depth_viewport.transparent_bg = true
	depth_viewport.disable_3d = true
	depth_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(depth_viewport)
	material.set_shader_parameter("depth_mask", depth_viewport.get_texture())
	material.set_shader_parameter("use_depth_mask", true)
	# Both drift scripts own _process; pre-draw also catches animation, pawn
	# movement and terrain edits after their respective process callbacks.
	RenderingServer.frame_pre_draw.connect(update_depth_mask)

func strip_behavior(node: Node) -> void:
	node.set_script(null)
	node.process_mode = Node.PROCESS_MODE_DISABLED
	for child in node.get_children():
		strip_behavior(child)

func sync_visual(source: Node, copy: Node) -> void:
	if source is Node2D:
		copy.transform = source.transform
		copy.modulate = source.modulate
		copy.self_modulate = source.self_modulate
		copy.visible = source.visible
	if source is Sprite2D:
		copy.texture = source.texture
		# Animation transitions can change the sheet grid on an existing copy.
		copy.hframes = source.hframes
		copy.vframes = source.vframes
		copy.frame = source.frame
		copy.offset = source.offset
		copy.flip_h = source.flip_h
		copy.flip_v = source.flip_v
	if source is AnimatedSprite2D:
		copy.sprite_frames = source.sprite_frames
		copy.animation = source.animation
		copy.frame = source.frame
		copy.offset = source.offset
		copy.flip_h = source.flip_h
		copy.flip_v = source.flip_v
	for index in range(mini(source.get_child_count(), copy.get_child_count())):
		sync_visual(source.get_child(index), copy.get_child(index))

func update_depth_mask() -> void:
	if depth_viewport == null or not is_inside_tree():
		return
	# Tests and inherited editor previews need the owning scene, too.
	var owner_scene: Node = get_parent()
	while owner_scene != null and not owner_scene.has_node("World"):
		owner_scene = owner_scene.get_parent()
	if owner_scene == null:
		return
	var world := owner_scene.get_node("World")
	# Keep the mask in logical canvas coordinates. Window stretch is applied
	# only when displaying the completed main viewport.
	depth_viewport.size = Vector2i(get_viewport().get_visible_rect().size)
	depth_viewport.canvas_transform = get_viewport().canvas_transform
	var mask_transform := depth_viewport.canvas_transform
	material.set_shader_parameter("mask_size", Vector2(depth_viewport.size))
	material.set_shader_parameter("mask_axes", Vector4(mask_transform.x.x, mask_transform.x.y, mask_transform.y.x, mask_transform.y.y))
	material.set_shader_parameter("mask_origin", mask_transform.origin)
	var candidates: Dictionary = {}
	if is_visible_in_tree():
		for item in world.get_children():
			if item is Node2D and item.is_visible_in_tree() and item.z_index >= 0 and item.global_position.y > shadow_ground_position().y:
				candidates[item] = true
	material.set_shader_parameter("use_depth_mask", not candidates.is_empty())
	depth_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS if not candidates.is_empty() else SubViewport.UPDATE_DISABLED
	for item in depth_occluders.keys():
		if not is_instance_valid(item) or not candidates.has(item):
			var copy: Node = depth_occluders[item]
			depth_viewport.remove_child(copy)
			copy.queue_free()
			depth_occluders.erase(item)
	for item in candidates:
		if not depth_occluders.has(item):
			var copy: Node2D
			if item is TerrainPiece:
				copy = TerrainPiece.new()
				copy.layout = item.layout
				copy.piece = item.piece
				copy.process_mode = Node.PROCESS_MODE_DISABLED
			else:
				copy = item.duplicate(0)
				strip_behavior(copy)
			depth_viewport.add_child(copy)
			depth_occluders[item] = copy
		var copy: Node2D = depth_occluders[item]
		sync_visual(item, copy)
		copy.transform = item.global_transform
		copy.z_index = 0
		if item is TerrainPiece:
			copy.layout = item.layout
			copy.queue_redraw()

# Keep transitions beyond the widest view even when the camera pans or the
# viewport expands. Include the full body/shadow canvas before recycling.
func crossing_bounds() -> Vector2:
	var camera := get_viewport().get_camera_2d()
	var center_x := camera.global_position.x if camera != null else 576.0
	var half_view := get_viewport_rect().size.x / MIN_VIEW_ZOOM / 2.0
	var half_cloud := texture.get_width() * absf(global_scale.x) / 2.0
	return Vector2(center_x - half_view - half_cloud, center_x + half_view + half_cloud)
