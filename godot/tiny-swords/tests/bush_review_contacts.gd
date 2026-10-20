extends SceneTree

var failures := 0
var checks := 0

func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var cases: Array = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/bush-reviewed-contacts.json"))
	var scene = load("res://previews/level_three.tscn").instantiate()
	scene.preview_save_enabled = false
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	var cell := Vector2i(0, 1)
	var center: Vector2 = scene.layout.center(cell)
	var depth = scene.get_node("World")
	depth.set_process(false)
	scene.layout.flora.clear()
	scene.layout.chickens.assign([center])
	scene.layout.sheep.assign([center])
	for mode in ["flat", "ramps", "rocks"]:
		scene.layout.cells[Vector2i(1, 1)] = "stairs" if mode == "ramps" else "meadow"
		scene.layout.stair_directions[Vector2i(1, 1)] = Vector2i.RIGHT
		for height in [0, 64, 128]:
			scene.layout.elevations[cell] = height
			for variant in [1, 2]:
				scene.layout.decorations = {cell: {"kind": "bush", "variant": variant}}
				if mode == "rocks":
					scene.layout.decorations[Vector2i(3, 2)] = {"kind": "land_rock", "variant": 1}
				scene.rebuild_decorations()
				var bush: Sprite2D = scene.flora_nodes[0]
				bush.set_process(false)
				for node in scene.asset_nodes:
					if node.has_method("animal_positions"):
						node.set_process(false)
						node.z_index = int(height / 64.0)
						node.offset = node.art_offset - Vector2(0, height / node.art_scale)
				for sample in cases:
					if sample.bush != variant:
						continue
					# Identify species by its script, since both arrays begin at the same point.
					var animal = null
					for node in scene.asset_nodes:
						if node.has_method("animal_positions") and node.get_script().resource_path.get_file() == sample.animal + "_visual.gd":
							animal = node
					assert(animal != null)
					animal.flip_h = sample.flip_h
					animal.position = Vector2(center.x + sample.x, bush.position.y + sample.y)
					depth._process(0)
					var front: bool = depth.actor_in_front(animal, bush) if depth.y_sort_enabled else animal.get_index() > bush.get_index()
					check(front == sample.front, "%s: %s floor %d must preserve reviewed overlap" % [sample.id, mode, height])
				# Facing can change without movement: the cached order must update too.
				var sheep = null
				for node in scene.asset_nodes:
					if node.has_method("animal_positions") and node.get_script().resource_path.get_file() == "sheep_visual.gd":
						sheep = node
				assert(sheep != null)
				sheep.position = Vector2(center.x + 18, bush.position.y - 6)
				for flipped in [false, true, false]:
					sheep.flip_h = flipped
					depth._process(0)
					check((sheep.get_index() > bush.get_index()) == flipped, "Facing changes invalidate cached sheep/bush order")
	scene.queue_free()
	await process_frame
	print("Reviewed bush contacts: ", checks, "; failures=", failures)
	quit(0 if failures == 0 else 1)
