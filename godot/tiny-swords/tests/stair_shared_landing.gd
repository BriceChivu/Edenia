extends SceneTree

class PreviewProbe extends "res://scripts/terrain_view.gd":
	var ramp_direction := Vector2i.ZERO
	func draw_tile(cell: Vector2i, kind: String, _tint := Color.WHITE, _height: float = -1) -> void:
		if kind == "stairs":
			ramp_direction = layout.stair_direction(cell)
	func _draw() -> void:
		draw_editor()

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var level = load("res://previews/level_three.tscn").instantiate()
	root.add_child(level)
	await process_frame
	level.set_process(false)
	level.pawn.set_physics_process(false)
	var layout = level.layout
	var failures := 0
	for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
		layout = load("res://scripts/terrain_layout.gd").new()
		layout.unlock(2)
		layout.unlock(3)
		# Two flat approaches meet the same bundled upper landing.
		var first := Vector2i(2, 0) if direction == Vector2i.RIGHT else Vector2i(-1, 0)
		var second: Vector2i = first + direction * 2
		var landing: Vector2i = first + direction
		layout.edit(second, "ground", Vector2i.ZERO, 0)
		layout.edit(second + direction, "ground", Vector2i.ZERO, 0)
		layout.edit(first, "stairs", Vector2i.ZERO)
		level.layout = layout
		level.terrain.layout = layout
		level.rebuild_decorations()
		await process_frame
		level.editing = true
		level.selected = "stairs"
		var point: Vector2 = layout.center(second)
		var target: Vector2i = level.clicked_cell(point)
		if target != second or layout.available_stair_direction(target) != -direction or not layout.can_edit(target, "stairs", Vector2i.ZERO):
			push_error("Hover must offer stairs rising from the opposite approach into the existing upper landing")
			failures += 1
			continue
		var view := PreviewProbe.new()
		view.layout = layout
		view.editing = true
		view.valid = true
		view.tool = "stairs"
		view.hover = target
		view.preview_position = point
		var before: Dictionary = layout.snapshot().duplicate(true)
		root.add_child(view)
		await process_frame
		await process_frame
		assert(view.ramp_direction == -direction, "Rendered hover preview rises from the opposite side")
		assert(layout.snapshot() == before, "Hover preserves live terrain and inventory")
		view.free()
		var ground_before: int = layout.ground_count()
		assert(not layout.can_edit(target, "stairs", landing), "An occupied landing stays protected")
		level.pawn.position = layout.center(Vector2i.ZERO)
		assert(level.apply_edit(target))
		level.undo()
		assert(layout.snapshot() == before, "Undo restores terrain, ownership and inventory")
		assert(level.apply_edit(target))
		assert(layout.stair_direction(second) == -direction)
		assert(layout.ground_count() == ground_before + 1, "Only the replaced ramp ground is refunded")
		assert(layout.restore(JSON.parse_string(JSON.stringify(layout.snapshot()))), "Shared landing survives persistence")
		assert(layout.can_cross(first, landing) and layout.can_cross(second, landing))
		assert(layout.edit(second, "remove", Vector2i.ZERO), "Either shared ramp can be picked up")
		assert(layout.cells.has(landing) and layout.can_cross(first, landing), "Remaining ramp retains its landing")
		assert(layout.restore(layout.snapshot()), "Inventory remains conserved after pickup")
		assert(layout.edit(first, "remove", Vector2i.ZERO))
		assert(not layout.cells.has(landing), "Last ramp pickup collects the landing")
		assert(layout.restore(layout.snapshot()))
		level.rebuild_decorations()
		await process_frame
	print("Shared stair landing: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
