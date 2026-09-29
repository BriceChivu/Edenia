extends Sprite2D

const VARIANTS := [
	preload("res://art/environment/Clouds_01.png"),
	preload("res://art/environment/Clouds_02.png"),
	preload("res://art/environment/Clouds_03.png"),
	preload("res://art/environment/Clouds_04.png"),
	preload("res://art/environment/Clouds_05.png"),
	preload("res://art/environment/Clouds_06.png"),
	preload("res://art/environment/Clouds_07.png"),
	preload("res://art/environment/Clouds_08.png"),
]
var variant_index := 0
var shadow_sprite: Sprite2D
var altitude := 0.0
var baked_shadow_offset := Vector2.ZERO

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

func set_variant(index: int) -> void:
	variant_index = posmod(index, VARIANTS.size())
	texture = VARIANTS[variant_index]
	if shadow_sprite != null:
		shadow_sprite.texture = texture
	var pixels := texture.get_image()
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

func next_variant(large_only: bool = false) -> void:
	var next := (variant_index + 1) % VARIANTS.size()
	while large_only and VARIANTS[next].get_image().get_used_rect().size.x < 400:
		next = (next + 1) % VARIANTS.size()
	set_variant(next)

func set_altitude(value: float) -> void:
	var painted_width := float(texture.get_image().get_used_rect().size.x)
	# Small source art remains a small, low cloud; only large art goes overhead.
	altitude = clampf(value, 0.0, 1.0 if painted_width >= 400 else 0.3)
	# Low clouds are behind all Y-sorted foliage and the pawn. Only high clouds
	# pass above the world, with their shadows farther away and more transparent.
	z_index = 5 if altitude >= 0.6 else -5
	# Perspective and shadow distance share one height, with bounded variation.
	scale = Vector2.ONE * (lerpf(1.0, 1.35, altitude) if painted_width >= 400 else 1.0)
	if shadow_sprite != null:
		# Keep the PNG's original shadow placement at minimum altitude.
		# Additional height can only push it downward, never back into the cloud.
		shadow_sprite.position = Vector2(0.0, altitude * 110.0) / scale
		shadow_sprite.material.set_shader_parameter("opacity", lerpf(0.75, 0.16, altitude))
