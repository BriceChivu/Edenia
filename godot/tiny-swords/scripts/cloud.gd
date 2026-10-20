extends "res://scripts/cloud_visual.gd"

@export var drift_speed: float = 4.0
var lane_y := 0.0
var direction := 1.0

func _ready() -> void:
	super._ready()
	set_altitude(randf_range(0.0, 0.3))
	lane_y = position.y
	direction = 1.0 if drift_speed > 0 else -1.0
	drift_speed = randf_range(2.0, 5.0) * direction

func _process(delta: float) -> void:
	if GamePresentation.reduced_motion:
		return
	position.x += drift_speed * delta
	var bounds := crossing_bounds()
	if (direction > 0 and global_position.x > bounds.y) or (direction < 0 and global_position.x < bounds.x):
		next_variant()
		set_altitude(randf_range(0.65, 1.0) if randf() < 0.25 else randf_range(0.0, 0.3))
		# Keep each cloud in its own vertical band, including above and below
		# the island, instead of regrouping every pass into two narrow rows.
		position.y = lane_y + randf_range(-40.0, 40.0)
		bounds = crossing_bounds()
		global_position.x = bounds.x if direction > 0 else bounds.y
		drift_speed = randf_range(2.0, 5.0) * direction
