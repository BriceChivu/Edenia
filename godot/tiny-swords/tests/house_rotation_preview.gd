extends SceneTree

const Art = preload("res://scripts/level_five_art.gd")
class OutlineProbe extends "res://scripts/terrain_view.gd":
	var area := Rect2(32, 32, 128, 192)
	func _draw() -> void:
		draw_art_outline(Art.HOUSE_TEXTURES[3], area, Rect2i(), true)

class HouseProbe extends "res://scripts/terrain_view.gd":
	func _draw() -> void:
		draw_editor()

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func render_probe(node: Node2D) -> Image:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(384, 320)
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	viewport.add_child(node)
	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	var pixels := viewport.get_texture().get_image()
	viewport.queue_free()
	await process_frame
	return pixels

func check_mirrored_render() -> void:
	var layout = preload("res://scripts/terrain_layout.gd").new()
	layout.unlock(2)
	var reference := Sprite2D.new()
	reference.texture = preload("res://scripts/inventory_outline.gd").texture_for(Art.HOUSE_TEXTURES[3], Rect2i(0, 0, 128, 192))
	reference.centered = false
	reference.flip_h = true
	reference.position = Vector2(30, 30)
	reference.modulate = preload("res://scripts/inventory_outline.gd").COLOR
	var expected_border: Image = await render_probe(reference)
	var outline := OutlineProbe.new()
	outline.layout = layout
	var actual_border: Image = await render_probe(outline)
	check(actual_border.get_used_rect() == expected_border.get_used_rect(), "Mirrored house outline stays around the house instead of shifting right: actual=%s expected=%s" % [actual_border.get_used_rect(), expected_border.get_used_rect()])
	var house := Sprite2D.new()
	house.texture = Art.HOUSE_TEXTURES[3]
	house.centered = false
	house.flip_h = true
	house.position = Vector2(32, 32)
	var expected_house: Image = await render_probe(house)
	var cell := Vector2i(-7, -1)
	layout.houses[cell] = 2 # Hover previews the mirrored side (facing 3).
	var preview := HouseProbe.new()
	preview.layout = layout
	preview.position = Vector2(32, 32) - Art.house_rect(layout, cell).position
	preview.editing = true
	preview.valid = true
	preview.tool = "house"
	preview.hover = cell
	preview.transform_preview = true
	preview.preview_position = layout.center(cell)
	var actual_house: Image = await render_probe(preview)
	var mismatched := 0
	for y in range(32, 224):
		for x in range(32, 160):
			var expected := expected_house.get_pixel(x, y)
			if expected.a > 0.99 and expected != actual_house.get_pixel(x, y):
				mismatched += 1
	check(mismatched == 0, "Mirrored house hover artwork stays at its placed anchor (%s mismatched opaque pixels)" % mismatched)
	var folder := ProjectSettings.globalize_path("res://../../output")
	DirAccess.make_dir_recursive_absolute(folder)
	actual_house.save_png(folder.path_join("house-mirrored-preview.png"))
	actual_border.save_png(folder.path_join("house-mirrored-outline.png"))

func run() -> void:
	var scene = preload("res://previews/level_five.tscn").instantiate()
	scene.camera_save_enabled = false
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene.pawn.set_physics_process(false)
	scene.editing = true
	scene.selected = "house"
	var cell := Vector2i(1, 1)
	for elevation in [0, 64]:
		scene.layout.elevations[cell] = elevation
		var expected := Art.house_rect(scene.layout, cell)
		for facing in 4:
			scene.layout.houses[cell] = facing
			for offset in [Vector2(32, 48), Vector2(96, 128), Vector2(64, 80)]:
				var point: Vector2 = expected.position + offset
				scene.terrain.hover = scene.clicked_cell(point)
				scene.terrain.preview_position = point
				check(scene.terrain.hover == cell, "Pointer selects the existing house")
				check(scene.terrain.house_preview_rect() == expected, "Rotation preview stays at the house regardless of pointer position")
	# New construction still follows the pointer.
	scene.layout.houses.clear()
	scene.terrain.hover = cell
	scene.terrain.preview_position = scene.layout.center(cell) - Vector2(0, scene.layout.height_at(cell)) + Vector2(12, 9)
	check(scene.terrain.house_preview_rect().position == Art.house_rect(scene.layout, cell).position + Vector2(12, 9), "New house preview follows the pointer")
	scene.queue_free()
	await process_frame
	if "--render" in OS.get_cmdline_user_args():
		await check_mirrored_render()
	print("House rotation preview checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
