extends SceneTree

const Chicken = preload("res://scripts/chicken_visual.gd")
var failures := 0

func check(ok: bool, label: String) -> void:
	if not ok:
		failures += 1
		push_error(label)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var world = load("res://scenes/level_two_preview.tscn").instantiate()
	world.island_start_enabled = false
	world.preview_save_enabled = false
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	var l = world.layout
	l.trees.clear()
	l.flora.clear()
	l.decorations.clear()
	l.log_piles.clear()
	l.houses.clear()
	l.sheep.clear()
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		for height in [0, 64, 128]:
			l.cells.clear()
			l.elevations.clear()
			for x in range(-2, 3):
				for y in range(-2, 3):
					l.cells[Vector2i(x,y)] = "meadow"
					l.elevations[Vector2i(x,y)] = height
			l.cells[Vector2i.ZERO] = "stairs"
			l.cells[direction] = "high_gold"
			l.elevations[direction] = height + 64
			l.stair_directions = {Vector2i.ZERO: direction}
			var upper: Vector2 = l.center(direction)
			var behind: Vector2 = l.center(direction + Vector2i.UP)
			check(not world.clear_segment(upper, behind, true), "Animals cannot cross landing back cliff")
			check(not world.clear_segment(upper, behind), "Pawn cannot cross landing back cliff")
			check(not world.clear_segment(l.center(Vector2i.ZERO), l.center(Vector2i.UP), true), "Animals cannot leave ramp sideways")
			check(not world.clear_segment(upper, l.center(direction * 2), true), "Animals cannot cross landing side cliff")
			check(world.clear_segment(upper, l.center(Vector2i.ZERO), true), "Upper landing connects to the ramp")
			check(world.clear_segment(l.center(Vector2i.ZERO), l.center(-direction), true), "Ramp connects to its lower foot")
			# Fine search and smoothing share the same floor-edge checks.
			var route: Array[Vector2] = world.land_route(upper, direction + Vector2i.UP, behind)
			check(not route.is_empty() and route.back().is_equal_approx(behind), "Pawn detours down the staircase")
			l.chickens.assign([upper])
			var bird = Chicken.new()
			bird.world = world
			world.get_node("World").add_child(bird)
			bird.set_process(false)
			world.pawn.position = l.center(direction + Vector2i(0,-2))
			bird.previous_pawn_position = world.pawn.position
			bird.follow_wait = Chicken.FOLLOW_DELAY
			bird.follow_pawn()
			check(bird.following, "Chicken finds a route to lower ground behind the landing")
			bird.updated_at = 100.0
			var saw_foot: bool = bird.escape_route.any(func(point): return l.cell_at(point) == -direction)
			var previous: Vector2 = bird.position
			for tick in 160:
				bird.advance(0.05, 100.0 + (tick + 1) * 0.05)
				check(absf(world.ground_height(previous) - world.ground_height(bird.position)) <= world.pawn.speed * 0.05 + 0.01, "Actual follow movement changes floor continuously along the ramp")
				saw_foot = saw_foot or l.cell_at(bird.position) == -direction
				previous = bird.position
			check(saw_foot, "Chicken reaches lower stair foot before walking behind landing")
			check(world.ground_height(bird.position) == height and not bird.following, "Chicken finishes on lower floor")
			bird.queue_free()
			await process_frame
	print("Stair floor routes: ", "PASS" if failures == 0 else "FAIL", "; failures=", failures)
	quit(0 if failures == 0 else 1)
