extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Harvesting = preload("res://scripts/tree_harvesting.gd")
var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func rendered() -> Image:
	await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()

func crown_center(image: Image) -> float:
	var background := image.get_pixel(0, 0)
	var total := 0.0
	var count := 0
	for y in range(230):
		for x in image.get_width():
			if image.get_pixel(x, y) != background:
				total += x
				count += 1
	return total / maxf(count, 1)

func run() -> void:
	root.size = Vector2i(600, 350)
	root.content_scale_size = root.size
	var world = load("res://previews/level_four.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world.camera_save_enabled = false
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.pawn.sprite.pause()
	world.game_camera.enabled = false
	world.hide()
	world.ui.visible = false
	var cell := Vector2i(1, 0)
	world.layout.edit(cell, "tree", Layout.HOME)
	for kind in Layout.TREE_VARIANTS:
		world.layout.tree_types[cell] = kind
		world.rebuild_decorations()
		var tree: Sprite2D = world.tree_nodes.back()
		tree.reparent(root, false)
		tree.position = Vector2(300, 300)
		tree.set_process(false)
		tree.elapsed = 0.4
		var saved_material := tree.material
		tree.material = null
		tree.frame = 2
		var neutral: Image = await rendered()
		tree.material = saved_material
		world.harvesting.phase = Harvesting.Phase.CUTTING
		world.harvesting.target = cell
		world.pawn.sprite.play("axe_interact")
		world.pawn.sprite.pause()
		world.pawn.sprite.flip_h = false
		world.pawn.sprite.frame = 2
		tree._process(0)
		var impact: Image = await rendered()
		check(crown_center(impact) > crown_center(neutral) + 0.5, "Strike visibly bends the crown away from the pawn: " + kind)
		var new_canopy_pixels := 0
		var missed_pixels := 0
		var background := impact.get_pixel(0, 0)
		for y in range(230):
			for x in impact.get_width():
				if impact.get_pixel(x, y) != background and neutral.get_pixel(x, y) == background:
					new_canopy_pixels += 1
					if world.tree_at(Vector2(x + 0.5, y + 0.5)) != cell:
						missed_pixels += 1
		check(new_canopy_pixels > 0 and missed_pixels == 0, "Newly bent canopy pixels remain clickable: " + kind)
		world.pawn.sprite.flip_h = true
		tree._process(0)
		var opposite: Image = await rendered()
		check(crown_center(opposite) < crown_center(neutral) - 0.5, "Right-side chopping reverses the bend: " + kind)
		world.pawn.sprite.flip_h = false
		world.pawn.sprite.frame = 3
		tree._process(0)
		var rebound: Image = await rendered()
		tree.material = null
		var neutral_rebound: Image = await rendered()
		check(crown_center(rebound) < crown_center(neutral_rebound) - 0.5, "The next axe pose visibly rebounds: " + kind)
		tree.material = saved_material
		world.pawn.sprite.frame = 4
		tree._process(0)
		var recovery: Image = await rendered()
		tree.material = null
		var neutral_recovery: Image = await rendered()
		check(recovery.get_data() == neutral_recovery.get_data(), "Follow-through settles to the ambient pose: " + kind)
		tree.material = saved_material
		world.pawn.sprite.frame = 2
		tree._process(0)
		world.harvesting.phase = Harvesting.Phase.READY
		tree._process(0)
		var cancelled: Image = await rendered()
		tree.material = null
		var neutral_cancelled: Image = await rendered()
		check(cancelled.get_data() == neutral_cancelled.get_data(), "Cancelling removes the transient bend: " + kind)
		tree.queue_free()
		await process_frame
		world.tree_nodes.clear()
	world.queue_free()
	await process_frame
	print("Tree cut reaction render checks: %d failures" % failures)
	quit(0 if failures == 0 else 1)
