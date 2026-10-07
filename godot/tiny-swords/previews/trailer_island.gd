extends Node2D

# A presentation-only world: canonical terrain, actors, harvesting and clouds.
# It never reads or writes learner layouts or native preview saves.
const TARGET := Vector2i(4, 1)
const START := Vector2i(-4, 1)
const TERRAIN_INTERVAL := 0.21
const DURATION := 19.0
var game
var rng := RandomNumberGenerator.new()
var elapsed := 0.0
var frame_count := 0
var terrain_elapsed := 0.0
var terrain_generation := 0
var target_tree: Sprite2D
var started := false
var presentation_clock := 0.0
var study_stage := 1

func _ready() -> void:
	presentation_clock = Time.get_unix_time_from_system()
	seed(73491)
	rng.seed = 73491
	game = preload("res://scenes/level_two_preview.tscn").instantiate()
	game.preview_save_enabled = false
	game.camera_save_enabled = false
	game.island_start_enabled = false
	add_child(game)
	game.set_process_unhandled_input(false)
	game.pointer_inside = false
	game.ui.hide()
	game.harvesting.set_process(false)
	game.get_node("WaterRocks").hide()
	# The gameplay shark is excluded from the source-rendered trailer.
	game.shark.hide()
	game.shark.set_process(false)
	# Keep the existing cloud scripts on their ordinary clocks, across layouts.
	game.game_camera.position = game.layout.center(Vector2i(0, 0))
	var viewport_size := get_viewport_rect().size
	var phone := viewport_size.x / viewport_size.y < 1.5
	var render_scale := viewport_size.x / 640.0 if phone else viewport_size.y / 496.0
	# High-resolution recordings retain the same wider world framing as F6.
	game.game_camera.zoom = Vector2.ONE * (0.6 if phone else 0.8) * render_scale
	game.pawn.position = game.layout.center(START)
	generate_terrain(1)
	game.pawn.walk_to(game.pawn.position)
	for tree in game.tree_nodes:
		if tree.get_meta("cell") == TARGET:
			target_tree = tree

