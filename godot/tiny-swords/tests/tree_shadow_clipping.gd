extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Source = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Wood/Trees/Tree1.png")
var failures := 0

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	var cell := Vector2i(1, 0)
	var original := Source.get_image()
	var checked := 0
	for height in [0.0, 64.0, 128.0]:
		level.layout.elevations[cell] = height
		level.layout.cells[cell] = level.layout.kind_at_height(height)
		for offset in [Vector2.ZERO, Vector2(-20, 0), Vector2(20, 0), Vector2(-20, 28), Vector2(20, 28)]:
			level.layout.trees = {cell: offset}
			level.rebuild_decorations()
			var tree: Sprite2D = level.tree_nodes[0]
			var tile := Rect2(level.layout.center(cell) - Vector2(32, 32 + height), Vector2(64, 64))
			level.terrain.hover = cell
			level.terrain.preview_position = level.layout.center(cell) + offset - Vector2(0, height)
			var ghost: Image = level.terrain.clipped_tree_preview_texture().get_image()
			var rendered := tree.texture.get_image()
			if ghost.get_data() != rendered.get_data():
				failures += 1
				push_error("Cursor shadow differs from planted tree")
			var overflow := 0
			var changed_body := 0
			var retained := 0
			for y in original.get_height():
				for x in original.get_width():
					var before := original.get_pixel(x, y)
					var after := rendered.get_pixel(x, y)
					if before.a == 1.0 and before != after:
						changed_body += 1
					if after.a <= 0.0 or after.a >= 1.0:
						continue
					retained += 1
					var pixel := tree.position + (Vector2(x % 192, y) - Vector2(96, 128) + tree.offset) * tree.scale
					if not tile.encloses(Rect2(pixel, tree.scale)):
						overflow += 1
			if overflow > 0 or changed_body > 0 or retained == 0:
				failures += 1
				push_error("Height %s offset %s: %d shadow pixels outside tile, %d changed body pixels, %d retained shadow pixels" % [height, offset, overflow, changed_body, retained])
			checked += 1
	if "--capture" in OS.get_cmdline_user_args():
		level.layout.elevations[cell] = 64
		level.layout.cells[cell] = "high_gold"
		level.rebuild_decorations()
		level.editing = false
		level.refresh()
		await process_frame
		await RenderingServer.frame_post_draw
		DirAccess.make_dir_recursive_absolute("res://../../test-results/tiny-swords-preview")
		root.get_texture().get_image().save_png("res://../../test-results/tiny-swords-preview/tree-shadow-clipping.png")
	print("Tree shadow clipping: %s (%d placements, all 8 frames)" % ["PASS" if failures == 0 else "FAIL", checked])
	quit(0 if failures == 0 else 1)
