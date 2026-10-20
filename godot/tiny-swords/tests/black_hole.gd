extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
const State = preload("res://scripts/black_hole_state.gd")
const Meadow = preload("res://scripts/black_hole_meadow.gd")
var failures := 0
func check(ok: bool, message: String) -> void:
	if ok: print("PASS: " + message)
	else:
		failures += 1
		push_error(message)
func _initialize() -> void:
	call_deferred("run")
func run() -> void:
	var game = load("res://scenes/level_two_preview.tscn").instantiate()
	game.preview_save_enabled = false
	game.camera_save_enabled = false
	root.add_child(game)
	game.set_process(false)
	game.portal_event.set_process(false)
	var meadow = Meadow.create()
	check(game.restore_saved_layout(meadow.snapshot()), "Populated grass, houses, stairs and animals pass save validation")
	var portal = game.portal_event
	game.black_hole_enabled = false
	portal.start_visit(20000)
	check(game.layout.black_hole.is_empty(), "Disabled rollout does not schedule an event")
	check(not portal.open(20000), "Disabled rollout cannot open a portal")
	game.black_hole_enabled = true
	check(not portal.spot_visible(Vector2i(2, 2)), "Grass behind a tree canopy cannot host the floating portal")
	check(not portal.spot_visible(Vector2i(-4, -3)), "Grass behind a house cannot host the floating portal")
	check(portal.open(20000), "Portal opens on clear reachable grass")
	check(not game.layout.can_edit(Vector2i(game.layout.black_hole.cell[0], game.layout.black_hole.cell[1]), "remove", Vector2i.ZERO), "Active portal grass is protected")
	var chicken_total: int = game.layout.chickens.size()
	var sheep_total: int = game.layout.sheep.size()
	for kind in ["chicken", "sheep", "pawn"]:
		var actor = game.pawn
		for node in game.asset_nodes:
			if kind != "pawn" and not node.is_queued_for_deletion() and node.get_script() == load("res://scripts/%s_visual.gd" % kind):
				actor = node
				break
		if kind == "pawn": actor = game.pawn
		var from_back: bool = kind in ["chicken", "pawn"]
		var approach: Vector2 = portal.center() + Vector2(64 if from_back else -64, 0)
		check(portal.absorb(actor, approach), "%s enters the saved FIFO queue" % kind)
		check(portal.portal.flip_h == from_back, "%s approach turns the portal toward that side before absorption" % kind)
		await process_frame
	check(game.layout.chickens.size() == chicken_total - 1 and game.layout.sheep.size() == sheep_total - 1, "Absorbed animals leave active movement and placement arrays")
	check(game.pawn.portal_absorbed and not game.pawn.visible, "Absorbed pawn is hidden and stops working")
	var blocker := Sprite2D.new()
	blocker.texture = preload("res://scripts/level_five_art.gd").HOUSE_TEXTURES[0]
	blocker.scale = Vector2.ONE * 100.0
	blocker.position = portal.center()
	blocker.set_meta("house_cell", Vector2i.ZERO)
	game.get_node("World").add_child(blocker)
	game.asset_nodes.append(blocker)
	game.inventory_art_revision += 1
	check(not portal.ensure_visible_spot() and not portal.portal.visible, "A completely obscured island hides the portal instead of an invisible trap")
	check(game.layout.black_hole.occupants.size() == 3, "No visible destination preserves all stored occupants")
	game.asset_nodes.erase(blocker)
	blocker.free()
	game.inventory_art_revision += 1
	check(portal.ensure_visible_spot() and portal.portal.visible, "The portal resumes when a visible spot becomes available")
	var saved: Dictionary = JSON.parse_string(JSON.stringify(game.saved_snapshot()))
	check(saved.black_hole.occupants == ["chicken", "sheep", "pawn"], "FIFO order survives serialized snapshot")
	var restored = Layout.new()
	check(restored.restore(saved), "Save conserves animals inside the portal")
	# Establish canonical terrain ordering before checking JSON number stability.
	var canonical: Dictionary = restored.snapshot()
	var reopened = Layout.new()
	check(reopened.restore(JSON.parse_string(JSON.stringify(canonical))) and reopened.snapshot().sync_semantics == canonical.sync_semantics, "Serialized portal preserves the gameplay identity across restore")
	check(not restored.black_hole.facing_left, "Mirrored facing persists across sessions")
	var legacy_facing := saved.duplicate(true)
	legacy_facing.black_hole.erase("facing_left")
	check(Layout.new().restore(legacy_facing), "Earlier portal saves without facing still restore")
	var bad_facing := saved.duplicate(true)
	bad_facing.black_hole.facing_left = "right"
	check(not Layout.new().restore(bad_facing), "Malformed saved facing is rejected")
	var malformed := saved.duplicate(true)
	malformed.black_hole.occupants.append("sheep")
	check(not restored.restore(malformed), "Duplicate animals in the portal are rejected")
	malformed = saved.duplicate(true)
	malformed.black_hole.occupants.append("pawn")
	check(not restored.restore(malformed), "A second pawn is rejected")
	check(restored.snapshot() == canonical, "Rejected restore is atomic")
	check(game.restore_saved_layout(saved), "Reopening restores the occupied portal")
	portal.start_visit(20000)
	check(game.layout.black_hole.phase == "hungry" and game.pawn.portal_absorbed, "Same-day visit keeps all occupants absorbed")
	portal.start_visit(20001)
	check(game.layout.black_hole.phase == "returning", "Next local calendar day's visit starts the return")
	var terrain: Dictionary = game.layout.cells.duplicate()
	game.layout.cells.clear()
	check(not portal.release_one() and game.layout.black_hole.occupants.size() == 3, "Missing landing space retains every passenger")
	game.layout.cells = terrain
	check(portal.release_one() and game.layout.chickens.size() == chicken_total, "First passenger returns once")
	var midway: Dictionary = JSON.parse_string(JSON.stringify(game.saved_snapshot()))
	check(game.restore_saved_layout(midway), "Reload during reunion preserves remaining passengers")
	portal.start_visit(20005)
	check(game.layout.black_hole.occupants == ["sheep", "pawn"], "Several days away do not discard or repeat the return sequence")
	check(not portal.absorb(game.pawn), "Return phase cannot swallow passengers again")
	check(portal.release_one() and game.layout.sheep.size() == sheep_total, "Sheep returns second")
	await create_timer(1.0).timeout
	check(portal.release_one() and not portal.pawn_absorbed(), "Pawn returns last")
	await create_timer(1.0).timeout
	check(game.pawn.visible and not game.pawn.portal_absorbed, "Returned pawn resumes movement")
	check(Layout.new().restore(game.saved_snapshot()), "Completed return retains a valid save")
	portal.finish()
	check(game.layout.black_hole.phase == "idle" and game.layout.black_hole.next_day > State.today(), "Event closes with a rare-event cooldown")
	var old: Dictionary = meadow.snapshot()
	old.version = 34
	old.erase("black_hole")
	check(Layout.new().restore(old), "Existing version-34 islands migrate without an event")
	check(game.restore_saved_layout(meadow.snapshot()), "Fresh meadow can start a second event")
	check(portal.open(State.today()), "Second event opens")
	portal.visited = true
	game.pawn.position = portal.center() + Vector2(-45, 0)
	game.pawn.walk_to(game.pawn.position)
	portal._process(0.01)
	check(game.layout.black_hole.occupants.is_empty(), "Stationary actors are not swallowed")
	game.pawn.position = portal.center() + Vector2(45, 0)
	portal._process(0.01)
	check(not portal.portal.flip_h, "Fast crossing uses the entry side rather than the ending position")
	check(portal.pawn_absorbed(), "Movement segment crossing the center triggers absorption")
	game.layout.black_hole.day = State.today() - 1
	portal.last_process_at = Time.get_unix_time_from_system() - 61
	portal._process(0.01)
	check(game.layout.black_hole.phase == "returning", "Returning to a suspended tab next day starts the reunion")
	check(game.restore_saved_layout(meadow.snapshot()), "A new meadow supports simultaneous entrants")
	check(portal.open(State.today()), "Simultaneous entry event opens")
	portal.visited = true
	var birds: Array[Node] = []
	for node in game.asset_nodes:
		if node.get_script() == preload("res://scripts/chicken_visual.gd") and not node.is_queued_for_deletion(): birds.append(node)
	var before_birds: int = game.layout.chickens.size()
	for index in 2:
		birds[index].set_process(false)
		birds[index].position = portal.center() + Vector2(-45 if index == 0 else 45, 0)
		game.layout.chickens[birds[index].sheep_index] = birds[index].position
	portal._process(0.01)
	for index in 2:
		birds[index].position = portal.center() + Vector2(-5 if index == 0 else 5, 0)
		game.layout.chickens[birds[index].sheep_index] = birds[index].position
	portal._process(0.01)
	check(game.layout.chickens.size() == before_birds - 2 and State.count(game.layout.black_hole, "chicken") == 2, "Two birds entering from opposite sides are both absorbed in one frame")
	check(Layout.new().restore(game.saved_snapshot()), "Simultaneous captures conserve all occupants across reload")
	game.free()
	print("Black hole checks: %s" % ("PASS" if failures == 0 else "FAIL"))
	quit(0 if failures == 0 else 1)
