extends Sprite2D

@export var frames_per_second: float = 5.0
@export var phase: float = 0.0
var elapsed: float = 0.0

func _process(delta: float) -> void:
	elapsed += delta
	frame = int((elapsed + phase) * frames_per_second) % hframes
