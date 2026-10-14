extends SceneTree
func _initialize():
	run.call_deferred()
func run():
	var scene = load("res://previews/level_seven.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.last_interaction_msec = Time.get_ticks_msec() - 6000
	scene.pawn.walk_to(scene.pawn.position)
	var failed := false
	if scene.has_active_interaction():
		push_error("Ambient island animation must allow idle sync")
		failed = true
	scene.pawn.walk_to(scene.pawn.position + Vector2(32, 0))
	if not scene.has_active_interaction():
		push_error("A moving pawn remains active without recent pointer input")
		failed = true
	scene.pawn.walk_to(scene.pawn.position)
	scene.harvesting.phase = scene.harvesting.Phase.CUTTING
	if not scene.has_active_interaction():
		push_error("Harvesting remains active without recent pointer input")
		failed = true
	scene.harvesting.phase = scene.harvesting.Phase.READY
	scene.navigation_pending = true
	if not scene.has_active_interaction():
		push_error("Planning a pawn route remains active")
		failed = true
	scene.navigation_pending = false
	scene._input(InputEventMouseMotion.new())
	if not scene.has_active_interaction():
		push_error("Recent mouse movement postpones idle sync")
		failed = true
	print("Sync activity: ", "FAIL" if failed else "PASS")
	quit(1 if failed else 0)
