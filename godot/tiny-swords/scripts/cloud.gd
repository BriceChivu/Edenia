extends Sprite2D

# Each lane has three clouds spaced 533px apart on this 1600px loop.
# Wrap occurs entirely outside the visible composition, keeping clouds present
# without popping a cloud into the middle of the view.
@export var drift_speed: float = 4.0

func _process(delta: float) -> void:
	position.x = wrapf(position.x + drift_speed * delta, -240.0, 1360.0)
