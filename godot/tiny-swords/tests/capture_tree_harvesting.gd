extends SceneTree

const TreeArt = preload("res://scripts/tree_art.gd")
const CutEffect = preload("res://scripts/tree_cut_effect.gd")

func _initialize() -> void:
	run.call_deferred()

func opaque_bottom(texture: Texture2D) -> int:
	var image := texture.get_image()
	for y in range(image.get_height() - 1, -1, -1):
		for x in 192:
			if image.get_pixel(x, y).a == 1:
				return y
	return -1

func capture(name: String) -> void:
	await process_frame
	await RenderingServer.frame_post_draw
	var output := ProjectSettings.globalize_path("res://../../artifacts/tree-harvesting/" + name + ".png")
	DirAccess.make_dir_recursive_absolute(output.get_base_dir())
	root.get_texture().get_image().save_png(output)

func run() -> void:
	root.size = Vector2i(1152, 496)
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.camera_save_enabled = false
	world.game_camera.position = Vector2(620, 240)
	world.editing = false
	world.refresh()
	world.harvesting.set_process(false)
	world.set_process(false)
	var cell := Vector2i(1, 0)
	world.layout.edit(cell, "tree", world.layout.HOME)
	for kind in TreeArt.TEXTURES:
		var full: Texture2D = TreeArt.TEXTURES[kind]
		var stump: Texture2D = TreeArt.STUMPS[kind]
		print(kind, " roots: tree ", (opaque_bottom(full) - full.get_height() / 2.0 + TreeArt.art_offset(kind).y) * 0.8,
			" stump ", (opaque_bottom(stump) - stump.get_height() / 2.0 + TreeArt.stump_offset(kind).y) * 0.8)
	world.layout.tree_types[cell] = "tree4"
	world.rebuild_decorations()
	world.harvesting.start(cell)
	await capture("axe-idle")
	world.harvesting.advance(1, Time.get_unix_time_from_system())
	await capture("axe-run")
	world.pawn.set_physics_process(false)
	world.waypoints.clear()
	world.pawn.position = world.pawn.destination
	world.harvesting.advance(0, Time.get_unix_time_from_system())
	world.pawn.sprite.pause()
	world.pawn.sprite.frame = 3
	await capture("axe-cut")
	world.harvesting.advance(300, Time.get_unix_time_from_system())
	var effect
	for child in world.get_node("World").get_children():
		if child is CutEffect:
			effect = child
			effect.set_process(false)
	await capture("cut-dust-start")
	effect.advance(0.1)
	await capture("cut-dust-fade")
	effect.advance(0.1)
	await capture("cut-dust-only")
	effect.advance(0.81)
	await capture("stump")
	quit()
