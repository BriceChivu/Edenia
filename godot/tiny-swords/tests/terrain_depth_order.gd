extends SceneTree

var failures := 0
var checks := 0

func check(ok: bool, label: String) -> void:
	checks += 1
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
	var l = world.layout
	l.trees.clear()
	l.flora.clear()
	l.decorations.clear()
	l.houses.clear()
	l.log_piles.clear()
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		for height in [0, 64, 128]:
			for landing_first in [false, true]:
				# Restore preserves tile insertion order. Reversal and terrain edits
				# also produce either ordering of the ramp and its upper landing.
				l.cells = {direction: "high_gold", Vector2i.ZERO: "stairs", -direction: "meadow"} if landing_first else {Vector2i.ZERO: "stairs", direction: "high_gold", -direction: "meadow"}
				l.cells[direction + Vector2i.UP] = "meadow"
				l.elevations = {direction: height + 64, Vector2i.ZERO: height, -direction: height, direction + Vector2i.UP: height}
				l.stair_directions = {Vector2i.ZERO: direction}
				var point: Vector2 = l.center(direction + Vector2i.UP) + Vector2(0,20)
				l.chickens.assign([point])
				l.sheep.assign([point])
				world.rebuild_decorations()
				await process_frame
				var depth = world.get_node("World")
				depth.set_process(false)
				world.pawn.position = point
				world.pawn.z_index = int(height / 64.0)
				var actors: Array = [world.pawn]
				var cliff
				var ramp
				for node in depth.get_children():
					if node.is_queued_for_deletion():
						continue
					if node.has_method("animal_positions"):
						node.set_process(false)
						actors.append(node)
					if node.has_meta("terrain_occluder"):
						if node.piece == direction:
							cliff = node
						if node.piece == Vector2i.ZERO:
							ramp = node
				depth._process(0)
				for actor in actors:
					check(world.ground_height(actor.position) == height, "Behind-landing actor remains on receiving floor")
					check(actor.get_index() > ramp.get_index(), "Actor in front of ramp draws after it")
					check(actor.get_index() < cliff.get_index(), "Pawn, sheep and chicken behind landing draw before it in either insertion order")
	print("Terrain depth order: ", "PASS" if failures == 0 else "FAIL", "; checks=", checks, " failures=", failures)
	quit(0 if failures == 0 else 1)
