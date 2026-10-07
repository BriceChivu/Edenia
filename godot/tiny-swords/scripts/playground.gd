extends CanvasLayer

const Terrain = preload("res://scripts/playground_terrain.gd")
var world
var root: Control
var panel: PanelContainer
var toggle: Button
var status: Label
var buttons := {}
var checkpoint: Dictionary = {}
var checkpoint_pawn := Vector2.ZERO
var preview_level := 0 # Zero follows the island's highest unlocked level.
var checkpoint_preview_level := 0
var message_key := "testDefault"
var message_params := {}
var title: Label

func _ready() -> void:
	load_checkpoint(world.saved_playground_checkpoint)
	layer = 21
	root = Control.new()
	root.oversampling_with_scale = CanvasItem.OVERSAMPLING_WITH_SCALE_ENABLED
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	toggle = Button.new()
	toggle.text = "Playground"
	toggle.custom_minimum_size = Vector2(116, 30)
	root.add_child(toggle)
	panel = PanelContainer.new()
	root.add_child(panel)
	panel.hide()
	toggle.pressed.connect(func(): panel.visible = not panel.visible)
	var column := VBoxContainer.new()
	panel.add_child(column)
	title = Label.new()
	title.text = "Local game testing"
	column.add_child(title)
	for actions in [["level", "supplies"], ["terrain", "house"], ["checkpoint", "restore"], ["fresh", "previous"]]:
		var row := HBoxContainer.new()
		column.add_child(row)
		for action: String in actions:
			var button := Button.new()
			button.text = {"level": "Level +1", "previous": "Level −1", "supplies": "+ Supplies", "terrain": "Random terrain", "house": "6 house logs", "checkpoint": "Save checkpoint", "restore": "Restore checkpoint", "fresh": "Fresh island"}[action]
			button.custom_minimum_size = Vector2(140, 28)
			button.add_theme_font_size_override("font_size", 14)
			button.pressed.connect(func(): run_action(action))
			row.add_child(button)
			buttons[action] = button
	status = Label.new()
	status.custom_minimum_size = Vector2(280, 48)
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.add_theme_font_size_override("font_size", 13)
	column.add_child(status)
	GameCopy.changed.connect(localize)
	localize()
	get_viewport().size_changed.connect(arrange)
	arrange()

func arrange() -> void:
	# The builder already calculates logical-to-browser-pixel scaling.
	root.scale = Vector2.ONE * world.ui.scale_ui
	var area: Vector2 = get_viewport().get_visible_rect().size / root.scale
	toggle.position = Vector2(area.x - 130, 8)
	panel.position = Vector2(area.x - 298, 42)

func available() -> bool:
	if world.arrival != null and world.arrival.blocks_gameplay():
		return false
	return world.playground_ready and world.pending_unlock_level == 0 and world.water_phase == world.WaterPhase.READY and world.ui.celebration == null and not world.construction.busy()

func current_level() -> int:
	return preview_level if preview_level > 0 else world.layout.level

func _process(_delta: float) -> void:
	var ready := available()
	for action in buttons:
		buttons[action].disabled = not ready
	buttons.level.disabled = not ready or current_level() >= world.Layout.XP_THRESHOLDS.size()
	buttons.previous.disabled = not ready or current_level() <= 1
	buttons.terrain.disabled = not ready or world.layout.level < 2
	buttons.supplies.disabled = not ready or world.layout.level < 2
	buttons.house.disabled = not ready or world.layout.level < 5 or world.layout.house_bundle > 0
	buttons.restore.disabled = not ready or checkpoint.is_empty()
	status.text = GameCopy.text("testStatus", {"level": current_level(), "max": world.Layout.XP_THRESHOLDS.size(), "count": world.layout.cells.size(), "message": GameCopy.text(message_key, message_params)})
	arrange()

func checkpoint_snapshot() -> Dictionary:
	if checkpoint.is_empty(): return {}
	return {"island": checkpoint.duplicate(true), "pawn": [checkpoint_pawn.x, checkpoint_pawn.y], "preview_level": checkpoint_preview_level}

func load_checkpoint(data: Dictionary) -> void:
	checkpoint = {}
	var island = data.get("island")
	var point = data.get("pawn")
	var level = data.get("preview_level", 0)
	if not island is Dictionary or island.has("playground_checkpoint") or not point is Array or point.size() != 2:
		return
	if not (point[0] is float or point[0] is int) or not (point[1] is float or point[1] is int): return
	if not is_finite(float(point[0])) or not is_finite(float(point[1])): return
	if not (level is int or level is float) or float(level) != int(level) or level < 0 or level > int(island.get("level", 0)): return
	var candidate = world.Layout.new()
	if not candidate.restore(island): return
	checkpoint = island.duplicate(true)
	checkpoint_pawn = Vector2(point[0], point[1])
	checkpoint_preview_level = int(level)

