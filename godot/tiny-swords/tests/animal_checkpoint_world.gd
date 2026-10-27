extends "res://previews/preview_entry.gd"

var checkpoint_causes: Array[bool] = []
var checkpoint_snapshots: Array[Dictionary] = []

func save_layout(animal_checkpoint: bool = false) -> void:
	if not animal_checkpoint and has_method("clear_animal_checkpoint"):
		clear_animal_checkpoint()
	checkpoint_causes.append(animal_checkpoint)
	checkpoint_snapshots.append(saved_snapshot())
