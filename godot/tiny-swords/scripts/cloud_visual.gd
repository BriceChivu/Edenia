extends Sprite2D

var shadow_sprite: Sprite2D
var altitude := 0.0
var baked_shadow_offset := Vector2.ZERO

func _ready() -> void:
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
	set_altitude(0.0)

func set_altitude(value: float) -> void:
	altitude = clampf(value, 0.0, 1.0)
	# Low clouds are behind all Y-sorted foliage and the pawn. Only high clouds
	# pass above the world, with their shadows farther away and more transparent.
	z_index = 5 if altitude >= 0.6 else -5
	# Perspective and shadow distance share one height, with bounded variation.
	var painted_width := maxf(1.0, texture.get_image().get_used_rect().size.x)
	scale = Vector2.ONE * lerpf(300.0, 680.0, altitude) / painted_width * randf_range(0.95, 1.05)
	if shadow_sprite != null:
		shadow_sprite.position = -baked_shadow_offset + Vector2(altitude * 22, lerpf(14.0, 110.0, altitude)) / scale
		shadow_sprite.material.set_shader_parameter("opacity", lerpf(0.75, 0.16, altitude))
