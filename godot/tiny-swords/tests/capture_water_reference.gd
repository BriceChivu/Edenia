# Run with a renderer (not --headless) to capture actual Godot sprite composition.
extends SceneTree
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	root.size = Vector2i(1152,496)
	var level = load("res://previews/level_one.tscn").instantiate()
	root.add_child(level)
	await process_frame
	level.layout.cells = {Vector2i.ZERO: "meadow"}
	level.layout.flora.clear()
	level.rebuild_decorations()
	for name in ["Clouds", "PassingCloud", "WaterRocks"]:
		level.get_node(name).hide()
	level.set_process(false)
	level.pawn.set_physics_process(false)
	level.pawn.sprite.stop()
	level.splash.stop()
	var output := ProjectSettings.globalize_path("res://../../test-results/tiny-swords-reference/godot")
	DirAccess.make_dir_recursive_absolute(output)
	for frame in range(14):
		level.WaterFall.apply_pose(level.pawn, frame, Vector2(544,208), Vector2.RIGHT, 0.0)
		level.WaterFall.align_splash(level.splash, level.pawn, frame, Vector2(544,208), Vector2.RIGHT)
		level.splash.visible = frame >= 5
		level.splash.frame = maxi(0, frame - 5)
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().get_region(Rect2i(471,71,240,230)).save_png(output + "/frame-%02d.png" % frame)
	quit()
