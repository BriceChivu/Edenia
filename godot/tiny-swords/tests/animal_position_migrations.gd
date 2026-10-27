extends SceneTree

const Layout = preload("res://scripts/terrain_layout.gd")
const Contacts = preload("res://scripts/animal_contact.gd")
var failures: Array[String] = []

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	# Captured with the released tree-chicken v39 writer, not a current snapshot
	# with only its version changed. It owns one ground, tree, sheep and carried bird.
	var legacy: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/tree-animal-v39.json"))
	check(legacy.version == 39 and legacy.chicken_count == 1 and legacy.sheep_count == 1 and not legacy.has("chickens") and not legacy.has("sheep"), "Released version39 fixture contains counts and tree ownership")
	var restored := Layout.new()
	var accepted: bool = restored.restore(legacy)
	check(accepted, "Released count-only version39 restores before upgrading positions")
	if accepted:
		check(restored.tree_chickens == {Vector2i(1, 1): true} and restored.sheep_chickens == {0: 20000} and restored.chicken_release_at == 160.0, "Tree, sheep and carried birds retain their distinct ownership")
		check(restored.sheep.size() == 1 and restored.chickens.size() == 1 and restored.stock.chicken == 0, "Migration conserves all four earned chickens and ground sheep")
		check(restored.walkable_point(restored.sheep[0], true) and restored.terrain_feet_free(restored.sheep[0], true, Contacts.SHEEP), "Count-only sheep derives a safe contact")
		check(restored.walkable_point(restored.chickens[0], true) and restored.terrain_feet_free(restored.chickens[0], true, Contacts.CHICKEN), "Count-only chicken derives a safe contact")
		restored.sheep[0] += Vector2(8.125, 0)
		restored.chickens[0] += Vector2(0, 8.5)
		var upgraded: Dictionary = restored.snapshot()
		check(upgraded.version == 40 and upgraded.has("chickens") and upgraded.has("sheep") and not upgraded.has("chicken_count") and not upgraded.has("sheep_count"), "Version40 upgrades to one exact position representation")
		var roundtrip := Layout.new()
		check(roundtrip.restore(JSON.parse_string(JSON.stringify(upgraded))) and roundtrip.sheep == restored.sheep and roundtrip.chickens == restored.chickens, "Upgraded safe fractional positions survive JSON save and reload")
		check(roundtrip.tree_chickens == restored.tree_chickens and roundtrip.sheep_chickens == restored.sheep_chickens and roundtrip.chicken_release_at == restored.chicken_release_at and roundtrip.stock == restored.stock, "Position roundtrip retains every passenger, timer and inventory count")
		var before_tree: Dictionary = restored.snapshot()
		restored.tree_chickens.clear()
		restored.stock.chicken += 1
		check(restored.snapshot().sync_semantics.sha256 != before_tree.sync_semantics.sha256, "Tree-chicken ownership remains meaningful rather than ambient motion")
		upgraded.erase("chickens")
		upgraded.erase("sheep")
		upgraded.chicken_count = 1
		upgraded.sheep_count = 1
		check(not Layout.new().restore(upgraded), "Version40 cannot silently fall back to count-only positions")
	var extra: Dictionary = legacy.duplicate(true)
	extra.sheep = [[999999, 999999]]
	extra.chickens = [[999999, 999999]]
	check(Layout.new().restore(extra), "Version39 continues deriving contacts from counts, not optional foreign arrays")
	legacy.chicken_count += 1
	check(not Layout.new().restore(legacy), "Count-only migration cannot duplicate a tree, sheep or carried chicken")
	print("Animal position migration checks: ", "PASS" if failures.is_empty() else "FAIL")
	quit(0 if failures.is_empty() else 1)
