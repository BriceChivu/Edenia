extends Sprite2D

# Briefly covers the island during a slow pass, then stays away for minutes.
var wait_remaining: float = 90.0
var crossing: bool = false

func _process(delta: float) -> void:
	if not crossing:
		wait_remaining -= delta
		if wait_remaining > 0.0:
			return
		position = Vector2(-180.0, randf_range(220.0, 245.0))
		crossing = true
		show()
		return
	position.x += 20.0 * delta
	if position.x > 1332.0:
		crossing = false
		hide()
		wait_remaining = randf_range(180.0, 260.0)