func generate_terrain(study_level: int) -> void:
	study_stage = study_level
	var layout = game.layout
	# The trailer's harvest is unlocked; scenery follows the displayed progression.
	layout.level = 10
	layout.manual_ground_elevation = true
	layout.cells.clear()
	layout.elevations.clear()
	layout.stair_directions.clear()
	layout.flora.clear()
	layout.decorations.clear()
	layout.houses.clear()
	layout.house_offsets.clear()
	layout.chickens.clear()
	layout.sheep.clear()
	layout.trees.clear()
	layout.tree_types.clear()
	# Start and destination are permanent. The path appears ahead of each footstep.
	layout.cells[START] = "meadow"
	layout.cells[TARGET] = "meadow"
	var ahead := mini(TARGET.x, int(ceil((game.pawn.position.x - layout.center(START).x) / 64.0)) + START.x + 1)
	if started:
		for x in range(START.x, ahead + 1):
			layout.cells[Vector2i(x, 1)] = "meadow"
	var house_cell := Vector2i(0, -1)
	if study_level >= 5:
		for y in range(-2, 1):
			for x in range(0, 2):
				layout.cells[Vector2i(x, y)] = "meadow"
		layout.houses[house_cell] = rng.randi_range(0, 3)
	var terrace_left := -3 if terrain_generation % 2 == 0 else 2
	if study_level >= 3:
		for x in range(terrace_left, terrace_left + 2):
			var cell := Vector2i(x, 0)
			layout.cells[cell] = "high_gold"
			layout.elevations[cell] = 64.0
	var animal_cells := [Vector2i(-4, 2), Vector2i(-2, 2)]
	for index in range(animal_cells.size()):
		if study_level >= [5, 8][index]:
			layout.cells[animal_cells[index]] = "meadow"
	var budget := 2 + (study_level - 1) * 3 + (4 if study_level >= 5 else 0)
	var choices: Array[Vector2i] = []
	for y in range(-2, 5):
		for x in range(-5, 6):
			var cell := Vector2i(x, y)
			# Growth follows the pawn from the first islet toward the target tree.
			if x <= ahead and not layout.cells.has(cell):
				choices.append(cell)
	# Grow connected patches instead of disconnected random speckles.
	while layout.cells.size() < budget and not choices.is_empty():
		var adjacent: Array[Vector2i] = []
		for cell in choices:
			for direction in layout.STEPS:
				if layout.cells.has(cell + direction):
					adjacent.append(cell)
					break
		if adjacent.is_empty():
			break
		var cell := adjacent[rng.randi_range(0, adjacent.size() - 1)]
		layout.cells[cell] = "meadow"
		choices.erase(cell)
	var candidates: Array[Vector2i] = []
	for cell in layout.cells:
		if cell in [START, TARGET] or cell in animal_cells or cell.y in [1, 2]:
			continue
		if study_level >= 5 and cell.x in [0, 1] and cell.y <= 0:
			continue
		candidates.append(cell)
	# Sheep and houses follow progression; chickens are absent from this trailer.
	if study_level >= 5:
		layout.sheep.append(layout.center(animal_cells[0]))
	if study_level >= 8:
		layout.sheep.append(layout.center(animal_cells[1]))
	for index in mini(candidates.size(), study_level):
		var cell := candidates[index]
		if study_level >= 3 and index % 3 == 2:
			layout.trees[cell] = true
			layout.tree_types[cell] = layout.TREE_VARIANTS[rng.randi_range(0, 3)]
		else:
			layout.decorations[cell] = {"kind": "land_rock" if index % 2 == 0 else "bush", "variant": rng.randi_range(1, 2)}
	# Ducks stay in open water; shark scenery is intentionally absent.
	if study_level >= 4:
		var duck_cell := Vector2i(6, 3)
		layout.decorations[duck_cell] = {"kind": "ducks", "variant": rng.randi_range(1, 2), "water": duck_cell}
	layout.trees[TARGET] = true
	layout.tree_types[TARGET] = "tree"
	# Retain the actual target sprite and its ambient phase across generations.
	if is_instance_valid(target_tree):
		game.tree_nodes.erase(target_tree)
	game.rebuild_decorations()
	if is_instance_valid(target_tree):
		for tree in game.tree_nodes.duplicate():
			if tree.get_meta("cell") == TARGET:
				game.tree_nodes.erase(tree)
				tree.queue_free()
		game.tree_nodes.append(target_tree)
	# New placements inherit the presentation clock, never the timelapse rate.
	for plant in game.flora_nodes:
		if plant.get_script() == preload("res://scripts/environment_sprite.gd"):
			plant.elapsed = elapsed
			plant.frame = posmod(int((elapsed + plant.phase) * plant.frames_per_second), plant.hframes)
	for tree in game.tree_nodes:
		if tree != target_tree:
			tree.elapsed = elapsed
			tree.update_pose()
	for animal in game.asset_nodes:
		if animal.has_method("animal_positions"):
			animal.animation_time = elapsed + animal.sheep_index * 0.17
			animal.frame = int(animal.animation_time * 10) % animal.hframes
	game.terrain.refresh_drawing()
	terrain_generation += 1

func _process(delta: float) -> void:
	frame_count += 1
	elapsed += delta
	if not started and elapsed >= 0.6:
		started = true
		# Plan on the completed path; terrain reveals it ahead of the walk.
		for x in range(START.x, TARGET.x + 1):
			game.layout.cells[Vector2i(x, 1)] = "meadow"
		assert(game.harvesting.start(TARGET), "Trailer tree must be reachable")
		generate_terrain(1)
	if game.harvesting.phase in [game.harvesting.Phase.EQUIPPING, game.harvesting.Phase.APPROACHING]:
		terrain_elapsed += delta
		if terrain_elapsed >= TERRAIN_INTERVAL:
			terrain_elapsed = 0.0
			var distance: float = game.pawn.position.x - game.layout.center(START).x
			var progress := clampf(distance / (512.0 - game.harvesting.CUTTING_REACH), 0.0, 1.0)
			generate_terrain(clampi(1 + int(progress * 9.5), 1, 10))
	if game.harvesting.phase == game.harvesting.Phase.CUTTING and study_stage < 10:
		generate_terrain(10)
	# Offline recording follows presentation seconds rather than render wall time.
	# Use the canonical advancement methods without their background catch-up clock.
	game.harvesting.advance(delta, presentation_clock + elapsed)
	for animal in game.asset_nodes:
		if animal.has_method("animal_positions") and not animal.is_queued_for_deletion():
			animal.set_process(false)
			animal.advance(delta, presentation_clock + elapsed)
	if elapsed >= DURATION:
		assert(game.layout.carried_wood == 1, "Trailer must finish its normal tree harvest")
		if "--capture-trailer" in OS.get_cmdline_user_args():
			print("Trailer captured: %d frames, %.3f seconds, %d terrains" % [frame_count, elapsed, terrain_generation])
			get_tree().quit()
		else:
			# Editor preview holds on the finished island.
			set_process(false)
