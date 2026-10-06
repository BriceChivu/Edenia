extends SceneTree

class PreviewProbe extends "res://scripts/terrain_view.gd":
	var regions: Dictionary = {}
	func draw_tile(cell: Vector2i, kind: String, _tint := Color.WHITE, _preview_height: float = -1) -> void:
		if kind.begins_with("high_"):
			regions[cell] = [ground_region(cell, kind), cliff_region(cell)]
	func _draw() -> void:
		draw_editor()

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var failures := 0
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		for replace_grass in [false, true]:
			var l = load("res://scripts/terrain_layout.gd").new()
			l.unlock()
			var ramp := Vector2i(1, 0)
			var landing: Vector2i = ramp + direction
			l.cells = {ramp - direction: "meadow"}
			if replace_grass:
				l.cells[ramp] = "meadow"
				l.cells[landing] = "meadow"
				if direction == Vector2i.LEFT:
					l.cells[landing] = "high_gold"
					l.elevations[landing] = 64
			var before: Dictionary = l.snapshot().duplicate(true)
			var view := PreviewProbe.new()
			view.layout = l
			view.editing = true
			view.valid = true
			view.tool = "stairs"
			view.hover = ramp
			view.preview_position = l.center(ramp) + Vector2(7, 3)
			root.add_child(view)
			await process_frame
			await process_frame
			var preview: Array = view.regions.get(landing, [])
			if l.snapshot() != before:
				push_error("Stair preview changed the live layout")
				failures += 1
			l.edit(ramp, "stairs", Vector2i(10, 5))
			var placed := [view.ground_region(landing, l.cells[landing]), view.cliff_region(landing)]
			if preview != placed:
				push_error("Stair preview must join its bundled landing like placement (%s, replacement=%s): preview=%s placed=%s" % [direction, replace_grass, preview, placed])
				failures += 1
			view.free()
	print("Stair bundle preview: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
