extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Art = preload("res://scripts/level_five_art.gd")
var failures := 0
var checks := 0

func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func press(world, point: Vector2) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = world.get_global_transform_with_canvas() * point
	world._unhandled_input(event)

func release(world) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.position = world.world_pointer_down.position
	world._input(event)

func run() -> void:
	var world = load("res://previews/level_five.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	world.refresh()
	world.pointer_inside = true
	var l = world.layout
	l.flora.clear()
	l.decorations.clear()
	world.rebuild_decorations()
	var start: Vector2 = world.pawn.position
	press(world, start - Vector2(0, 22))
	check(world.holds.kind == "pawn", "Press hits actual pawn pixels")
	world.holds.advance(0.69)
	check(l.pawn_color == 0, "Short press retains color")
	world.holds.advance(0.02)
	check(l.pawn_color == 1, "Holding changes pawn color")
	for color in [2, 3, 4, 0]:
		world.holds.advance(0.7)
		check(l.pawn_color == color, "Continued hold cycles all five colors")
		for animation in ["idle", "run", "wood_idle", "wood_run", "axe_idle", "axe_run", "axe_interact", "hammer_interact"]:
			var texture = world.pawn.sprite.sprite_frames.get_frame_texture(animation, 0)
			check(texture.atlas.resource_path.contains("/%s Units/" % Art.COLORS[color]), "Every pawn action uses the selected color")
	release(world)
	check(world.pawn.destination == start, "Color hold release does not start walking")
	# Panning cancels hold recognition and leaves colors alone.
	press(world, start - Vector2(0, 22))
	var motion := InputEventMouseMotion.new()
	motion.position = world.world_pointer_down.position + Vector2(20, 0)
	world._input(motion)
	world.holds.advance(2.1)
	release(world)
	check(l.pawn_color == 0, "Camera dragging cancels color cycling")
	l.resources.wood = 6
	l.carried_wood = 6
	var house := Vector2i(3, 2)
	check(l.edit(house, "house", Layout.HOME), "Create a house using real resource and foundation rules")
	world.rebuild_decorations()
	var house_sprite
	for node in world.asset_nodes:
		if node.get_meta("house_cell", Vector2i(999,999)) == house:
			house_sprite = node
	press(world, house_sprite.position + house_sprite.offset - Vector2(0, 25))
	check(world.holds.kind == "house", "Press hits the placed house")
	world.holds.advance(1.41)
	check(l.house_colors.get(house) == 2 and l.houses[house] == 0, "Held house cycles independently without rotating")
	release(world)
	check(house_sprite.texture.resource_path.contains("/Purple Buildings/"), "House uses authored color artwork")
	l.pawn_color = 4
	var saved: Dictionary = JSON.parse_string(JSON.stringify(l.snapshot()))
	var restored = Layout.new()
	check(restored.restore(saved) and restored.house_colors == l.house_colors and restored.pawn_color == 4, "Colors survive JSON save/restore")
	var legacy: Dictionary = saved.duplicate(true)
	legacy.version = 32
	legacy.erase("pawn_color")
	legacy.erase("house_colors")
	check(restored.restore(legacy) and restored.pawn_color == 0 and restored.house_colors.is_empty(), "Older saves migrate to blue without changing the island")
	saved.pawn_color = 9
	check(not restored.restore(saved), "Reject invalid saved color")
	var pile := Vector2i(1, 0)
	l.log_piles[pile] = 6
	l.resources.wood = 6
	world.rebuild_decorations()
	press(world, l.center(pile) + Vector2(0, 6))
	check(world.holds.kind == "logs", "Full pile recognizes a hold")
	world.holds.advance(1.99)
	check(l.log_piles.get(pile) == 6, "Pyramid survives until two seconds")
	world.holds.advance(0.02)
	check(not l.log_piles.has(pile) and l.resources.wood == 0, "Two-second hold discards all six physical and spendable logs")
	release(world)
	check(not world.construction.busy(), "Destructive hold release cannot start house construction")
	var dust := false
	for child in world.get_node("World").get_children():
		dust = dust or child.get_script() == preload("res://scripts/dust_effect.gd")
	check(dust, "Pyramid removal uses shared arrival dust")
	# Pick up ground under both a single log and a full pile; undo/save conserve it.
	for amount in [1, 6]:
		var fresh = Layout.new()
		fresh.unlock(2)
		fresh.flora.clear()
		fresh.decorations.clear()
		fresh.log_piles[pile] = amount
		fresh.resources.wood = amount
		var before: Dictionary = fresh.snapshot()
		check(fresh.edit(pile, "remove", Layout.HOME), "Pick up ground beneath logs")
		check(not fresh.log_piles.has(pile) and fresh.resources.wood == 0 and not fresh.cells.has(pile), "Collected ground discards its logs and resource balance")
		check(Layout.new().restore(fresh.snapshot()), "Log loss saves without orphan piles")
		check(fresh.restore(before) and fresh.log_piles.get(pile) == amount and fresh.resources.wood == amount, "Undo restores terrain and its wood together")
	# Real water sequence retains the wood pose, then loses the log at respawn.
	l.carried_wood = 1
	l.resources.wood = 1
	world.pawn.carrying_wood = true
	world.pawn.position = start
	world.pawn.walk_to(start)
	world.waypoints.clear()
	var water_click := InputEventMouseButton.new()
	water_click.button_index = MOUSE_BUTTON_LEFT
	water_click.pressed = true
	water_click.position = world.get_global_transform_with_canvas() * (start - Vector2(180, 0))
	world.handle_world_click(water_click)
	check(world.pawn.sprite.animation == "wood_run", "Water fall starts in carrying pose")
	await world.respawned
	check(l.carried_wood == 0 and l.resources.wood == 0 and not world.pawn.carrying_wood, "Actual respawn loses carried log")
	check(world.pawn.sprite.animation == "idle", "Respawn returns with empty hands")
	world.queue_free()
	await process_frame
	print("Interaction customization: ", checks, " checks; failures=", failures)
	quit(0 if failures == 0 else 1)
