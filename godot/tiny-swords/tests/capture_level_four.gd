extends SceneTree
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	root.size = Vector2i(1152, 496)
	var scene = load("res://previews/level_three_to_four.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.unlock_level(4)
	await create_timer(1.5).timeout
	await RenderingServer.frame_post_draw
	var output := ProjectSettings.globalize_path("res://../../artifacts/level-four-popup.png")
	DirAccess.make_dir_recursive_absolute(output.get_base_dir())
	root.get_texture().get_image().save_png(output)
	var viewport := SubViewport.new()
	viewport.size = Vector2i(470, 330)
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var popup = load("res://scenes/level_four_popup.tscn").instantiate()
	viewport.add_child(popup)
	popup.configure(4)
	await process_frame
	await RenderingServer.frame_post_draw
	viewport.get_texture().get_image().save_png(output.get_base_dir().path_join("level_4_popup.png"))
	var tree: Texture2D = load("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")
	tree.get_image().get_region(Rect2i(0, 0, 192, 256)).save_png(output.get_base_dir().path_join("level_4_tree.png"))
	quit()
