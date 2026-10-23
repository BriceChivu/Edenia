extends "res://previews/chicken_run_sandbox.gd"

## Fresh visual fixture using the real pickup, movement and release behavior.
func _ready() -> void:
	super._ready()
	chicken_carry.pickup(0, Time.get_unix_time_from_system())
	pawn._physics_process(0.0)
