extends "res://scripts/cloud_visual.gd"

# A foreground visitor, with long quiet gaps and a different pass each time.
var wait_remaining: float = randf_range(240.0, 420.0)
var crossing: bool = false
var inventory_hidden := false:
	set(value):
		inventory_hidden = value
		visible = crossing and not inventory_hidden and not GamePresentation.reduced_motion
var speed: float = 20.0
var direction: float = 1.0

func _process(delta: float) -> void:
	if GamePresentation.reduced_motion:
		hide()
		return
	visible = crossing and not inventory_hidden
	if not crossing:
		wait_remaining -= delta
		if wait_remaining > 0.0:
			return
		direction = 1.0 if randf() > 0.5 else -1.0
		speed = randf_range(16.0, 26.0)
		position.y = randf_range(175.0, 285.0)
		next_variant(true)
		set_altitude(randf_range(0.7, 1.0))
		var bounds := crossing_bounds()
		global_position.x = bounds.x if direction > 0 else bounds.y
		crossing = true
		visible = not inventory_hidden
		return
	position.x += speed * direction * delta
	var bounds := crossing_bounds()
	if (direction > 0 and global_position.x > bounds.y) or (direction < 0 and global_position.x < bounds.x):
		crossing = false
		hide()
		wait_remaining = randf_range(360.0, 600.0)
