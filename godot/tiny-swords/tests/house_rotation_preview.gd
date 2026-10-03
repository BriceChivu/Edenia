extends SceneTree

const Art = preload("res://scripts/level_five_art.gd")
var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

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
	print("House rotation preview checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
