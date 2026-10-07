extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const TerrainView = preload("res://scripts/terrain_view.gd")

class Boundary extends Node2D:
	func _draw() -> void:
		draw_rect(Rect2(116, 218, 384, 192), Color(1, 0.12, 0.12, 0.12))
		draw_rect(Rect2(116, 218, 384, 192), Color(1, 0.15, 0.15), false, 3)

func label_at(text: String, point: Vector2, width: float) -> void:
	var label := Label.new()
	label.text = text
	label.position = point
	label.size.x = width
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	root.add_child(label)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_size = Vector2i.ZERO
	root.size = Vector2i(616, 528)
	var l = Layout.new()
	l.cells = {Vector2i.ZERO: "stairs", Vector2i.RIGHT: "high_gold"}
	l.elevations = {Vector2i.ZERO: 0, Vector2i.RIGHT: 64}
	l.stair_directions = {Vector2i.ZERO: Vector2i.RIGHT}
	l.flora.clear()
	l.decorations.clear()
	var view := TerrainView.new()
	view.layout = l
	view.scale = Vector2.ONE * 3
	view.position = Vector2(116, 218) - Layout.ORIGIN * 3
	root.add_child(view)
	for cell in l.cells:
		var surface := TerrainView.new()
		surface.layout = l
		surface.piece = cell
		view.add_child(surface)
	root.add_child(Boundary.new())
	label_at("Staircase + landing: solid ground contact", Vector2(30, 24), 556)
	label_at("Upper surface", Vector2(336, 138), 220)
	label_at("SOLID BASE", Vector2(302, 315), 230)
	label_at("Red area excludes every lower-floor contact: feet, roots, and object bases.", Vector2(30, 448), 556)
	await process_frame
	await process_frame
	RenderingServer.force_draw()
	var destination := "res://../../docs/experiments/tiny-swords/stair-floor-2026-10-07/solid-contact.png"
	root.get_texture().get_image().save_png(destination)
	print("Captured solid ground contact: ", destination)
	quit()