func save_checkpoint() -> void:
	checkpoint = world.layout.snapshot().duplicate(true)
	if world.playground_manual_progression:
		checkpoint["playground_manual_progression"] = true
	checkpoint_pawn = world.pawn.position
	checkpoint_preview_level = preview_level
	world.save_layout()

func run_action(action: String, seed_value: int = -1) -> bool:
	_process(0) # Validate availability even when invoked between render frames.
	if not available() or not buttons.has(action) or buttons[action].disabled:
		return false
	if checkpoint.is_empty() and action not in ["restore", "checkpoint"]:
		save_checkpoint()
	match action:
		"previous":
			preview_level = current_level() - 1
			message_key = "testPrevious"
		"level":
			world.ui.max_preview_level = world.Layout.XP_THRESHOLDS.size()
			var target := current_level() + 1
			if target <= world.layout.level:
				# Revisit the actual popup without revoking or duplicating rewards.
				preview_level = target
				world.waypoints.clear()
				world.pawn.walk_to(world.pawn.position)
				world.editing = false
				world.refresh()
				world.ui.celebrate(target)
			else:
				preview_level = 0
				world.unlock_level(target)
			panel.hide()
			message_key = "testIncreased"
		"supplies":
			world.layout.stock.meadow += 30
			world.layout.stock.stairs += 8
			var grants: Dictionary = world.layout.playground_grants
			grants.ground = int(grants.get("ground", 0)) + 46
			for kind in ["tree", "sheep", "chicken"]:
				if world.layout.level >= {"tree": 3, "sheep": 5, "chicken": 2}[kind]:
					var count := 10 if kind == "tree" else 3
					world.layout.stock[kind] += count
					grants[kind] = int(grants.get(kind, 0)) + count
			world.history.clear()
			world.refresh()
			world.save_layout()
			message_key = "testSupplies"
		"house":
			world.layout.resources.wood += 6
			world.layout.house_bundle = 6
			world.history.clear()
			world.construction.open_placement()
			world.save_layout()
			panel.hide()
			message_key = "testHouse"
		"terrain":
			var next_seed := seed_value if seed_value >= 0 else int(Time.get_ticks_usec())
			var generated: Dictionary = Terrain.generate(world.layout, next_seed).snapshot()
			if world.playground_manual_progression:
				generated["playground_manual_progression"] = true
			if not replace_island(generated): return false
			message_key = "testTerrain"
			message_params = {"seed": next_seed}
		"fresh":
			if not replace_island(Terrain.fresh(1).snapshot()): return false
			preview_level = 0
			world.playground_manual_progression = true
			world.save_layout()
			message_key = "testFresh"
		"checkpoint":
			save_checkpoint()
			message_key = "testSaved"
		"restore":
			if not replace_island(checkpoint): return false
			preview_level = checkpoint_preview_level
			world.pawn.position = checkpoint_pawn
			world.pawn.walk_to(checkpoint_pawn)
			message_key = "testRestored"
	return true

func replace_island(snapshot: Dictionary) -> bool:
	world.harvesting.cancel()
	world.movement_generation += 1
	world.waypoints.clear()
	world.log_pickup = Vector2i(999, 999)
	world.log_delivery = Vector2i(999, 999)
	world.house_log_source = Vector2i(999, 999)
	world.construction.phase = world.construction.Phase.READY
	world.construction.house_sprite = null
	world.editing = false
	world.selected = ""
	world.history.clear()
	world.preserve_history_on_reopen = false
	if not world.restore_saved_layout(snapshot, false): return false
	world.camera_command("reset")
	world.save_layout()
	return true

func localize() -> void:
	toggle.text = GameCopy.text("playground")
	title.text = GameCopy.text("testing")
	GameCopy.font(toggle)
	GameCopy.font(title)
	GameCopy.font(status)
	var labels := {"level": "levelPlus", "previous": "levelMinus", "supplies": "supplies", "terrain": "randomTerrain", "house": "houseLogs", "checkpoint": "checkpoint", "restore": "restore", "fresh": "fresh"}
	for action in buttons:
		buttons[action].text = GameCopy.text(labels[action])
		buttons[action].accessibility_name = buttons[action].text
		GameCopy.font(buttons[action])
