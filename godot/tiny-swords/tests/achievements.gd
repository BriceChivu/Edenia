extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Rules = preload("res://scripts/achievement_rules.gd")
var failures := 0

func _initialize() -> void:
	call_deferred("run")

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func fixture(path: String, enabled: bool = true):
	var game = load(path).instantiate()
	game.achievements_enabled = enabled
	game.preview_save_enabled = false
	game.camera_save_enabled = false
	root.add_child(game)
	game.set_process(false)
	game.pawn.set_physics_process(false)
	game.harvesting.set_process(false)
	game.construction.set_process(false)
	game.portal_event.set_process(false)
	return game

func run() -> void:
	var public_game = fixture("res://previews/level_five.tscn", false)
	check(public_game.ui.achievements == null, "Ordinary game has no achievements UI")
	check(not public_game.layout.complete_achievement("cut_tree") and public_game.layout.achievements.is_empty(), "Ordinary game cannot record new achievements")
	public_game.queue_free()
	await process_frame

	var game = fixture("res://previews/level_four.tscn")
	check(game.ui.achievements != null and game.layout.achievements.is_empty(), "Internal game starts with real empty progress")
	check(not game.layout.complete_achievement("lay_egg"), "Egg achievement cannot be awarded without a mechanic")
	var egg: Control = game.ui.achievements.get_node("Modal/Sheet/Rows/Egg")
	check(egg.get_node("Status").text == root.get_node("GameCopy").text("achievementComingSoon") and not egg.get_node("Tick").visible, "Egg row is unavailable and has no tick")
	for row in game.ui.achievements.get_node("Modal/Sheet/Rows").get_children():
		check(not row is BaseButton, "Completion is read-only")
	game.editing = false
	game.refresh()
	game.ui.achievements.set_open(true)
	var touch := InputEventScreenTouch.new()
	touch.pressed = true
	touch.position = Vector2(8, 8)
	game.handle_camera_touch(touch)
	check(game.camera_touches.is_empty() and not game.pinch_gesture, "Open parchment cannot start a camera pinch")
	game.ui.achievements.set_open(false)
	var cell := Vector2i(1, 0)
	check(game.layout.edit(cell, "tree", Layout.HOME), "Place a real tree")
	game.editing = false
	game.rebuild_decorations()
	var cutting = game.harvesting
	check(cutting.start(cell), "Start real harvesting")
	cutting.advance(0.4, 1000.0)
	while not game.waypoints.is_empty():
		game.pawn.position = game.pawn.destination
		game.pawn.walk_to(game.waypoints.pop_front())
	game.pawn.position = game.pawn.destination
	cutting.advance(0.0, 1000.0)
	cutting.advance(10.0, 1010.0)
	check(not game.layout.achievements.has("cut_tree"), "A completed timer alone does not award a tree")
	cutting._on_axe_swing_finished()
	check(game.layout.achievements.has("cut_tree") and game.layout.tree_stumps.has(cell), "Final axe swing awards the tree achievement")
	var saved: Dictionary = JSON.parse_string(JSON.stringify(game.saved_snapshot()))
	var restored = Layout.new()
	check(restored.restore(saved) and restored.achievements.get("cut_tree", false), "Earned progress survives JSON save/restore even outside the rollout")
	var before: Dictionary = restored.snapshot()
	for malformed in [[], {"invented": true}, {"cut_tree": false}, {"cut_tree": 1}, {"lay_egg": true}]:
		var invalid: Dictionary = saved.duplicate(true)
		invalid.achievements = malformed
		check(not restored.restore(invalid) and restored.snapshot() == before, "Malformed progress cannot partially replace an island")
	var identity: String = game.layout.snapshot().sync_semantics.sha256
	check(not game.layout.complete_achievement("cut_tree") and game.layout.snapshot().sync_semantics.sha256 == identity, "Repeated completion is idempotent")
	game.queue_free()
	await process_frame

	game = fixture("res://previews/level_five.tscn")
	game.layout.flora.clear()
	game.layout.decorations.clear()
	game.layout.resources.wood = 6
	game.layout.log_piles[Vector2i(0, 1)] = 6
	game.editing = false
	game.rebuild_decorations()
	check(game.construction.pickup(Vector2i(0, 1)), "Approach house logs")
	game.waypoints.clear()
	game.pawn.position = game.layout.center(Vector2i(0, 1))
	game.pawn.walk_to(game.pawn.position)
	game.construction._process(0.0)
	check(game.construction.build(Vector2i(1, 1)), "Start a real house build")
	game.pawn.position = game.pawn.destination if game.waypoints.is_empty() else game.waypoints.back()
	game.waypoints.clear()
	game.pawn.walk_to(game.pawn.position)
	game.construction._process(0.0)
	check(not game.layout.achievements.has("build_house"), "Placement and hammering do not complete a house achievement")
	game.construction.advance_build(game.construction.build_started_at + 20)
	check(game.layout.achievements.has("build_house"), "Completed construction awards a house")
	game.queue_free()
	await process_frame

	game = fixture("res://previews/level_two.tscn")
	game.editing = false
	game.layout.stock.chicken -= 1
	game.layout.chickens.append(game.pawn.position)
	check(game.chicken_carry.pickup(0, 100.0) and game.layout.achievements.has("pick_chicken"), "Successful real pickup awards the chicken achievement")
	check(not game.chicken_carry.pickup(0, 100.1), "A failed pickup does not create another award")
	game.queue_free()
	await process_frame

	game = fixture("res://previews/level_two.tscn")
	game.editing = false
	game.layout.stock.sheep -= 1
	game.layout.sheep.append(game.pawn.position)
	game.layout.sheep_chickens[0] = 100
	game.rebuild_decorations()
	for actor in game.asset_nodes:
		if actor.get_script() == game.sheep_chicken.Sheep:
			check(game.sheep_chicken.transfer(actor, 100.0, 100) and game.layout.achievements.get("pick_chicken", false), "Retrieving a sheep passenger is a real chicken pickup")
			break
	game.queue_free()
	await process_frame

	game = fixture("res://previews/level_two.tscn")
	var seed_value := -1
	for candidate in 10000:
		var rng := RandomNumberGenerator.new()
		rng.seed = candidate
		if Layout.DecorationRules.choose(rng, true, 0) == "ducks":
			seed_value = candidate
			break
	check(seed_value >= 0, "Find a deterministic natural duck roll")
	game.layout.flora_rng.seed = seed_value
	game.selected = "ground"
	game.editing = true
	var empty: Dictionary = game.layout.snapshot()
	check(game.apply_edit(Vector2i(2, 0), 0.0) and game.layout.has_ducks(), "A real terrain placement rolls a rubber duck")
	check(game.layout.achievements.get("rubber_duck", false), "Natural duck discovery awards the achievement")
	game.undo()
	check(not game.layout.has_ducks() and game.layout.achievements.get("rubber_duck", false), "Terrain undo retains earned achievements")
	check(game.restore_saved_layout(empty) and game.layout.achievements.is_empty(), "Full island replacement does not leak progress between profiles or resets")
	game.queue_free()
	await process_frame

	game = fixture("res://scenes/level_two_preview.tscn")
	game.black_hole_enabled = true
	var meadow = preload("res://scripts/black_hole_meadow.gd").create()
	check(game.restore_saved_layout(meadow.snapshot()), "Load a validated portal meadow")
	var portal = game.portal_event
	check(portal.open(20000), "Open the real portal")
	for actor in game.asset_nodes:
		if actor.get_script() == portal.CHICKEN:
			check(portal.absorb(actor), "An animal can enter first")
			break
	check(not game.layout.achievements.has("black_hole"), "An animal disappearing does not award the pawn achievement")
	check(portal.absorb(game.pawn) and game.layout.achievements.has("black_hole"), "Pawn capture awards the black-hole achievement")
	saved = JSON.parse_string(JSON.stringify(game.saved_snapshot()))
	check(restored.restore(saved) and restored.achievements.get("black_hole", false), "Portal achievement persists with its durable occupants")
	var legacy: Dictionary = saved.duplicate(true)
	legacy.version = 35
	legacy.erase("achievements")
	restored.achievements_enabled = true
	check(restored.restore(legacy) and restored.achievements.get("black_hole", false), "Old saves backfill directly evidenced achievements")
	check(not restored.complete_achievement("lay_egg"), "Coming-soon achievement remains unavailable after load")
	var copy = root.get_node("GameCopy")
	var prior: Dictionary = game.layout.snapshot()
	for locale in copy.LOCALES:
		copy.set_locale(locale)
		check(game.ui.achievements.get_node("Modal/Sheet/Rows/Egg/Status").text == copy.text("achievementComingSoon"), "Coming-soon state is translated")
		check(game.layout.snapshot() == prior, "Locale cannot change saved achievements")
	copy.set_locale("en")
	game.queue_free()
	await process_frame
	print("Achievement events, persistence, undo, migration, gating and locales: ", failures, " failures")
	quit(0 if failures == 0 else 1)
