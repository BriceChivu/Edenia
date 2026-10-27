extends "res://scripts/xp_bridge.gd"

var checkpoint_causes: Array[bool] = []

func save_layout(checkpoint: bool = false) -> void:
	checkpoint_causes.append(checkpoint)
