extends SceneTree

var failures: int = 0

func _initialize() -> void:
	run.call_deferred()

func check(condition: bool, label: String) -> void:
	if not condition:
		failures += 1
		push_error(label)

func click_at(point: Vector2) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = point
	root.push_input(motion, true)
	var click := InputEventMouseButton.new()
	click.position = point
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	root.push_input(click, true)
	click = click.duplicate()
	click.pressed = false
	root.push_input(click, true)

func run() -> void:
	var level = load("res://scenes/level_one.tscn").instantiate()
	root.add_child(level)
	await process_frame
	var pawn = level.get_node("World/Pawn")
	var sprite: AnimatedSprite2D = pawn.get_node("Sprite")
	check(level.get_node("Islands").get_child_count() == 5, "Main grass patch plus one decorative islet")
	check(sprite.sprite_frames.get_frame_count("idle") == 8, "Eight idle frames")
	check(sprite.sprite_frames.get_frame_count("run") == 6, "Six run frames")
	click_at(Vector2(620, 275))
	await create_timer(0.2).timeout
	check(pawn.destination == Vector2(620, 275), "Grass click sets destination")
	check(pawn.position.distance_to(Vector2(576, 240)) > 5, "Pawn moves after click")
	check(sprite.animation == &"run", "Run animation while moving")
	var frame := sprite.frame
	await create_timer(0.12).timeout
	check(sprite.frame != frame, "Run animation advances")
	await create_timer(0.8).timeout
	check(pawn.position == Vector2(620, 275), "Pawn reaches clicked location")
	check(sprite.animation == &"idle", "Idle resumes at destination")
	click_at(Vector2(744, 330))
	check(pawn.destination == Vector2(620, 275), "Decorative islet does not send pawn across water")
	click_at(Vector2(513, 177))
	check(pawn.destination == Vector2(524, 188), "Edge click keeps feet on grass")
	await create_timer(0.15).timeout
	check(sprite.flip_h, "Pawn faces left when moving left")
	click_at(Vector2(620, 200))
	await create_timer(0.15).timeout
	check(not sprite.flip_h, "New click redirects moving pawn to the right")
	# Clicking water starts one complete fall/splash/respawn sequence.
	click_at(Vector2(670, 240))
	check(level.water_phase in [level.WaterPhase.APPROACHING, level.WaterPhase.FALLING], "Water click approaches shore or immediately falls when already at shore")
	var destination_before: Vector2 = pawn.destination
	click_at(Vector2(540, 190))
	check(pawn.destination == destination_before, "Clicks cannot interrupt a fall sequence")
	await level.splash_started
	check(pawn.sprite.rotation == 0.0, "Pawn stays upright like the reference animation")
	check(level.splash.visible, "Splash appears at landing")
	check(not level.GRASS_BOUNDS.has_point(pawn.position), "Pawn falls outside grass into water")
	await create_timer(0.28).timeout
	check(pawn.sprite.modulate.a < 0.01, "Pawn sinks out of view")
	check(level.splash.frame > 0, "Splash animation advances")
	await level.splash.animation_finished
	await create_timer(0.5).timeout
	check(level.water_phase == level.WaterPhase.WAITING, "Respawn waits after the splash finishes")
	check(pawn.sprite.modulate.a < 0.01, "Pawn remains hidden during the respawn delay")
	await level.respawned
	check(pawn.position == level.SPAWN, "Pawn respawns on main island")
	check(pawn.sprite.modulate.a == 1.0 and pawn.sprite.rotation == 0.0, "Pawn appearance resets")
	check(not level.splash.visible, "Splash finishes and hides")
	click_at(Vector2(548, 220))
	await create_timer(0.65).timeout
	check(pawn.position == Vector2(548, 220), "Bush position is reachable")
	check(level.get_node("World").y_sort_enabled, "Plants and pawn share depth sorting")
	check(pawn.position.y < level.get_node("World/MainBush").position.y, "Bush draws in front when pawn is behind it")
	print("Movement checks: ", "PASS" if failures == 0 else "FAIL (%s)" % failures)
	quit(0 if failures == 0 else 1)
