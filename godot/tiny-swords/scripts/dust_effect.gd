extends Node2D

## Shared one-shot dust used for tree cutting and the first pawn arrival.
const FRAME_SECONDS := 0.1
const DUST_TEXTURES := [
	preload("res://Tiny Swords (Free Pack)/Particle FX/Dust_01.png"),
	preload("res://Tiny Swords (Free Pack)/Particle FX/Dust_02.png"),
]
var dust: Array[Sprite2D] = []
var elapsed := 0.0

func setup_dust(height: float) -> void:
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
	var finished := true
	for puff in dust:
		var frame_index := int(elapsed / FRAME_SECONDS)
		puff.visible = frame_index < puff.hframes
		puff.frame = mini(frame_index, puff.hframes - 1)
		finished = finished and not puff.visible
	if finished:
		queue_free()
