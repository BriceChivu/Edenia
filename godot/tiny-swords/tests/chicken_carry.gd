extends SceneTree

const Chicken = preload("res://scripts/chicken_visual.gd")
const Layout = preload("res://scripts/terrain_layout.gd")
var failures: Array[String] = []
func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var scene = load("res://previews/level_two.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	for node in scene.asset_nodes:
		node.set_process(false)
	scene.layout.cells.clear()
	scene.layout.elevations.clear()
	scene.layout.trees.clear()
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.layout.cells[Vector2i.ZERO] = "meadow"
	scene.layout.stock.chicken = 0
	scene.layout.stock.meadow += 4
	scene.layout.chickens.assign([scene.layout.center(Vector2i.ZERO)])
	scene.pawn.position = scene.layout.chickens[0]
	scene.pawn.destination = scene.pawn.position
	scene.editing = false
	var chicken = Chicken.new()
	chicken.world = scene
	scene.get_node("World").add_child(chicken)
	chicken.set_process(false)
	chicken.updated_at = 100.0
	scene.construction.phase = scene.construction.Phase.PICKUP
	chicken.advance(0.1, 100.1)
	check(scene.layout.chickens.is_empty() and scene.pawn.carrying_chicken, "Pawn picks up a same-tile chicken with no escape")
	check(is_equal_approx(scene.layout.chicken_release_at, 160.1), "Pickup starts exactly one minute")
	check(scene.construction.phase == scene.construction.Phase.READY, "Cornered pickup also interrupts pending house work")
	# Walking and turning retain the carried bird and use the new stride.
	scene.pawn.walk_to(scene.pawn.position + Vector2(16, 0))
	scene.pawn._physics_process(0.1)
	check(scene.pawn.sprite.animation == "chicken_run" and scene.pawn.carrying_chicken, "Walking carries the chicken with the run animation")
	scene.pawn.walk_to(scene.pawn.position - Vector2(8, 0))
	scene.pawn._physics_process(0.1)
	check(scene.pawn.sprite.flip_h, "Chicken and pawn turn together")
	scene.pawn.position = scene.layout.center(Vector2i.ZERO)
	scene.pawn.walk_to(scene.pawn.position)
	scene.pawn._physics_process(0.1)
	check(scene.pawn.sprite.animation == "chicken_idle", "Standing carries the chicken with the idle animation")
	var saved: Dictionary = scene.layout.snapshot()
	var restored = Layout.new()
	check(restored.restore(saved) and restored.chicken_release_at == scene.layout.chicken_release_at, "Save conserves the carried chicken and deadline")
	scene.chicken_carry.advance(160.09)
	check(scene.layout.chickens.is_empty(), "Do not put down before one minute")
	scene.chicken_carry.advance(160.1)
	check(scene.layout.chickens.size() == 1 and not scene.pawn.carrying_chicken, "Put down at one minute even on a one-tile island")
	check(not scene.chicken_carry.contact_allowed(scene.layout.chickens[0]), "Put-down cannot immediately pick up again")
	scene.pawn.position += Vector2(64, 0)
	check(scene.chicken_carry.contact_allowed(scene.layout.chickens[0]), "Leaving rearms pickup")
	scene.pawn.position -= Vector2(64, 0)
	chicken.position = scene.layout.chickens[0]
	chicken.previous_pawn_position = scene.pawn.position - Vector2(8, 0)
	scene.layout.cells[Vector2i.RIGHT] = "meadow"
	chicken.updated_at = 160.9
	chicken.advance(0.1, 161.0)
	check(scene.layout.chicken_release_at == 0 and chicken.fleeing, "A reachable direction away escapes instead of pickup")
	chicken.fleeing = false
	chicken.escape_route.clear()
	chicken.tile_destinations.clear()
	chicken.position = scene.layout.center(Vector2i.ZERO)
	scene.layout.chickens[0] = chicken.position
	scene.layout.cells.erase(Vector2i.RIGHT)
	scene.layout.cells[Vector2i.LEFT] = "meadow"
	chicken.approach_direction = Vector2.RIGHT
	chicken.advance(0.1, 161.1)
	check(scene.layout.chicken_release_at > 0, "Only a route back toward the approaching pawn counts as cornered")
	# Another cornered bird remains on the ground while the pawn carries one.
	scene.layout.chickens.append(scene.layout.center(Vector2i.ZERO))
	check(not scene.chicken_carry.pickup(0, 162.0), "Carry at most one chicken")
	scene.layout.chickens.clear()
	# An unavailable landing preserves the bird until there is safe ground.
	var ground: Dictionary = scene.layout.cells.duplicate()
	scene.layout.cells.clear()
	scene.chicken_carry.advance(300.0)
	check(scene.pawn.carrying_chicken and scene.layout.chickens.is_empty(), "Unsafe put-down keeps chicken safe")
	scene.layout.cells.assign(ground)
	scene.chicken_carry.advance(300.0)
	check(not scene.pawn.carrying_chicken and scene.layout.chickens.size() == 1, "Background catch-up releases once a safe landing exists")
	# Build mode leaves a trapped bird on the ground.
	scene.chicken_carry.released_cell = Vector2i(999, 999)
	chicken.position = scene.layout.center(Vector2i.ZERO)
	scene.layout.chickens[0] = chicken.position
	scene.layout.cells.erase(Vector2i.LEFT)
	scene.editing = true
	chicken.fleeing = false
	chicken.advance(0.1, 300.1)
	check(not scene.pawn.carrying_chicken, "Inventory mode never triggers automatic pickup")
	scene.editing = false
	chicken.advance(0.1, 300.2)
	check(scene.pawn.carrying_chicken, "Resuming gameplay picks up a trapped contact")
	var bad: Dictionary = scene.layout.snapshot()
	bad.chicken_release_at = -1
	check(not Layout.new().restore(bad), "Reject invalid carried deadlines")
	bad = scene.layout.snapshot()
	bad.chickens.append([scene.pawn.position.x, scene.pawn.position.y])
	check(not Layout.new().restore(bad), "Reject duplicating a carried chicken")
	check(scene.pawn.sprite.sprite_frames.get_frame_count("chicken_idle") == 24, "Carry idle combines original eight pawn and six bird frames")
	check(scene.pawn.sprite.sprite_frames.get_frame_count("chicken_run") == 12, "Carry run keeps original six-step stride")
	print("Chicken carry checks: %s" % ("PASS" if failures.is_empty() else str(failures)))
	quit(0 if failures.is_empty() else 1)
