extends SceneTree

var failures := 0
var checks := 0

func check(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		push_error(message)

func visible_base(bush: Sprite2D, height: float, frame: int) -> float:
	var size := Vector2i(bush.texture.get_width() / bush.hframes, bush.texture.get_height())
	var image := bush.texture.get_image().get_region(Rect2i(Vector2i(frame * size.x, 0), size))
	return bush.position.y + (bush.get_rect().position.y + image.get_used_rect().end.y) * bush.scale.y + height

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(1152, 496)
	var scene = load("res://previews/level_three.tscn").instantiate()
	scene.preview_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.pawn.set_physics_process(false)
	scene.set_process(false)
	scene.editing = false
	scene.pawn.show()
	scene.layout.flora.clear()
	var cell := Vector2i(0, 1)
	var center: Vector2 = scene.layout.center(cell)
	var world = scene.get_node("World")
	scene.layout.chickens.assign([center])
	scene.layout.sheep.assign([center])
	for mode in ["ramps", "rocks", "flat"]:
		if mode == "ramps":
			scene.layout.cells[Vector2i(1, 1)] = "stairs"
			scene.layout.stair_directions[Vector2i(1, 1)] = Vector2i.RIGHT
		else:
			scene.layout.cells[Vector2i(1, 1)] = "meadow"
		for height in [0, 64, 128]:
			scene.layout.elevations[cell] = height
			for variant in [1, 2]:
				scene.layout.decorations = {cell: {"kind": "bush", "variant": variant}}
				if mode == "rocks":
					scene.layout.decorations[Vector2i(3, 2)] = {"kind": "land_rock", "variant": 1}
				scene.rebuild_decorations()
				var bush: Sprite2D = scene.flora_nodes[0]
				scene.pawn.z_index = int(height / 64.0)
				scene.pawn.sprite.position.y = -32 - height
				var actors: Array = [scene.pawn]
				for animal in scene.asset_nodes:
					if animal.has_method("animal_positions"):
						animal.set_process(false)
						animal.z_index = int(height / 64.0)
						animal.offset = animal.art_offset - Vector2(0, height / animal.art_scale)
						actors.append(animal)
				check(bush.get_parent() == world and bush.z_index == scene.pawn.z_index, "Bush and pawn share the elevation layer")
				check(bush.position + bush.offset * bush.scale == center - Vector2(0, 11.25 + height), "Changing bush depth preserves its artwork position")
				var contact := visible_base(bush, height, 0)
				for frame in bush.hframes:
					check(is_equal_approx(world.depth_y(bush), visible_base(bush, height, frame)), "Bush depth matches the visible base throughout its animation")
				for front in [false, true]:
					for actor in actors:
						var foot: float = scene.pawn.FOOT_DEPTH_Y if actor == scene.pawn else actor.bush_depth_offset(bush)
						actor.position = Vector2(center.x + 8, contact - foot + (1 if front else -1))
					await process_frame
					await process_frame
					for actor in actors:
						check(world.actor_in_front(actor, bush) == front, "Pawn and animals switch depth either side of their contact contour")
						check((actor.get_index() > bush.get_index()) == front, "Flat, ramp and rock ordering preserve actor/bush contact overlap")
					if OS.get_cmdline_user_args().has("--capture") and mode == "ramps" and height == 0 and variant == 1:
						await RenderingServer.frame_post_draw
						root.get_texture().get_image().save_png("/tmp/edenia-bush-%s.png" % ("front" if front else "behind"))
					if mode == "flat":
						check(not world.y_sort_enabled, "Flat bushes use the same contact ordering as ramps and rocks")
	scene.queue_free()
	await process_frame
	print("Bush depth checks: ", checks, "; failures=", failures)
	quit(0 if failures == 0 else 1)
