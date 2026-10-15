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
	root.size = Vector2i(1152, 496)
	var world = load("res://scenes/level_two_preview.tscn").instantiate()
	world.preview_save_enabled = false
	world.island_start_enabled = false
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	world.refresh()
	var l = world.layout
	l.trees.clear()
	l.flora.clear()
	l.cells.clear()
	l.elevations.clear()
	l.stair_directions.clear()
	for x in range(-2, 3):
		for y in range(-1, 2):
			l.cells[Vector2i(x, y)] = "meadow"
	var cell := Vector2i.ZERO
	var center: Vector2 = l.center(cell)
	var behind := center - Vector2(0, 24)
	var front := center + Vector2(0, 28)
	var depth = world.get_node("World")
	for bounded in [false, true]:
		ProjectSettings.set_setting("gameplay/bounded_obstacle_search_enabled", bounded)
		for height in [0, 64, 128]:
			for square in l.cells:
				l.elevations[square] = height
				l.cells[square] = l.kind_at_height(height)
			for variant in range(1, 5):
				l.decorations = {cell: {"kind": "land_rock", "variant": variant}}
				var respawn: Dictionary = world.respawn_location(center, height)
				check(l.walkable_point(respawn.position), "Rock-tile respawn avoids the solid face")
				check(l.cell_at(respawn.position) == cell and respawn.height == height, "Safe respawn retains its ground tile and height")
				l.chickens.assign([behind])
				l.sheep.assign([behind])
				world.rebuild_decorations()
				await process_frame
				var rock: Sprite2D
				var actors: Array = [world.pawn]
				for node in depth.get_children():
					if node.is_queued_for_deletion():
						continue
					if node.has_meta("rock_cell"):
						rock = node
					if node.has_method("animal_positions"):
						node.set_process(false)
						actors.append(node)
				var patch: PackedVector2Array = l.rock_footprint(cell)
				var face := Vector2.ZERO
				for point in patch:
					face += point / patch.size()
				for animal in [false, true]:
					check(l.walkable_point(behind, animal) and l.walkable_point(front, animal), "Grass behind and in front remains walkable")
					check(not l.walkable_point(face, animal), "Annotated red face blocks both pawn and animals")
					check(not world.clear_segment(behind, front, animal), "Swept movement cannot tunnel across the face")
					var allowed: Array[Vector2i] = []
					var route: Array[Vector2] = world.tree_navigation_path(behind, front, allowed, animal)
					check(not route.is_empty(), "Navigation finds a route around every face")
					var previous := behind
					for point in route:
						check(world.clear_segment(previous, point, animal), "Every route segment stays outside solid rock")
						previous = point
				for actor in actors:
					actor.z_index = int(height / 64)
					for in_front in [false, true]:
						actor.position = front if in_front else behind
						if actor == world.pawn:
							actor.sprite.position.y = -32 - height
						else:
							actor.offset = actor.art_offset - Vector2(0, height / actor.art_scale)
						depth._process(0)
						check(depth.actor_in_front(actor, rock) == in_front, "Perspective follows actor's own position")
						check((actor.get_index() > rock.get_index()) == in_front, "Actual draw order covers actors behind the rock")
				if OS.get_cmdline_user_args().has("--capture") and height == 0 and not bounded:
					# Show one actor behind and one in front, with no collision overlay.
					var closest_behind := behind
					for y in range(-24, 12):
						var point := center + Vector2(0, y)
						if l.walkable_point(point) and point.y + world.pawn.FOOT_DEPTH_Y < l.rock_depth_y(patch, point.x):
							closest_behind = point
					actors[0].position = closest_behind
					actors[1].position = center + Vector2(0, 56)
					actors[2].position = center + Vector2(-45, 0)
					world.game_camera.position = center - Vector2(0, 15)
					world.game_camera.zoom = Vector2.ONE * 3.0
					world.game_camera.force_update_scroll()
					await process_frame
					await RenderingServer.frame_post_draw
					root.get_texture().get_image().save_png("/tmp/tiny-swords-rock-perspective-%d.png" % variant)
	world.queue_free()
	await process_frame
	print("Rock contacts: ", checks, " checks; failures=", failures)
	quit(0 if failures == 0 else 1)
