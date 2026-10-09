extends SceneTree

# THROWAWAY: two synthetic level-four saves rendered by the canonical game.
# Never opens a learner profile. Run with the desktop renderer after import.
const Terrain = preload("res://scripts/playground_terrain.gd")

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(800, 480)
	root.content_scale_size = Vector2i(800, 480)
	var game = load("res://previews/level_four.tscn").instantiate()
	game.camera_save_enabled = false
	root.add_child(game)
	if game.editing:
		game.toggle_editing()
	game.preview_save_enabled = false
	game.ui.hide()
	game.get_node("Clouds").hide()
	game.get_node("PassingCloud").hide()
	game.pointer.hide()
	var fixtures: Array[Dictionary] = []
	for seed_value in [41, 93]:
		fixtures.append(Terrain.generate(Terrain.fresh(4), seed_value).snapshot())
	var bounds := Rect2()
	var first := true
	for data in fixtures:
		assert(game.restore_saved_layout(data, false))
		for cell in game.layout.cells:
			var point: Vector2 = game.layout.center(cell)
			if first:
				bounds = Rect2(point, Vector2.ZERO)
				first = false
			else:
				bounds = bounds.expand(point)
	# Shared framing lets the learner compare footprint without zoom bias.
	var center := bounds.get_center() + Vector2(0, -24)
	for index in range(fixtures.size()):
		assert(game.restore_saved_layout(fixtures[index], false))
		game.game_camera.position = center
		game.game_camera.zoom = Vector2.ONE * minf(800.0 / (bounds.size.x + 200), 480.0 / (bounds.size.y + 200))
		game.get_node("Clouds").hide()
		game.get_node("PassingCloud").hide()
		game.pointer.hide()
		game.process_mode = Node.PROCESS_MODE_DISABLED
		for frame in range(12):
			await process_frame
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		var name := "device" if index == 0 else "cloud"
		var output := ProjectSettings.globalize_path("res://../../src/features/profile-access/prototype-island-previews/%s.png" % name)
		assert(image.save_png(output) == OK)
	quit()
