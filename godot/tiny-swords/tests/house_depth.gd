extends SceneTree
const Art = preload("res://scripts/level_five_art.gd")
var failures := 0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	var cell := Vector2i(1, 1)
	for elevation in [0, 64]:
		for facing in [0, 1, 2, 3]:
			scene.layout.houses[cell] = facing
			scene.layout.elevations[cell] = elevation
			scene.rebuild_decorations()
			var house: Sprite2D
			for node in scene.asset_nodes:
				if node is Sprite2D and node.texture == Art.HOUSE_TEXTURES[facing]:
					house = node
			check(house != null, "House facing rendered")
			if house == null:
				continue
			var line: float = scene.layout.center(cell).y + (80 if facing == 0 else 78 if facing == 2 else 52)
			check(house.position.y == line, "Sort anchor follows annotated perspective line")
			check(house.position.y + house.offset.y == scene.layout.center(cell).y - elevation, "Changing depth preserves artwork at both elevations")
			for delta in [-1, 1]:
				scene.pawn.position.y = line - scene.pawn.FOOT_DEPTH_Y + delta
				var feet_y: float = scene.pawn.position.y + scene.pawn.get_node("FootDepth").position.y
				check((feet_y < house.position.y) == (delta < 0), "Feet above line sort behind, below line sort in front")
	scene.queue_free()
	await process_frame
	print("House depth checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
