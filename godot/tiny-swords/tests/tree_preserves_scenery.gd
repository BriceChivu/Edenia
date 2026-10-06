extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	for kind in ["bush", "land_rock", "foliage"]:
		var layout := Layout.new()
		layout.unlock(2)
		layout.unlock(3)
		var cell := Vector2i(1, 0)
		if kind == "foliage":
			layout.flora[cell] = 1
		else:
			layout.decorations[cell] = {"kind": kind, "variant": 1}
		var before: Dictionary = layout.decorations.duplicate(true)
		var before_flora: Dictionary = layout.flora.duplicate(true)
		check(layout.edit(cell, "tree", Layout.HOME), "Can plant on %s grass" % kind)
		check(layout.decorations == before and layout.flora == before_flora, "Planting preserves %s and foliage" % kind)
		var restored := Layout.new()
		check(restored.restore(JSON.parse_string(JSON.stringify(layout.snapshot()))), "Coexisting tree and scenery restore")
		check(restored.decorations == before and restored.flora == before_flora, "Save/load preserves %s and foliage" % kind)
		check(layout.edit(cell, "remove", Layout.HOME), "Can pick up planted tree")
		check(layout.decorations == before and layout.flora == before_flora, "Pickup preserves %s and foliage" % kind)
	print("Tree preserves scenery: %s" % ("PASS" if failures == 0 else "FAIL (%d)" % failures))
	quit(0 if failures == 0 else 1)
