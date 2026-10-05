extends SceneTree
var failures := 0
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var level = load("res://scenes/level_two_preview.tscn").instantiate()
	level.preview_save_enabled = false
	root.size = Vector2i(1152, 496)
	root.add_child(level)
	await process_frame
	var cloud = level.get_node("Clouds/WestCloud")
	cloud.set_process(false)
	cloud.set_variant(0)
	cloud.set_altitude(0.0)
	cloud.position = Vector2(576, 240)
	if not cloud.has_method("shadow_ground_position"):
		push_error("Cloud depth has no shadow ground anchor; low cloud still sits behind every tree")
		quit(1)
		return
	var tree := Sprite2D.new()
	tree.texture = load("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")
	tree.hframes = 8
	level.get_node("World").add_child(tree)
	for tier in [0, 1, 2]:
		tree.z_index = tier
		for difference in [-10, 10]:
			tree.position.y = cloud.shadow_ground_position().y + difference
			cloud.update_depth_mask()
			if cloud.depth_occluders.has(tree) != (difference > 0):
				failures += 1
				push_error("Tree occlusion must follow shadow Y at every elevation")
	level.layout.cells[Vector2i(2, 0)] = "high_gold"
	level.rebuild_decorations()
	var subjects: Array = [level.pawn]
	for item in level.get_node("World").get_children():
		if item.has_meta("terrain_occluder"):
			subjects.append(item)
	for subject in subjects:
		var original: Vector2 = subject.position
		for difference in [-10, 10]:
			subject.position.y = cloud.shadow_ground_position().y + difference
			cloud.update_depth_mask()
			if cloud.depth_occluders.has(subject) != (difference > 0):
				failures += 1
				push_error("Pawn and raised terrain must also use cloud shadow Y")
			subject.position = original
	# Keep one occluder copy across sheet changes, including grazing frames
	# beyond the idle sheet's six columns and a subsequent smaller run sheet.
	var animal := Sprite2D.new()
	animal.position = Vector2(576, cloud.shadow_ground_position().y + 10)
	animal.texture = level.LevelFiveArt.SHEEP_IDLE
	animal.hframes = 6
	level.get_node("World").add_child(animal)
	cloud.update_depth_mask()
	var animal_copy: Sprite2D = cloud.depth_occluders[animal]
	for sheet in [[level.LevelFiveArt.SHEEP_IDLE, 6, 1], [level.LevelFiveArt.SHEEP_GRASS, 12, 1], [level.LevelFiveArt.SHEEP_RUN, 4, 1], [level.LevelFiveArt.SHEEP_IDLE, 6, 1], [level.LevelFiveArt.SHEEP_GRASS, 6, 2]]:
		animal.frame = 0
		animal.texture = sheet[0]
		animal.hframes = sheet[1]
		animal.vframes = sheet[2]
		for pose in range(animal.hframes * animal.vframes):
			animal.frame = pose
			cloud.update_depth_mask()
			if cloud.depth_occluders[animal] != animal_copy or animal_copy.texture != animal.texture or animal_copy.hframes != animal.hframes or animal_copy.vframes != animal.vframes or animal_copy.frame != pose or animal_copy.get_rect() != animal.get_rect():
				failures += 1
				push_error("Cloud occluder must match the current animation sheet and frame: %s" % [sheet])
	level.get_node("World").remove_child(animal)
	animal.queue_free()
	cloud.update_depth_mask()
	# A red marker overlaps an opaque cloud pixel while its ground anchor
	# moves behind/in front. Keep its displayed position fixed with offset.
	var marker_image := Image.create(20, 20, false, Image.FORMAT_RGBA8)
	marker_image.fill(Color.RED)
	tree.texture = ImageTexture.create_from_image(marker_image)
	tree.hframes = 1
	var sample := Vector2(576, 210)
	for viewport_size in [Vector2i(1152, 496), Vector2i(864, 372), Vector2i(1536, 662), Vector2i(600, 600)]:
		root.size = viewport_size
		for difference in [-10, 10]:
			tree.position = Vector2(sample.x, cloud.shadow_ground_position().y + difference)
			tree.offset = sample - tree.position
			for frame in range(3):
				await process_frame
			await RenderingServer.frame_post_draw
			var picture := root.get_texture().get_image()
			if not picture.is_empty():
				var color := picture.get_pixelv(Vector2i(root.get_final_transform() * level.get_global_transform_with_canvas() * sample))
				var red: bool = color.r > 0.9 and color.g < 0.1
				if red != (difference > 0):
					failures += 1
					push_error("Rendered cloud/tree overlap disagrees with shadow Y: %s" % color)
				picture.save_png("/tmp/edenia-cloud-depth-%s.png" % difference)
	print("Cloud shadow depth: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
