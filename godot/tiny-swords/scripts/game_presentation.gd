extends Node

# Presentation preferences never enter an island snapshot or change action clocks.
signal changed
var reduced_motion := false:
	set(value):
		if value == reduced_motion:
			return
		reduced_motion = value
		changed.emit()
