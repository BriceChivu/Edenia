extends "res://previews/preview_entry.gd"

var checkpoint_causes: Array[bool] = []

func save_layout(animal_checkpoint: bool = false) -> void:
	checkpoint_causes.append(animal_checkpoint)
