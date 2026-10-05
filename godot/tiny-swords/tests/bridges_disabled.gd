extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0
func _initialize() -> void:
	run.call_deferred()
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
func run() -> void:
	var level = load("res://previews/bridge_level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	var layout = level.layout
	check(not layout.bridges_enabled and not level.ui.buttons.bridge.visible and level.ui.buttons.bridge.disabled, "Bridge is hidden and disabled at level three")
	check(level.selected == "" and not layout.can_edit(Vector2i(1, 0), "bridge", Vector2i.ZERO), "Dormant sandbox cannot select or place the bridge")
	layout.bridges[Vector2i(1, 0)] = 64.0
	layout.stock.bridge = 0
	var saved: Dictionary = JSON.parse_string(JSON.stringify(layout.snapshot()))
	var restored = Layout.new()
	check(restored.restore(saved) and restored.bridges == layout.bridges, "Inactive placement survives save/load")
	check(restored.path(Vector2i.ZERO, Vector2i(3, 0)).is_empty(), "Inactive bridge does not connect banks")
	level.rebuild_decorations()
	var bridge_visible := false
	for child in level.get_node("World").get_children():
		if child is Sprite2D and child.texture == Layout.BridgeRules.TEXTURE:
			bridge_visible = true
	check(not bridge_visible, "Inactive bridge is absent from world rendering")
	check(Layout.BridgeRules.hit(layout, Vector2(640, 160)) == Vector2i(999, 999), "Inactive bridge does not intercept clicks")
	check(restored.edit(Vector2i(3, 0), "remove", Vector2i.ZERO), "Inactive bridge does not restrict its bank")
	check(restored.bridges.is_empty() and restored.stock.bridge == 1, "Changed supports reclaim the inactive placement")
	check(Layout.new().restore(restored.snapshot()), "Normal editing preserves a reloadable save")
	level.free()
	print("Disabled bridge checks: ", failures, " failures")
	quit(0 if failures == 0 else 1)
