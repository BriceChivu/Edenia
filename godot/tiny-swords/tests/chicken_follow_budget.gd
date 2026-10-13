extends SceneTree
func _initialize():
	run.call_deferred()
func run():
	ProjectSettings.set_setting("gameplay/bounded_obstacle_search_enabled",true)
	seed(0)
	var scene = load("res://previews/level_seven.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.editing=false
	scene.pawn.set_physics_process(false)
	for node in scene.asset_nodes:
		node.set_process(false)
	scene.layout.cells.clear()
	scene.layout.trees.clear()
	scene.layout.houses.clear()
	scene.layout.log_piles.clear()
	scene.layout.sheep.clear()
	for x in range(5):
		for y in range(3):
			scene.layout.cells[Vector2i(x,y)]="meadow"
	scene.layout.cells.erase(Vector2i(2,1))
	scene.layout.cells.erase(Vector2i(2,0))
	scene.layout.cells.erase(Vector2i(2,2))
	scene.pawn.position=scene.layout.center(Vector2i(4,1))
	var chicken=preload("res://scripts/chicken_visual.gd").new()
	scene.layout.chickens.assign([scene.layout.center(Vector2i(0,1))])
	chicken.world=scene
	scene.get_node("World").add_child(chicken)
	chicken.set_process(false)
	chicken.position=scene.layout.chickens[0]
	chicken.follow_wait=3.0
	chicken.updated_at=100.0
	chicken.previous_pawn_position=scene.pawn.position
	var start: Vector2 = chicken.position
	var failed := false
	var worst=0
	for tick in 60:
		await process_frame
		var began=Time.get_ticks_usec()
		scene.pawn.position += Vector2(0.01,0)
		chicken.advance(0.016,100.0+tick*0.016)
		worst=max(worst,Time.get_ticks_usec()-began)
	print("FOLLOW advance max_ms=",worst/1000.0)
	if worst>=16000:
		push_error("An unreachable follow must not monopolize a frame")
		failed = true
	if chicken.position != start:
		push_error("An unreachable search must not move a bird across water")
		failed = true
	# Open a detour while a request is pending; stale contact caches must retire.
	scene.layout.cells[Vector2i(2,0)] = "meadow"
	scene.layout.cells[Vector2i(2,2)] = "meadow"
	for tick in 90:
		await process_frame
		scene.pawn.position += Vector2(0.01,0)
		chicken.advance(0.016,101.0+tick*0.016)
		if scene.layout.cell_at(chicken.position) == scene.layout.cell_at(scene.pawn.position):
			push_error("A planned follow must keep the pawn tile reserved")
			failed = true
	if chicken.position.distance_to(start)<20:
		push_error("Geometry changes must resume reachable following")
		failed = true
	scene.queue_free()
	quit(1 if failed else 0)
