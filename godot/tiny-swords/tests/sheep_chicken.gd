extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Sheep = preload("res://scripts/sheep_visual.gd")
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var scene = load("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.editing = false
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.layout.sheep.assign([scene.layout.center(Vector2i(1, 1))])
	scene.layout.stock.sheep -= 1
	scene.layout.stock.chicken -= 1
	scene.layout.chicken_release_at = 160.0
	scene.pawn.carrying_chicken = true
	scene.rebuild_decorations()
	var sheep: Sprite2D
	for node in scene.asset_nodes:
		node.set_process(false)
		if node.get_script() == Sheep: sheep = node
	scene.pawn.position = sheep.position - Vector2(64, 0)
	scene.pawn.walk_to(scene.pawn.position)
	var interaction = scene.sheep_chicken
	check(interaction.hit(sheep.position + Vector2(0, -12)) == sheep, "Click picks opaque sheep artwork")
	check(interaction.hit(sheep.position + Vector2(60, -60)) == null, "Transparent atlas padding does not pick sheep")
	check(interaction.hover_available(sheep.position + Vector2(0, -12)), "Reachable sheep offers pickup cursor")
	interaction.request(sheep)
	check(interaction.target == sheep and scene.pawn.destination != scene.pawn.position, "Click approaches sheep with carried bird")
	check(not interaction.transfer(sheep, 100.0, 20000), "Cannot transfer before reaching sheep")
	scene.pawn.position = scene.pawn.destination
	interaction.advance(100.0, 20000)
	check(scene.layout.sheep_chickens.get(0) == 20000 and not scene.pawn.carrying_chicken and scene.layout.chicken_release_at == 0.0, "Arrival transfers one bird onto sheep")
	sheep.advance(0.0, sheep.updated_at)
	check(sheep.texture == sheep.CHICKEN_IDLE and sheep.hframes == 6, "Perched idle uses all six supplied poses")
	var restored = Layout.new()
	check(restored.restore(scene.layout.snapshot()) and restored.sheep_chickens == scene.layout.sheep_chickens, "Reload conserves perched bird and calendar day")
	var bad: Dictionary = scene.layout.snapshot()
	bad.sheep_chickens.append([0, 20000])
	check(not Layout.new().restore(bad), "Reject duplicate passengers")
	bad = scene.layout.snapshot()
	bad.sheep_chickens[0][0] = 1
	check(not Layout.new().restore(bad), "Reject passenger on missing sheep")
	bad = scene.layout.snapshot()
	bad.chicken_release_at = 160.0
	check(not Layout.new().restore(bad), "Reject duplicating perched bird in pawn carry")
	interaction.advance(100000.0, 20000)
	check(scene.layout.sheep_chickens.size() == 1, "Perch survives the entire local date beyond carry timeout")
	# Saved construction must not teleport the pawn back while approaching a
	# perched bird. Retrieval pauses work just like the existing carry action.
	scene.pawn.position = sheep.position - Vector2(64, 0)
	scene.pawn.walk_to(scene.pawn.position)
	scene.layout.house_build = {"x": 1, "y": 1, "pawn_x": sheep.position.x, "pawn_y": sheep.position.y, "started_at": Time.get_unix_time_from_system()}
	interaction.request(sheep)
	var approach_origin: Vector2 = scene.pawn.position
	var approach_destination: Vector2 = scene.pawn.destination
	scene.construction._process(0.0)
	check(scene.pawn.position == approach_origin and scene.pawn.destination == approach_destination and not scene.pawn.hammering, "Saved house work cannot interrupt chicken retrieval approach")
	scene.layout.house_build.clear()
	scene.construction.phase = scene.construction.Phase.READY
	scene.pawn.hammering = false
	scene.pawn.position = approach_destination
	interaction.advance(150.0, 20000)
	check(scene.pawn.carrying_chicken and scene.layout.chicken_release_at == 210.0 and scene.layout.sheep_chickens.is_empty(), "Retrieve restarts normal one-minute carrying")
	check(interaction.transfer(sheep, 151.0, 20000), "Retrieved bird can be placed again")
	# Same sheep AI and route are retained while the authored pose runs.
	sheep.fleeing = true
	sheep.destination = sheep.position + Vector2(-12, 0)
	sheep.escape_route.assign([sheep.destination])
	sheep.tile_destinations.assign([sheep.destination])
	var before := sheep.position
	sheep.advance(0.01, sheep.updated_at + 0.01)
	check(sheep.position != before and sheep.texture == sheep.chicken_run and sheep.hframes == 4, "Perched sheep moves with ordinary AI and four nonblank run frames")
	check(scene.layout.sheep_chickens.has(0), "Sheep movement keeps its passenger")
	# Moving targets receive a new approach; ordinary movement cancels the request.
	scene.pawn.position = scene.layout.center(Vector2i.ZERO)
	scene.pawn.walk_to(scene.pawn.position)
	interaction.request(sheep)
	scene.movement_generation += 1
	interaction.advance(152.0, 20000)
	check(interaction.target == null, "Another walk cancels pending interaction")
	# Disconnected grass is visible, but cannot offer or perform this action.
	sheep.position = scene.layout.center(Vector2i(3, 2))
	scene.layout.sheep[0] = sheep.position
	check(interaction.route_to(sheep).is_empty(), "Unreachable sheep rejects approach")
	interaction.request(sheep)
	check(interaction.target == null, "Unreachable click never queues a transfer")
	# No grass landing means next-day release remains safely perched.
	var ground: Dictionary = scene.layout.cells.duplicate()
	scene.layout.cells.clear()
	interaction.advance(153.0, 20001)
	check(scene.layout.sheep_chickens.size() == 1 and scene.layout.chickens.is_empty(), "Next-day unsafe landing preserves passenger")
	scene.layout.cells.assign(ground)
	sheep.position = scene.layout.center(Vector2i(1, 1))
	scene.layout.sheep[0] = sheep.position
	interaction.advance(154.0, 20001)
	check(scene.layout.sheep_chickens.is_empty() and scene.layout.chickens.size() == 1, "Next local date releases exactly once on safe grass")
	check(Layout.new().restore(scene.layout.snapshot()), "Released bird saves without loss or duplication")
	# Index shifts, inventory removal and portal capture preserve all birds.
	var layout = Layout.new()
	for level in range(2, 9): layout.unlock(level)
	layout.sheep.assign([layout.center(Vector2i.ZERO), layout.center(Vector2i(1, 1))])
	layout.stock.sheep = 0
	layout.stock.chicken = 0
	layout.sheep_chickens = {0: 20000, 1: 20000}
	check(Layout.new().restore(layout.snapshot()), "Multiple sheep can carry one bird each")
	layout.remove_animal("sheep", 0)
	layout.stock.sheep += 1
	check(layout.sheep_chickens == {0: 20000} and layout.stock.chicken == 1 and Layout.new().restore(layout.snapshot()), "Removing sheep refunds its bird and remaps remaining passenger")
	layout.black_hole = {"phase": "hungry", "day": 20000, "next_day": 20020, "cell": [0, 0], "occupants": ["sheep", "chicken"], "facing_left": true}
	check(layout.remove_animal("sheep", 0, false) and Layout.new().restore(layout.snapshot()), "Portal transfer conserves sheep and passenger in durable queue")
	print("Sheep chicken checks: %s" % ("PASS" if failures.is_empty() else str(failures)))
	quit(0 if failures.is_empty() else 1)
