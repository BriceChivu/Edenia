extends SceneTree
var failures := 0
func _initialize() -> void:
	run.call_deferred()
func capture() -> Image:
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()
func run() -> void:
	root.size = Vector2i(1152,496)
	var w = load("res://previews/level_four.tscn").instantiate()
	root.add_child(w)
	await process_frame
	w.set_process(false)
	w.editing = false
	w.terrain.editing = false
	w.harvesting.set_process(false)
	w.pawn.set_physics_process(false)
	w.game_camera.zoom = Vector2.ONE
	w.game_camera.force_update_scroll()
	for node in w.find_children("*", "", true, false):
		if node.has_method("update_depth_mask"):
			node.hide()
	var l = w.layout
	var landing := Vector2i(1,0)
	var tree := Vector2i(2,0)
	l.cells = {Vector2i(-1,0):"meadow", Vector2i.ZERO:"stairs", landing:"high_gold",tree:"meadow",Vector2i(-1,1):"meadow",Vector2i(0,1):"meadow",Vector2i(1,1):"meadow",Vector2i(2,1):"meadow"}
	l.elevations.clear()
	l.stair_directions = {Vector2i.ZERO:Vector2i.RIGHT}
	l.trees = {tree:Vector2.ZERO}
	l.tree_types = {tree:"tree"}
	l.tree_stumps.clear()
	l.flora.clear()
	l.decorations.clear()
	w.rebuild_decorations()
	w.pawn.position = l.center(landing)
	w.pawn.walk_to(w.pawn.position)
	if not w.harvesting.start(tree):
		push_error("Tree approach must be reachable through the staircase")
		quit(1)
		return
	w.harvesting.advance(1,1000)
	var visited_ramp := false
	for tick in range(300):
		w.pawn._physics_process(1.0/60.0)
		w._process(0)
		visited_ramp = visited_ramp or l.cells.get(l.cell_at(w.pawn.position)) == "stairs"
	w.harvesting.advance(0,1000)
	if not visited_ramp or w.harvesting.phase != w.harvesting.Phase.CUTTING or w.ground_height(w.pawn.position) != 0:
		push_error("Real cutting approach must descend the ramp and reach the lower-floor tree")
		failures += 1
	w.pawn.sprite.pause()
	for node in w.tree_nodes:
		node.set_process(false)
	w.pawn.hide()
	var baseline: Image = await capture()
	w.pawn.show()
	var rendered: Image = await capture()
	var atlas: Image = w.terrain.floor_texture(64).get_image()
	var region: Rect2 = w.terrain.ground_region(landing,"high_gold")
	var changed := 0
	for y in range(64):
		for x in range(64):
			if atlas.get_pixelv(Vector2i(region.position)+Vector2i(x,y)).a < 0.99:
				continue
			var pixel := Vector2i(w.terrain.get_global_transform_with_canvas() * (l.ORIGIN + Vector2(landing)*64 + Vector2(x,y-64)))
			if baseline.get_pixelv(pixel) != rendered.get_pixelv(pixel):
				changed += 1
	print("Tree cutting position: ",w.pawn.position," floor=",w.ground_height(w.pawn.position)," pixels over upper grass=",changed)
	if changed != 0:
		failures += 1
		push_error("Lower-floor cutter beside the landing must not appear on its upper grass")
	print("Tree approach cliff depth: ","PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
