extends Node

# A separate main scene: the study bridge and its startup/save path never run.
const Layout = preload("res://scripts/terrain_layout.gd")
const Island = preload("res://scenes/conflict_island.tscn")
const TreeArt = preload("res://scripts/tree_art.gd")
const HouseArt = preload("res://scripts/level_five_art.gd")
var started := false

static func requested() -> bool:
	return OS.has_feature("web") and bool(JavaScriptBridge.eval("window.edeniaConflictPreviewMode === true"))

func _ready() -> void:
	get_window().content_scale_size = Vector2i(800, 480)
	get_window().size = Vector2i(800, 480)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("parent.postMessage({type:'edenia-conflict-preview-ready'},location.origin)")

func _process(_delta: float) -> void:
	if started or not OS.has_feature("web"):
		return
	var json = JavaScriptBridge.eval("window.edeniaConflictLayouts ? JSON.stringify(window.edeniaConflictLayouts) : null")
	if not json is String:
		return
	started = true
	set_process(false)
	var layouts = JSON.parse_string(json)
	if layouts is Array and layouts.size() == 2:
		capture_pair(layouts)

func capture_pair(snapshots: Array) -> void:
	var accepted: Array = []
	var bounds := Rect2()
	var first := true
	for snapshot in snapshots:
		var layout = Layout.new()
		var valid: bool = snapshot is Dictionary and layout.restore(snapshot.duplicate(true))
		accepted.append(valid)
		if not valid:
			continue
		for cell in layout.cells:
			var center: Vector2 = layout.center(cell)
			for point in [center + Vector2(-40, -layout.height_at(cell) - 180), center + Vector2(40, 55)]:
				if first:
					bounds = Rect2(point, Vector2.ZERO)
					first = false
				else:
					bounds = bounds.expand(point)
		# Include the full canonical artwork, especially tall trees planted on
		# the northern edge. Terrain-only framing could crop their canopies.
		for cell in layout.trees:
			var kind: String = layout.tree_types.get(cell, "tree")
			var size := TreeArt.frame_size(kind) * TreeArt.SCALE
			var anchor: Vector2 = layout.tree_position(cell) - Vector2(0, layout.height_at(cell))
			var area := Rect2(anchor + TreeArt.art_offset(kind) * TreeArt.SCALE - size / 2, size)
			bounds = bounds.merge(area)
		for cell in layout.houses:
			bounds = bounds.merge(HouseArt.house_rect(layout, cell))
	var island = Island.instantiate()
	add_child(island)
	var zoom := minf(760.0 / maxf(1, bounds.size.x), 440.0 / maxf(1, bounds.size.y))
	for index in range(2):
		if not accepted[index] or not island.capture_restore(snapshots[index]):
			report(index, "unavailable", "")
			continue
		island.game_camera.position = bounds.get_center()
		island.game_camera.zoom = Vector2.ONE * zoom
		# Draw the restored, frozen world before copying pixels. No simulation tick
		# is needed, and both images retain identical complete-island framing.
		for frame in range(3):
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		report(index, "ready", Marshalls.raw_to_base64(image.save_png_to_buffer()))
	island.queue_free()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.edeniaConflictLayouts=null;parent.postMessage({type:'edenia-conflict-preview-done',session:window.edeniaConflictPreviewSession},location.origin)")

func report(index: int, status: String, pixels: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("parent.postMessage({type:'edenia-conflict-preview-image',session:window.edeniaConflictPreviewSession,index:%s,status:%s,pixels:%s},location.origin)" % [index, JSON.stringify(status), JSON.stringify(pixels)])
