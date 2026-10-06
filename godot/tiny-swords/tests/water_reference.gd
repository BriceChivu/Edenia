extends SceneTree
var failures := 0
func check(ok: bool, label: String) -> void:
	if not ok:
		failures += 1
		push_error(label)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var level = load("res://previews/level_one.tscn").instantiate()
	root.add_child(level)
	await create_timer(0.3).timeout
	var start: Vector2 = level.layout.center(Vector2i(1,0))
	var pawn = level.pawn
	level.perform_water_fall(start, Vector2.RIGHT, 0.0, level.layout.center(Vector2i.ZERO), 0.0)
	var began := Time.get_ticks_msec()
	await level.splash_started
	print("Water contact elapsed: ", Time.get_ticks_msec() - began, "ms")
	check(absf((Time.get_ticks_msec() - began) / 1000.0 - 0.5) < 0.06, "Contact begins 500 ms into the measured trajectory")
	check(pawn.sprite.frame == 5 and pawn.sprite.animation == &"run" and pawn.sprite.modulate.a == 1.0, "Last run pose remains opaque at first water contact")
	check(pawn.position.distance_to(start + Vector2(53,0)) < 2.0, "Contact pose uses the original measured horizontal displacement")
	check((level.splash.position + level.splash.offset).is_equal_approx(start + Vector2(69,3)), "Splash leads pawn by 16 pixels at contact and sits 3 pixels lower")
	await create_timer(0.12).timeout
	check(is_equal_approx(pawn.sprite.modulate.a, 0.7) and pawn.sprite.position.y >= -14 and pawn.sprite.position.y < 0, "Next frame sinks and fades without switching to idle")
	await create_timer(0.12).timeout
	check(pawn.sprite.modulate.a == 0, "Pawn is gone by the third splash frame")
	await level.splash.animation_finished
	var splash_finished := Time.get_ticks_msec()
	await create_timer(0.9).timeout
	check(level.water_phase == level.WaterPhase.WAITING and pawn.sprite.modulate.a == 0, "Separate full one-second wait follows the splash")
	await level.respawned
	check(Time.get_ticks_msec() - splash_finished >= 1230, "One-second pause precedes the existing respawn fade")
	check(pawn.sprite.modulate.a == 1 and pawn.is_physics_processing(), "Respawn restores the normal pawn")
	print("Water reference checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
