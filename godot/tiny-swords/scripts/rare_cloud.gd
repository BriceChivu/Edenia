extends "res://scripts/cloud_visual.gd"

# A foreground visitor, with long quiet gaps and a different pass each time.
var wait_remaining: float = randf_range(240.0, 420.0)
var crossing: bool = false
var speed: float = 20.0
var direction: float = 1.0

func _process(delta: float) -> void:
	if not crossing:
		wait_remaining -= delta
		if wait_remaining > 0.0:
			return
		direction = 1.0 if randf() > 0.5 else -1.0
		speed = randf_range(16.0, 26.0)
		position = Vector2(-400.0 if direction > 0 else 1552.0, randf_range(175.0, 285.0))
		next_variant(true)
		set_altitude(randf_range(0.7, 1.0))
		crossing = true
		show()
		return
	position.x += speed * direction * delta
	if (direction > 0 and position.x > 1552.0) or (direction < 0 and position.x < -400.0):
		crossing = false
		hide()
		wait_remaining = randf_range(360.0, 600.0)
