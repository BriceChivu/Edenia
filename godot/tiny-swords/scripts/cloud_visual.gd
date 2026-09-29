extends Sprite2D

var shadow_sprite: Sprite2D
var altitude := 0.0

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
	set_altitude(0.0)

func set_altitude(value: float) -> void:
	altitude = clampf(value, 0.0, 1.0)
	# Low clouds are behind all Y-sorted foliage and the pawn. Only high clouds
	# pass above the world, with their shadows farther away and more transparent.
	z_index = 5 if altitude >= 0.6 else -5
	if shadow_sprite != null:
		shadow_sprite.position = Vector2(altitude * 22, altitude * 100)
		shadow_sprite.material.set_shader_parameter("opacity", lerpf(0.75, 0.16, altitude))
