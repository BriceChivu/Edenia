extends SceneTree

const Art = preload("res://scripts/tree_art.gd")
var failures := 0

func _initialize() -> void:
	run.call_deferred()

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	level.camera_save_enabled = false
	root.add_child(level)
	await process_frame
	level.process_mode = Node.PROCESS_MODE_DISABLED
	level.editing = true
	level.selected = "tree"
	level.layout.next_tree_variant = "tree"
	# This valid placement lets the painted shadow cross an exposed grass edge.
	var cell := Vector2i(1, 0)
	var offset := Vector2(10, 15)
	check(level.apply_edit(cell, -1, offset), "Fixture places a tree through the real inventory edit")
	if level.tree_nodes.is_empty():
		quit(1)
		return
	var first: Texture2D = level.tree_nodes[0].texture
	check(first is ImageTexture, "Fixture needs a generated edge-clipped texture")
	var pixels := first.get_image().get_data()
	level.rebuild_decorations()
	check(level.tree_nodes[0].texture == first, "Unchanged inventory rebuild reuses the clipped tree texture")
	check(level.tree_nodes[0].texture.get_image().get_data() == pixels, "Rebuild retains every displayed pixel")
	level.undo()
	check(not level.layout.trees.has(cell), "Real undo removes the placement")
	check(level.apply_edit(cell, -1, offset), "Placement remains valid after undo")
	check(level.tree_nodes[0].texture == first, "Undo and re-placement reuse the original clipped texture")
	check(level.tree_nodes[0].texture.get_image().get_data() == pixels, "Undo and re-placement retain every pixel")
	var parity_cases := 0
	for kind in Art.TEXTURES:
		for stump in [false, true]:
			for position in [Vector2.ZERO, Vector2(10, 15), Vector2(-14, 28)]:
				for ground in [{Vector2i.ZERO: true}, {Vector2i.ZERO: true, Vector2i.RIGHT: true}, {Vector2i.ZERO: true, Vector2i.DOWN: true}]:
					var expected: Texture2D = Art._create_texture(position, kind, stump, ground)
					var actual: Texture2D = Art.texture_at(position, kind, stump, ground)
					check(actual.get_image().get_data() == expected.get_image().get_data(), "Cached texture retains original clipping for %s/%s/%s" % [kind, stump, position])
					check(Art.texture_at(position, kind, stump, ground) == actual, "Repeated exact inputs reuse the texture")
					parity_cases += 1
	Art.clear_texture_cache()
	var connected := {Vector2i.ZERO: true, Vector2i.RIGHT: true}
	var reversed := {Vector2i.RIGHT: false, Vector2i.ZERO: false}
	var edge_offset := Vector2(14, 28)
	var shared: Texture2D = Art.texture_at(edge_offset, "tree", false, connected)
	check(Art.texture_at(edge_offset, "tree", false, reversed) == shared, "Receiving-cell order and unused values do not change clipping")
	var isolated: Texture2D = Art.texture_at(edge_offset)
	check(shared.get_image().get_data() != isolated.get_image().get_data(), "Terrain change really changes the clipped shadow")
	check(Art.texture_at(edge_offset, "tree", false, connected) == shared, "Restoring neighboring grass reuses the correct previous texture")
	check(Art.texture_at(edge_offset + Vector2(0.01, 0)) != isolated, "Free-position offsets are not rounded in the cache key")
	Art.clear_texture_cache()
	var oldest: Texture2D = Art.texture_at(offset)
	# More than the capacity of generated atlases exercises both eviction bounds.
	for i in 40:
		Art.texture_at(Vector2(10 + i * 0.01, 15))
		check(Art._texture_cache_bytes <= Art.MAX_CACHED_TEXTURE_BYTES, "Generated texels stay within the memory budget")
		check(Art._texture_cache.size() <= Art.MAX_CACHED_TEXTURES, "Retained textures stay within the entry budget")
	check(Art.texture_at(offset) != oldest, "Oldest unused generated texture is evicted")
	var recent: Texture2D = Art.texture_at(offset)
	for i in 40:
		Art.texture_at(Vector2(11 + i * 0.01, 15))
		check(Art.texture_at(offset) == recent, "Frequently reused texture survives eviction")
	Art.TEXTURES.tree.emit_changed()
	check(not Art.sources.has("tree") and not Art.shadows.has("tree"), "Source artwork change invalidates derived CPU images")
	check(Art._texture_cache.is_empty() and Art._texture_cache_bytes == 0, "Source artwork change invalidates cached textures")
	var refreshed: Texture2D = Art.texture_at(offset)
	check(refreshed != recent and refreshed.get_image().get_data() == pixels, "Artwork invalidation recreates an identical clipped texture")
	print("Tree cache parity: %d cases; terrain changes, exact offsets, LRU bounds and artwork invalidation checked" % parity_cases)
	print("Tree texture inventory reuse: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
