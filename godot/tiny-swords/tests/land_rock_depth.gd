extends SceneTree

var failures := 0

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	var scene = load("res://previews/level_three.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	var cell := Vector2i(0, 1)
	scene.layout.flora.clear()
	for height in [0, 64, 128]:
		scene.layout.elevations[cell] = height
		for variant in range(1, 5):
			scene.layout.decorations = {cell: {"kind": "land_rock", "variant": variant}}
			scene.rebuild_decorations()
			var rock: Sprite2D = scene.flora_nodes[0]
			var center: Vector2 = scene.layout.center(cell)
			scene.pawn.position = center
			scene.pawn.z_index = int(height / 64.0)
			check(rock.get_parent() == scene.pawn.get_parent() and rock.get_parent().y_sort_enabled and rock.z_index == scene.pawn.z_index, "Grass rocks share pawn depth sorting at every elevation")
			check(rock.position.y > scene.pawn.position.y, "Grass rock covers a pawn standing at its tile center")
			scene.pawn.position.y = center.y + 20
			check(rock.position.y < scene.pawn.position.y, "Pawn draws in front after walking past the rock")
			check(rock.position + rock.offset * rock.scale == center - Vector2(0, height), "Rock depth anchor keeps its artwork in place")
			await process_frame
	scene.queue_free()
	await process_frame
	print("Land rock depth checks: ", "PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
