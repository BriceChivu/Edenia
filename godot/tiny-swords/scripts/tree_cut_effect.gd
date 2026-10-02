extends Node2D

## Transient completion visual; the saved tree becomes a stump immediately.
const FADE_SECONDS := 0.2
const FRAME_SECONDS := 0.1
const DUST_TEXTURES := [
	preload("res://Tiny Swords (Free Pack)/Particle FX/Dust_01.png"),
	preload("res://Tiny Swords (Free Pack)/Particle FX/Dust_02.png"),
]
var tree: Sprite2D
var dust: Array[Sprite2D] = []
var elapsed := 0.0

func setup(source: Sprite2D, height: float) -> void:
	position = source.position
	z_index = source.z_index
	tree = Sprite2D.new()
	tree.texture = source.texture
	tree.hframes = source.hframes
	tree.frame = source.frame
	tree.offset = source.offset
	tree.scale = source.scale
	add_child(tree)
	for index in DUST_TEXTURES.size():
		var puff := Sprite2D.new()
		puff.texture = DUST_TEXTURES[index]
		puff.hframes = puff.texture.get_width() / 64
		puff.position = Vector2(-16 if index == 0 else 16, -height - 8)
		puff.flip_h = index == 1
		add_child(puff)
		dust.append(puff)

func _process(delta: float) -> void:
	advance(delta)

func advance(delta: float) -> void:
	elapsed += delta
	tree.modulate.a = maxf(0.0, 1.0 - elapsed / FADE_SECONDS)
	var finished := true
	for puff in dust:
		var frame_index := int(elapsed / FRAME_SECONDS)
		puff.visible = frame_index < puff.hframes
		puff.frame = mini(frame_index, puff.hframes - 1)
		finished = finished and not puff.visible
	if finished:
		queue_free()
