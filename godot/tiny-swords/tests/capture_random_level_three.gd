extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const OUTPUT = "res://../../artifacts/terrain-level-3/"

func _initialize() -> void:
	run.call_deferred()

func candidates(layout, tool: String) -> Array:
	var result := []
	for y in range(-2, 4):
		for x in range(-5, 7):
			var cell := Vector2i(x, y)
			if not layout.can_edit(cell, tool, Layout.HOME):
				continue
			if tool == "ground":
				if layout.cells.has(cell):
					continue
				var adjacent := false
				for step in Layout.STEPS:
					if layout.cells.has(cell + step) and layout.cells[cell + step] != "stairs":
						adjacent = true
				if not adjacent:
					continue
			if tool == "stairs":
				var landing = cell + layout.available_stair_direction(cell)
				if landing.x < -5 or landing.x > 6:
					continue
			result.append(cell)
	return result

func signature(layout) -> String:
	var parts := []
	for cell in layout.cells:
		parts.append("%s:%s:%s:%s" % [cell, layout.cells[cell], layout.height_at(cell), layout.stair_direction(cell) if layout.cells[cell] == "stairs" else Vector2i.ZERO])
	parts.sort()
	return str(parts)

func run() -> void:
	root.size = Vector2i(1152, 496)
	var scene = load("res://previews/level_three.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.pointer.hide()
	for name in ["Clouds", "PassingCloud"]:
		scene.get_node(name).hide()
	scene.editing = false
	var output := ProjectSettings.globalize_path(OUTPUT)
	DirAccess.make_dir_recursive_absolute(output)
	var seen := {}
	var manifest := []
	var attempt := 0
	while manifest.size() < 50 and attempt < 10000:
		attempt += 1
		var rng := RandomNumberGenerator.new()
		rng.seed = 310000 + attempt
		var layout = Layout.new()
		layout.flora_rng.seed = rng.seed
		layout.unlock(2)
		layout.unlock(3)
		# Interleave expansions and stairs to vary silhouettes and elevations.
		var tools := ["ground", "ground", "ground", "ground", "ground", "ground", "stairs", "stairs"]
		for i in range(tools.size() - 1, 0, -1):
			var j := rng.randi_range(0, i)
			var temp = tools[i]
			tools[i] = tools[j]
			tools[j] = temp
		var valid := true
		for tool in tools:
			var options := candidates(layout, tool)
			if options.is_empty():
				valid = false
				break
			layout.edit(options[rng.randi_range(0, options.size() - 1)], tool, Layout.HOME)
		if not valid or layout.ground_count() != 0 or layout.stock.stairs != 0:
			continue
		var tree_options := candidates(layout, "tree")
		if tree_options.is_empty():
			continue
		layout.edit(tree_options[rng.randi_range(0, tree_options.size() - 1)], "tree", Layout.HOME)
		var key := signature(layout)
		if seen.has(key):
			continue
		seen[key] = true
		scene.layout = layout
		for child in scene.get_children():
			if child.get_script() == preload("res://scripts/terrain_view.gd"):
				child.layout = layout
		scene.ui.layout = layout
		scene.pawn.position = layout.center(Layout.HOME)
		scene.rebuild_decorations()
		scene.refresh()
		scene.terrain.queue_redraw()
		await process_frame
		await RenderingServer.frame_post_draw
		var number := manifest.size() + 1
		var basename := "terrain-%02d" % number
		var status := root.get_texture().get_image().save_png(output + basename + ".png")
		assert(status == OK)
		var file := FileAccess.open(output + basename + ".json", FileAccess.WRITE)
		file.store_string(JSON.stringify(layout.snapshot(), "\t"))
		manifest.append({"number": number, "seed": rng.seed, "image": basename + ".png", "layout": basename + ".json"})
		print("Captured ", number, "/50 seed=", rng.seed)
	var file := FileAccess.open(output + "manifest.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(manifest, "\t"))
	assert(manifest.size() == 50)
	quit()
