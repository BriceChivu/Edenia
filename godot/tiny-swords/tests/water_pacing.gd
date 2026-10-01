# Actual rendered pacing regression: no image reads or disk writes during playback.
extends SceneTree
var level
var recording := false
var began := 0
var samples := []
func _initialize() -> void:
	run.call_deferred()
func _process(delta: float) -> bool:
	if recording:
		samples.append({"us":Time.get_ticks_usec()-began,"dt":delta,"phase":level.water_phase,"x":level.pawn.position.x,"frame":level.pawn.sprite.frame,"playing":level.pawn.sprite.is_playing()})
	return false
func run() -> void:
	level = load("res://previews/level_one.tscn").instantiate()
	root.add_child(level)
	await create_timer(1).timeout
	level.pawn.position = Vector2(608,208)
	level.pawn.walk_to(level.pawn.position)
	await create_timer(0.2).timeout
	began = Time.get_ticks_usec()
	recording = true
	level.fall_into_water(Vector2(800,208))
	await level.respawned
	recording = false
	var path := ProjectSettings.globalize_path("res://../../test-results/tiny-swords-reference/pacing-native.json")
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var file := FileAccess.open(path,FileAccess.WRITE)
	if file == null:
		push_error("Cannot write pacing results: %s" % path)
		quit(1)
		return
	file.store_string(JSON.stringify(samples))
	var still_frames := 0
	var longest_hold := 0
	var previous := -1.0
	for sample in samples:
		if sample.phase == 2:
			still_frames = still_frames + 1 if is_equal_approx(sample.x, previous) else 0
			longest_hold = maxi(longest_hold, still_frames)
		if sample.phase in [2,3] and sample.x != previous:
			previous = sample.x
	print("Longest motion hold during fall: ", longest_hold, " render frames")
	if longest_hold > 2:
		push_error("Fall motion must interpolate between reference poses, not freeze for ten render frames")
	quit(1 if longest_hold > 2 else 0)
