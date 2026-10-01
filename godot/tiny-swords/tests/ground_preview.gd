extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")

class PreviewProbe extends "res://scripts/terrain_view.gd":
	var rendered: Dictionary = {}
	func draw_tile(cell: Vector2i, kind: String, _tint := Color.WHITE, preview_height: float = -1) -> void:
		var height: float = preview_height if preview_height >= 0 else layout.height_at(cell)
		rendered = {"cell": cell, "height": height, "palette": layout.palette_at_height(height), "grass": ground_region(cell, kind), "cliff": cliff_region(cell, height), "sides": cliff_grass_sides(cell, height), "backing": ground_backing_regions(cell, height - 64)}
	func _draw() -> void:
		draw_editor()

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var failures := 0
	for continuation in [false, true]:
		for height in [64, 128]:
			if continuation and height == 128:
				continue
			var l = Layout.new()
			l.unlock(2)
			l.unlock(3)
			var target := Vector2i(1, 0)
			var source := target + Vector2i.UP if continuation else target
			l.cells = {Vector2i.ZERO: l.kind_at_height(height), Vector2i.DOWN: l.kind_at_height(height - 64), Vector2i(1, 1): l.kind_at_height(height - 64), source: l.kind_at_height(height - 64)}
			l.elevations = {Vector2i.ZERO: height, Vector2i.DOWN: height - 64, Vector2i(1, 1): height - 64, source: height - 64}
			l.trees.clear()
			l.flora.clear()
			l.decorations.clear()
			l.manual_ground_elevation = true
			if continuation:
				l.cells[Vector2i.ZERO] = l.kind_at_height(height + 64)
				l.elevations[Vector2i.ZERO] = height + 64
				for cell in [Vector2i.DOWN, Vector2i(1, 1)]:
					l.cells[cell] = l.kind_at_height(height)
					l.elevations[cell] = height
			var before: Dictionary = l.snapshot().duplicate(true)
			var view := PreviewProbe.new()
			view.layout = l
			view.editing = true
			view.valid = true
			view.tool = "ground"
			view.hover = source
			view.ground_preview_height = height
			view.preview_position = l.center(source) - Vector2(0, height - 64)
			root.add_child(view)
			await process_frame
			await process_frame
			var preview: Dictionary = view.rendered.duplicate(true)
			if l.snapshot() != before or view.layout != l:
				push_error("Ground preview changed the live layout")
				failures += 1
			if not l.edit(source, "ground", Vector2i.DOWN, height):
				push_error("Fixture must be a valid grass elevation")
				failures += 1
				view.free()
				continue
			view.draw_tile(target, l.cells[target])
			if preview != view.rendered:
				push_error("Ground preview differs from built tile (continuation=%s height=%s): preview=%s built=%s" % [continuation, height, preview, view.rendered])
				failures += 1
			view.free()
	print("Ground preview: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
