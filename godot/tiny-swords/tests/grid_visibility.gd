extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const View = preload("res://scripts/terrain_view.gd")

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(2400, 1800)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var layout = Layout.new()
	var view = View.new()
	view.layout = layout
	view.editing = true
	view.editor_source = view
	viewport.add_child(view)
	var failures := 0
	for zoom in [0.5, 0.731, 0.915]:
		for offset in [0.0, 0.25, 0.5, 0.75]:
			view.scale = Vector2.ONE * zoom
			view.position = Vector2(40 + offset, 30 + offset) - (layout.ORIGIN + Vector2(layout.MIN_CELL) * 64) * zoom
			view.queue_redraw()
			await process_frame
			await RenderingServer.frame_post_draw
			var pixels := viewport.get_texture().get_image()
			var sample_y := int(30 + offset + 32 * zoom)
			var background := pixels.get_pixel(5, sample_y)
			for column in range(layout.MAX_CELL.x - layout.MIN_CELL.x + 2):
				var x := int(floor(40 + offset + column * 64 * zoom))
				var visible := false
				for dx in range(-1, 2):
					if pixels.get_pixel(x + dx, sample_y).g > background.g + 0.015:
						visible = true
				if not visible:
					failures += 1
					print("Missing grid boundary: zoom=", zoom, " offset=", offset, " column=", column)
			var sample_x := int(40 + offset + 32 * zoom)
			for row in range(layout.MAX_CELL.y - layout.MIN_CELL.y + 2):
				var y := int(floor(30 + offset + row * 64 * zoom))
				var visible := false
				for dy in range(-1, 2):
					if pixels.get_pixel(sample_x, y + dy).g > background.g + 0.015:
						visible = true
				if not visible:
					failures += 1
					print("Missing grid boundary: zoom=", zoom, " offset=", offset, " row=", row)
	print("Grid visibility: ", "PASS" if failures == 0 else "FAIL", " (", failures, " missing boundaries)")
	quit(0 if failures == 0 else 1)
