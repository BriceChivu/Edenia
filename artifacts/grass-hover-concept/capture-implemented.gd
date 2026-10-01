extends SceneTree

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(1152,496)
	var game = load("res://previews/level_three.tscn").instantiate()
	root.add_child(game)
	await process_frame
	game.set_process(false)
	game.pawn.set_physics_process(false)
	game.pawn.hide()
	game.game_camera.zoom = Vector2.ONE
	game.game_camera.force_update_scroll()
	for name in ["Clouds","PassingCloud"]:
		game.get_node(name).hide()
	var layout = game.layout
	layout.cells = {Vector2i.ZERO:"high_meadow", Vector2i.DOWN:"high_gold", Vector2i(1,1):"high_gold", Vector2i(2,0):"high_gold", Vector2i(1,2):"meadow", Vector2i(2,1):"meadow"}
	layout.elevations = {Vector2i.ZERO:128, Vector2i.DOWN:64, Vector2i(1,1):64, Vector2i(2,0):64}
	layout.trees.clear()
	layout.flora.clear()
	layout.decorations.clear()
	game.pawn.position = layout.center(Vector2i(1,2))
	game.editing = true
	game.selected = "ground"
	game.rebuild_decorations()
	game.refresh()
	var points = [layout.center(Vector2i(1,0))-Vector2(24,128),layout.center(Vector2i(1,0))-Vector2(-24,64),layout.center(Vector2i(2,2))]
	for i in range(3):
		var point: Vector2 = points[i]
		var option: Dictionary = game.ground_placement_at(point)
		game.terrain.preview_position = point
		game.terrain.hover = option.cell
		game.terrain.ground_preview_height = option.height
		game.terrain.valid = layout.can_edit(option.cell,"ground",layout.cell_at(game.pawn.position),option.height)
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("/Users/brice/Documents/Coding/Edenia/artifacts/grass-hover-concept/implemented-%s.png" % int(option.height/64))
		print("Captured actual preview at floor ",option.height/64)
	quit()
