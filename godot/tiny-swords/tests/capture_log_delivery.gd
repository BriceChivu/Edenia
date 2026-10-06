extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func capture(name: String) -> void:
	await process_frame
	await RenderingServer.frame_post_draw
	var path := ProjectSettings.globalize_path("res://../../artifacts/log-delivery/" + name + ".png")
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	root.get_texture().get_image().save_png(path)

func run() -> void:
	root.size = Vector2i(1152, 496)
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.camera_save_enabled = false
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.editing = false
	world.refresh()
	var cell := Vector2i(1, 0)
	world.layout.flora.erase(cell)
	world.layout.decorations.erase(cell)
	world.game_camera.position = world.layout.center(cell)
	world.game_camera.zoom = Vector2.ONE * 3
	world.pawn.carrying_wood = true
	world.pawn.sprite.play("wood_idle")
	world.layout.log_piles[cell] = 1
	world.rebuild_decorations()
	await capture("one-log-shadow")
	world.layout.log_piles[cell] = 2
	world.rebuild_decorations()
	await capture("two-logs")
	world.layout.log_piles[cell] = 6
	world.rebuild_decorations()
	await capture("six-logs")
	world.pawn.carrying_wood = false
	world.pawn.sprite.play("idle")
	world.pawn.position = world.layout.center(cell)
	world.pawn.sprite.position.y = -32 - world.ground_height(world.pawn.position)
	world.pawn.z_index = int(ceil(world.ground_height(world.pawn.position) / 64.0))
	await capture("pawn-behind-logs")
	world.pawn.position.y += 30
	await capture("pawn-in-front-of-logs")
	quit()
