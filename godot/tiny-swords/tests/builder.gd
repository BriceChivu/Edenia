extends SceneTree

var failures := 0
func _initialize() -> void:
	run.call_deferred()
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
func run() -> void:
	var level = load("res://scenes/level_two_preview.tscn").instantiate()
	level.preview_save_enabled = false
	root.add_child(level)
	await process_frame
	var layout = level.layout
	check(not layout.can_edit(Vector2i(2, 0), "meadow", Vector2i.ZERO), "Locked before level two")
	level.unlock_level_two()
	check(level.ui.celebration != null, "Level two ribbon shown")
	layout.unlock()
	check(layout.stock.meadow == 1 and layout.stock.tree == 1, "Reward granted once")
	level.ui.celebration.queue_free()
	level.ui.celebration = null
	level.toggle_editing()
	check(level.editing, "Build mode entered")
	level.ui.tool_selected.emit("remove")
	check(level.ui.collapsed and not level.ui.panel.visible, "Pick up hides inventory so covered cells are accessible")
	check(not level.apply_edit(Vector2i.ZERO), "Home protected")
	check(level.apply_edit(Vector2i(3, 2)), "Isolated island collected")
	check(layout.stock.meadow == 2, "Collected grass credited")
	level.selected = "meadow"
	check(level.apply_edit(Vector2i(2, 0)), "Grass extends main island")
	level.selected = "high_gold"
	check(level.apply_edit(Vector2i(3, 0)), "Raised gold terrain placed")
	check(layout.height_at(Vector2i(3, 0)) == 32, "Raised terrain has height")
	check(not layout.path(Vector2i.ZERO, Vector2i(3, 0)).is_empty(), "New and raised land is reachable")
	level.walk_on_land(Vector2i(3, 0), layout.center(Vector2i(3, 0)))
	check(level.waypoints.is_empty(), "Straight clear land does not force tile-center stops")
	level.waypoints.clear()
	level.pawn.walk_to(level.pawn.position)
	var boundary: Vector2 = layout.ORIGIN + Vector2(3 * 64, 32)
	check(abs(level.ground_height(boundary - Vector2(0.1, 0)) - level.ground_height(boundary + Vector2(0.1, 0))) < 1, "Height changes smoothly across tile borders")
	level.selected = "tree"
	check(level.apply_edit(Vector2i(2, 0)), "Tree placed")
	check(layout.path(Vector2i.ZERO, Vector2i(3, 0)).is_empty(), "Tree blocks the narrow route")
	level.undo()
	check(layout.stock.tree == 1 and not layout.trees.has(Vector2i(2, 0)), "Undo restores tree inventory and route")
	var restored = load("res://scripts/terrain_layout.gd").new()
	check(restored.restore(JSON.parse_string(JSON.stringify(layout.snapshot()))), "Layout survives JSON save roundtrip")
	restored.unlock()
	check(restored.stock.high_gold == 0, "Reload cannot grant a second reward")
	level.toggle_editing()
	level.walk_on_land(Vector2i(3, 0), layout.center(Vector2i(3, 0)))
	await create_timer(4.5).timeout
	check(level.pawn.position.distance_to(layout.center(Vector2i(3, 0))) < 1, "Pawn walks onto expanded raised land")
	check(level.pawn.sprite.position.y < -60, "Pawn stands on raised ground")
	level.fall_into_water(layout.center(Vector2i(4, 0)))
	await level.splash_started
	check(level.pawn.sprite.rotation == 0, "Upright splash still works on edited land")
	await level.respawned
	check(level.pawn.position == layout.center(Vector2i.ZERO), "Respawn uses protected home")
	print("Builder checks: ", "PASS" if failures == 0 else "FAIL (%s)" % failures)
	quit(0 if failures == 0 else 1)
