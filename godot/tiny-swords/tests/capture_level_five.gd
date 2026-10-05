extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(1152, 496)
	var scene = load("res://previews/level_four_to_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.unlock_level(5)
	await create_timer(1.4).timeout
	await RenderingServer.frame_post_draw
	var folder := ProjectSettings.globalize_path("res://../../artifacts/level-five")
	DirAccess.make_dir_recursive_absolute(folder)
	root.get_texture().get_image().save_png(folder.path_join("reward.png"))
	scene.ui.celebration.get_node("BuildButton").pressed.emit()
	scene.layout.flora.clear()
	scene.layout.decorations.clear()
	scene.layout.resources.wood = 10
	scene.selected = "house"
	scene.apply_edit(Vector2i(1, 1))
	scene.selected = "sheep"
	scene.apply_edit(Vector2i(1, 0))
	scene.refresh()
	await create_timer(0.3).timeout
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(folder.path_join("world.png"))
	quit()
