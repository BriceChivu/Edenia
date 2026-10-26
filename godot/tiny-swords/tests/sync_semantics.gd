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
	var owned := Layout.new()
	for target in range(2, 9): owned.unlock(target)
	owned.flora.clear()
	owned.decorations.clear()
	owned.sheep.assign([owned.safe_ground_point(Vector2i(1, 0), true)])
	owned.stock.sheep -= 1
	owned.sheep_chickens = {0: 20000}
	owned.chicken_release_at = 100.0
	owned.stock.chicken -= 2
	var durable: Dictionary = owned.snapshot()
	check(durable.version == 38 and not durable.has("chickens") and not durable.has("sheep"), "Durable snapshots contain ownership counts without cosmetic coordinates")
	var restored := Layout.new()
	check(restored.restore(durable) and restored.sheep.size() == 1 and restored.sheep_chickens == owned.sheep_chickens and restored.chicken_release_at == 100.0 and restored.chickens.is_empty(), "Count restoration preserves perched and carried birds without releasing or duplicating them")
	check(restored.walkable_point(restored.sheep[0], true) and restored.terrain_feet_free(restored.sheep[0], true, preload("res://scripts/animal_contact.gd").SHEEP), "Godot derives a valid sheep contact from saved terrain")
	var legacy: Dictionary = preload("res://tests/legacy_snapshot.gd").capture(owned)
	legacy.version = 37
	check(restored.restore(legacy) and restored.sheep_chickens == owned.sheep_chickens and restored.sheep.size() == 1, "Old position-bearing snapshots retain all owned animals and passengers")
	var roundtrip: Dictionary = restored.snapshot()
	check(restored.restore(roundtrip) and restored.snapshot() == roundtrip, "New durable snapshots reload independently of cloud transport")
	durable.sheep_count += 1
	check(not Layout.new().restore(durable), "Counts cannot duplicate earned sheep")
	durable.sheep_count = -1
	check(not Layout.new().restore(durable), "Negative animal counts are rejected")
	if failures.is_empty(): print("Tiny Swords sync semantics passed")
	quit(0 if failures.is_empty() else 1)

func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)
