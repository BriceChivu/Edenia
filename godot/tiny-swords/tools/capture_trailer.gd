extends SceneTree

# Run with the desktop renderer. Captures the canonical game, never learner saves.
# Godot --path godot/tiny-swords --script res://tools/capture_trailer.gd
func _initialize() -> void:
	run.call_deferred()

func capture_size(name: String) -> void:
	for frame in range(12):
		await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var output := ProjectSettings.globalize_path("res://../../images/tiny-swords-trailer/%s.png" % name)
	assert(image.save_png(output) == OK)

func capture(name: String) -> void:
	root.size = Vector2i(1152, 496)
	await capture_size(name)
	root.size = Vector2i(390, 300)
	await capture_size(name + "-phone")
	root.size = Vector2i(1152, 496)

func run() -> void:
	root.size = Vector2i(1152, 496)
	var game = load("res://previews/level_one_to_two.tscn").instantiate()
	root.add_child(game)
	game.playground_enabled = false
	if game.playground != null:
		game.playground.root.hide()
	game.game_camera.position = game.pawn_view_center()
	await capture("study")
	game.unlock_level(2)
	await create_timer(1.3).timeout
	for locale in ["en", "zh-Hant", "zh-Hans", "es", "fr"]:
		root.get_node("GameCopy").set_locale(locale)
		await capture("unlock" if locale == "en" else "unlock-" + locale)
	root.get_node("GameCopy").set_locale("en")
	game.ui.celebration.get_node("BuildButton").pressed.emit()
	# Place rewards through the same layout and rendering machinery as gameplay.
	game.selected = "ground"
	game.refresh()
	var placed := 0
	for cell in game.layout.cells.keys():
		for direction in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
			var target: Vector2i = cell + direction
			if placed < 3 and not game.layout.cells.has(target) and game.apply_edit(target, 0):
				placed += 1
	await capture("build")
	quit()
