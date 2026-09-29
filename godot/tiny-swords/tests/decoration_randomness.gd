extends SceneTree
const Layout = preload("res://scripts/terrain_layout.gd")
const Rules = preload("res://scripts/decoration_rules.gd")
var failures := 0
class Rolls:
	extends RefCounted
	var values: Array = []
	var ranges: Array = []
	func randi_range(low: int, high: int) -> int:
		ranges.append([low, high])
		return values.pop_front()
func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var kinds := ["flowers", "bush", "land_rock", "water_rock", "ducks"]
	# All combinations of successful independent rolls; every tied winner.
	for mask in range(32):
		var winners: Array = []
		var rolls: Array = []
		for i in range(5):
			rolls.append(1 if mask & (1 << i) else 2)
			if mask & (1 << i): winners.append(kinds[i])
		for winner in range(maxi(1, winners.size())):
			var rng := Rolls.new()
			rng.values = rolls.duplicate()
			if not winners.is_empty(): rng.values.append(winner)
			check(Rules.choose(rng,true,false) == ("" if winners.is_empty() else winners[winner]), "Only one successful candidate wins, chosen uniformly")
			check(rng.ranges.slice(0,5) == [[1,15],[1,15],[1,15],[1,15],[1,50]], "Exact independent odds for all five categories")
	var blocked := Rolls.new()
	blocked.values = [2,2,2]
	check(Rules.choose(blocked,false,false) == "" and blocked.ranges.size() == 3, "No water rolls without nearby water")
	blocked.values = [2,2,2,2]
	blocked.ranges.clear()
	check(Rules.choose(blocked,true,true) == "" and blocked.ranges.size() == 4, "Existing ducks disable the duck roll")
	var layout := Layout.new()
	layout.unlock()
	layout.unlock(3)
	layout.flora_rng.seed = 713
	var outcomes := {}
	var empty := 0
	var cell := Vector2i(-2,-1)
	for i in range(2000):
		check(layout.edit(cell,"ground",Vector2i.ZERO), "Place grass")
		if layout.decorations.has(cell):
			var item: Dictionary = layout.decorations[cell]
			outcomes[item.kind] = true
			check(not layout.flora.has(cell), "At most one decoration per tile")
			if item.kind in Rules.WATER_KINDS:
				check(layout.clear_water(item.water) and (item.water-cell) in layout.STEPS, "Water decorations sit in adjacent clear water")
			var copy := Layout.new()
			check(copy.restore(JSON.parse_string(JSON.stringify(layout.snapshot()))) and copy.decorations == layout.decorations, "Decoration type, variant, water location persist without reroll")
		else:
			empty += 1
		check(layout.edit(cell,"remove",Vector2i.ZERO) and not layout.decorations.has(cell), "Pickup removes the tile's decoration")
	check(outcomes.size() == 5 and empty > 1000, "All outcomes occur and most placements stay bare")
	# A duck set remains unique across placements and save/undo restoration.
	layout.edit(cell,"ground",Vector2i.ZERO)
	layout.flora.erase(cell)
	layout.decorations[cell] = {"kind":"ducks","variant":1,"water":cell+Vector2i.LEFT}
	var saved := layout.snapshot()
	for i in range(300):
		layout.edit(Vector2i(5,0),"ground",Vector2i.ZERO)
		check(layout.decorations.values().filter(func(item):return item.kind == "ducks").size() == 1, "Only one duck set exists")
		layout.edit(Vector2i(5,0),"remove",Vector2i.ZERO)
	check(layout.restore(saved) and layout.has_ducks(), "Undo/save restores the existing duck set")
	layout.edit(cell+Vector2i.LEFT,"ground",Vector2i.ZERO)
	check(not layout.has_ducks(), "Building over the water removes the covered duck set")
	check(layout.restore(saved) and layout.has_ducks(), "Undo restores ducks with the water")
	var invalid: Dictionary = saved.duplicate(true)
	invalid.decorations.append([1,0,"ducks",1,2,0])
	for tile in invalid.tiles:
		if tile[0] == 1 and tile[1] == 0:
			tile[5] = 0
	check(not layout.restore(invalid) and layout.snapshot() == saved, "Duplicate duck saves are rejected without changing the current island")
	var legacy: Dictionary = saved.duplicate(true)
	legacy.version = 6
	legacy.erase("decorations")
	var migrated := Layout.new()
	check(migrated.restore(legacy) and migrated.decorations.is_empty() and migrated.cells == layout.cells, "Older islands load without retroactive rolls")
	layout.cells[cell+Vector2i.UP] = "high_gold"
	check(not layout.clear_water(cell+Vector2i(0,-2)), "Do not place water decorations over raised top artwork")
	var scene = load("res://previews/level_three.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.layout.flora.clear()
	scene.layout.decorations = {
		Vector2i(0,0): {"kind":"flowers","variant":1},
		Vector2i(1,0): {"kind":"bush","variant":2},
		Vector2i(0,1): {"kind":"land_rock","variant":2},
		Vector2i(1,1): {"kind":"water_rock","variant":3,"water":Vector2i(2,1)},
		Vector2i(3,2): {"kind":"ducks","variant":1,"water":Vector2i(4,2)}
	}
	scene.rebuild_decorations()
	var rendered := 0
	for sprite in scene.flora_nodes:
		if not sprite.has_meta("random_decoration"):
			continue
		rendered += 1
		check(sprite.texture != null, "Every decoration resolves an asset")
		if sprite.get_meta("random_decoration") == "ducks":
			check(sprite.hframes == 3 and sprite.texture.get_width() / sprite.hframes == 32, "Duck sheet renders one animated duck, not three animation frames side by side")
	check(rendered == 5, "All five categories render")
	scene.queue_free()
	await process_frame
	print("Decoration randomness checks: ","PASS" if failures == 0 else "FAIL")
	quit(0 if failures == 0 else 1)
