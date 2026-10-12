extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
var failures: Array[String] = []

func _init() -> void:
	var contract = preload("res://scripts/sync_contract.gd")
	var manifest = JSON.parse_string(FileAccess.get_file_as_string("res://sync_contract.json"))
	check(manifest is Dictionary and manifest.size() == 2 and int(manifest.get("version", -1)) == contract.DECLARATION.version and JSON.stringify(manifest.get("ambient_arrays")) == JSON.stringify(contract.DECLARATION.ambient_arrays), "Edenia manifest must match the native Godot declaration")
	var layout := Layout.new()
	var first: Dictionary = layout.snapshot()
	layout.chickens = [Vector2(32, 32)]
	var placed: Dictionary = layout.snapshot()
	check(first.sync_semantics.sha256 != placed.sync_semantics.sha256, "Animal ownership affects sync identity")
	layout.chickens[0] = Vector2(96, 32)
	check(layout.snapshot().sync_semantics == placed.sync_semantics, "Ambient movement does not create gameplay divergence")
	layout.stock.chicken += 1
	check(layout.snapshot().sync_semantics != placed.sync_semantics, "Inventory and animal positions are not interchangeable")
	var current: Dictionary = layout.snapshot()
	layout.stock.chicken -= 1
	layout.resources.wood += 1
	check(layout.snapshot().sync_semantics != current.sync_semantics, "Resource changes remain meaningful")
	if failures.is_empty(): print("Tiny Swords sync semantics passed")
	quit(0 if failures.is_empty() else 1)

func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)
