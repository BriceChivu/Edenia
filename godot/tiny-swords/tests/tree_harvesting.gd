extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Harvesting = preload("res://scripts/tree_harvesting.gd")
const TreeArt = preload("res://scripts/tree_art.gd")
const CutEffect = preload("res://scripts/tree_cut_effect.gd")
var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func run() -> void:
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	var layout = world.layout
	var cell := Vector2i(1, 0)
	check(layout.edit(cell, "tree", Layout.HOME, -1, Vector2.ZERO), "Place a level-four tree")
	world.rebuild_decorations()
	var harvesting = world.harvesting
	layout.level = 3
	check(not harvesting.start(cell), "Axe cutting is locked below level four")
	layout.level = 4
	var walking_destination: Vector2 = world.pawn.position + Vector2(8, 0)
	world.pawn.walk_to(walking_destination)
	world.waypoints.append(walking_destination + Vector2(8, 0))
	world.toggle_editing()
	check(world.pawn.destination == walking_destination and world.waypoints.size() == 1, "Opening terrain UI preserves walking destination and route")
	world.toggle_editing()
	check(world.pawn.destination == walking_destination and world.waypoints.size() == 1, "Closing terrain UI preserves walking destination and route")
	world.waypoints.clear()
	var stock_before: Dictionary = layout.stock.duplicate()
	for kind in Layout.TREE_VARIANTS:
		layout.carried_wood = 0 # Delivery is covered by log_delivery.gd.
		layout.tree_types[cell] = kind
		world.rebuild_decorations()
		world.pawn.position = layout.center(Layout.HOME)
		world.pawn.walk_to(world.pawn.position)
		var sprite: Sprite2D = world.tree_nodes.back()
		sprite.set_process(false)
		var frame_image: Image = sprite.texture.get_image().get_region(Rect2i(sprite.frame * 192, 0, 192, int(sprite.texture.get_height())))
		var canopy_pixel := Vector2.ZERO
		var found := false
		for y in frame_image.get_height():
			for x in frame_image.get_width():
				if frame_image.get_pixel(x, y).a == 1.0:
					canopy_pixel = Vector2(x + 0.5, y + 0.5)
					found = true
					break
			if found:
				break
		var canopy: Vector2 = sprite.position + (canopy_pixel - Vector2(192, frame_image.get_height()) / 2 + sprite.offset) * sprite.scale
		check(world.tree_at(canopy) == cell, "Tree canopy hit targets its tree")
		world.editing = true
		world.selected = "remove"
		check(world.clicked_cell(canopy) == cell, "Pickup targets the visible tree canopy")
		world.editing = false
		var click := InputEventMouseButton.new()
		click.button_index = MOUSE_BUTTON_LEFT
		click.pressed = true
		click.position = world.get_global_transform_with_canvas() * canopy
		world.handle_world_click(click)
		check(harvesting.phase == Harvesting.Phase.EQUIPPING, "Clicking tree canopy starts axe equip: " + kind)
		check(world.pawn.sprite.animation == "axe_idle", "Equip uses axe idle")
		harvesting.advance(0.2, 1000)
		check(harvesting.phase == Harvesting.Phase.EQUIPPING, "Brief equip pose precedes movement")
		harvesting.advance(0.2, 1000)
		check(harvesting.phase == Harvesting.Phase.APPROACHING, "Equip transitions to approach")
		world.pawn._physics_process(0.01)
		check(world.pawn.sprite.animation == "axe_run", "Approach uses axe run")
		while not world.waypoints.is_empty():
			world.pawn.position = world.pawn.destination
			world.pawn.walk_to(world.waypoints.pop_front())
		world.pawn.position = world.pawn.destination
		harvesting.advance(0, 1000)
		check(harvesting.phase == Harvesting.Phase.CUTTING and world.pawn.sprite.animation == "axe_interact", "Arrival starts axe interaction")
		world.toggle_editing()
		harvesting.advance(0, 1000)
		check(harvesting.phase == Harvesting.Phase.CUTTING and world.pawn.chopping, "Opening terrain UI keeps tree cutting active: " + kind)
		world.toggle_editing()
		check(harvesting.phase == Harvesting.Phase.CUTTING, "Closing terrain UI keeps tree cutting active: " + kind)
		var trunk: Vector2 = layout.tree_position(cell)
		var contact: Vector2 = world.pawn.position + Vector2(-44 if world.pawn.sprite.flip_h else 44, 0)
		check(contact.is_equal_approx(trunk), "Fourth axe frame aligns with the trunk")
		var seconds: float = Harvesting.duration(kind)
		check(seconds == 10, "Exact requested cut duration")
		harvesting.advance(0.01, 1000 + seconds / 2)
		check(layout.resources.wood == ["tree", "tree2", "tree3", "tree4"].find(kind), "No early wood grant")
		harvesting.cancel()
		check(layout.tree_cut_remaining[cell] == seconds / 2, "Cancellation retains partial cutting progress")
		var saved: Dictionary = JSON.parse_string(JSON.stringify(layout.snapshot()))
		var reloaded = Layout.new()
		check(reloaded.restore(saved), "Partly cut tree save restores")
		check(reloaded.tree_cut_remaining == layout.tree_cut_remaining, "Saved cutting progress is exact")
		check(not layout.can_edit(cell, "tree", Layout.HOME), "Variant cycling cannot reset partial work")
		check(harvesting.start(cell), "Partial cutting can resume")
		harvesting.advance(1, 1000)
		world.waypoints.clear()
		world.pawn.position = world.pawn.destination
		harvesting.advance(0, 1000)
		harvesting.advance(seconds / 2 - 0.01, 1000)
		check(not layout.tree_stumps.has(cell), "Tree survives until full cut duration")
		world.pawn.sprite.set_frame_and_progress(3, 0.5)
		harvesting.advance(0.02, 1000)
		check(not layout.tree_stumps.has(cell) and world.pawn.chopping, "Timer expiry keeps tree and axe swing active")
		check(layout.resources.wood == ["tree", "tree2", "tree3", "tree4"].find(kind), "Timer expiry does not award wood before swing ends")
		if kind == "tree":
			await world.pawn.sprite.animation_looped
		else:
			world.pawn.sprite.animation_looped.emit()
		check(layout.tree_stumps.has(cell), "Finished tree becomes stump")
		var effect
		for child in world.get_node("World").get_children():
			if child is CutEffect and not child.is_queued_for_deletion():
				effect = child
		check(effect != null, "Cut completion starts its visual effect")
		if effect != null:
			effect.set_process(false)
			check(effect.tree.texture == sprite.texture and effect.tree.frame == sprite.frame, "Fade preserves the cut tree's artwork and current pose")
			check(effect.position == sprite.position and effect.z_index == sprite.z_index, "Completion retains tree position and terrain depth")
			check(effect.dust.size() == 2 and effect.dust[0].hframes == 8 and effect.dust[1].hframes == 10, "Both complete dust atlases play")
			effect.advance(0.1)
			check(is_equal_approx(effect.tree.modulate.a, 0.5) and effect.dust[0].frame == 1, "Tree quickly turns transparent while dust animates")
			effect.advance(0.1)
			check(effect.tree.modulate.a == 0 and effect.dust[1].visible, "Tree disappears while dust continues")
			effect.advance(0.81)
			check(effect.is_queued_for_deletion(), "Completion effect cleans up after one dust playback")
		check(world.tree_nodes.back().texture.get_image().get_size() == TreeArt.STUMPS[kind].get_image().get_size() and world.tree_nodes.back().hframes == 1, "Uses matching static stump PNG")
		check(not harvesting.start(cell), "Cannot harvest a stump")
		check(layout.tree_stumps[cell] == 1300, "Every tree regrows five minutes after cutting")
		check(layout.stock == stock_before, "Build inventory does not change")
		check(not world.pawn.axe_equipped and not world.pawn.chopping, "Pawn puts away axe after cutting")
		saved = JSON.parse_string(JSON.stringify(layout.snapshot()))
		check(reloaded.restore(saved), "Stump and wood save restore")
		check(reloaded.resources == layout.resources and reloaded.tree_stumps == layout.tree_stumps, "Wood and regrowth deadline survive save")
		harvesting.advance(0, 1000 + Harvesting.regrowth_duration(kind) - 0.01)
		check(layout.tree_stumps.has(cell), "Stump stays until regrowth deadline")
		harvesting.advance(0, 1000 + Harvesting.regrowth_duration(kind))
		check(not layout.tree_stumps.has(cell) and layout.tree_types[cell] == kind, "Same tree variant regrows at deadline")
	check(layout.resources.wood == 4, "Every tree yields one log")
	# Work belongs to the tree across real movement clicks and separate visits.
	layout.carried_wood = 0
	layout.tree_types[cell] = "tree"
	world.rebuild_decorations()
	check(harvesting.start(cell), "Start a ten-second tree for separate visits")
	harvesting.advance(1, 3000)
	world.waypoints.clear()
	world.pawn.position = world.pawn.destination
	harvesting.advance(0, 3000)
	harvesting.advance(5, 3005)
	var walk_click := InputEventMouseButton.new()
	walk_click.button_index = MOUSE_BUTTON_LEFT
	walk_click.pressed = true
	walk_click.position = world.get_global_transform_with_canvas() * layout.center(Layout.HOME)
	world.handle_world_click(walk_click)
	check(harvesting.phase == Harvesting.Phase.READY, "Walking away pauses cutting")
	harvesting.advance(60, 3065)
	check(layout.tree_cut_remaining[cell] == 5, "Five seconds of work remain saved during a walk")
	world.pawn.position = world.pawn.destination
	check(harvesting.start(cell), "Return to the same partly cut tree")
	harvesting.advance(1, 3065)
	world.waypoints.clear()
	world.pawn.position = world.pawn.destination
	harvesting.advance(0, 3065)
	harvesting.advance(4.99, 3069.99)
	check(not layout.tree_stumps.has(cell), "Separate visits still require ten seconds total")
	harvesting.advance(0.01, 3070)
	world.pawn.sprite.animation_looped.emit()
	check(layout.tree_stumps.has(cell) and layout.resources.wood == 5, "Five plus five seconds completes the tree once")
	layout.tree_stumps.clear()
	# Legacy saves load with zero harvested resources.
	var legacy: Dictionary = layout.snapshot()
	legacy.version = 15
	legacy.erase("resources")
	legacy.erase("tree_stumps")
	legacy.erase("tree_cut_remaining")
	var migrated = Layout.new()
	check(migrated.restore(legacy) and migrated.resources.wood == 0, "Version 15 migrates without awarding wood")
	var invalid: Dictionary = layout.snapshot()
	invalid.tree_stumps = [[cell.x, cell.y, -1]]
	check(not migrated.restore(invalid), "Reject negative regrowth deadline")
	invalid = layout.snapshot()
	invalid.tree_cut_remaining = [[cell.x, cell.y, 9999]]
	check(not migrated.restore(invalid), "Reject impossible cutting duration")
	var previous_timing: Dictionary = layout.snapshot()
	previous_timing.tree_cut_remaining = [[cell.x, cell.y, 300 if layout.tree_types.get(cell, "tree") == "tree4" else 600]]
	check(migrated.restore(previous_timing), "Previous cutting timers remain loadable")
	check(migrated.tree_cut_remaining[cell] == Harvesting.duration(layout.tree_types.get(cell, "tree")), "Previous cutting timers use the shorter duration")
	# A reachable tree on a narrow shoreline still needs a usable cutting spot.
	layout.cells = {Layout.HOME: "grass", Vector2i(0, -1): "grass"}
	layout.elevations.clear()
	var shore := Vector2i(0, -1)
	for kind in Layout.TREE_VARIANTS:
		layout.carried_wood = 0 # Delivery is covered by log_delivery.gd.
		for offset in [Vector2(-16, 0), Vector2.ZERO, Vector2(14, 28)]:
			layout.carried_wood = 0
			layout.trees = {shore: offset}
			layout.tree_types = {shore: kind}
			world.pawn.position = layout.center(Layout.HOME)
			world.pawn.walk_to(world.pawn.position)
			var wood_before: int = layout.resources.wood
			check(harvesting.start(shore), "Shoreline tree can be cut: " + kind + str(offset))
			harvesting.advance(1, 2000)
			while not world.waypoints.is_empty():
				world.pawn.position = world.pawn.destination
				world.pawn.walk_to(world.waypoints.pop_front())
			world.pawn.position = world.pawn.destination
			check(layout.walkable_point(world.pawn.position), "Shoreline cutting position stays on land")
			harvesting.advance(0, 2000)
			harvesting.advance(Harvesting.duration(kind), 2000)
			world.pawn.sprite.animation_looped.emit()
			check(layout.tree_stumps.has(shore) and layout.resources.wood == wood_before + Harvesting.wood_yield(kind), "Shoreline cutting completes and awards wood")
			layout.tree_stumps.clear()
	# A completely suspended tab catches up and awards wood exactly once.
	layout.carried_wood = 0
	check(harvesting.start(shore), "Start cutting before background suspension")
	harvesting.advance(1, 2000)
	world.waypoints.clear()
	world.pawn.position = world.pawn.destination
	harvesting.advance(0, 2000)
	var background_wood: int = layout.resources.wood
	harvesting.advance(0.01, 2020)
	check(not layout.tree_stumps.has(shore), "Suspended timer expiry still waits for visible swing completion")
	world.pawn.sprite.animation_looped.emit()
	check(layout.tree_stumps.has(shore), "Suspended cutting finishes from elapsed clock time")
	check(layout.resources.wood == background_wood + 1, "Background completion awards wood once")
	check(layout.tree_stumps.get(shore) == 2320, "Regrowth starts when the final swing completes")
	harvesting.advance(0.01, 2021)
	check(layout.resources.wood == background_wood + 1, "Resume does not duplicate wood")
	# A disconnected tree cannot trigger movement or wood.
	layout.trees.erase(cell)
	layout.tree_types.erase(cell)
	layout.trees[Vector2i(3, 2)] = Vector2.ZERO
	world.pawn.position = layout.center(Layout.HOME)
	world.pawn.walk_to(world.pawn.position)
	check(not harvesting.start(Vector2i(3, 2)), "Unreachable tree cannot be cut")
	world.queue_free()
	await process_frame
	print("Tree harvesting checks: %d failures" % failures)
	quit(0 if failures == 0 else 1)
