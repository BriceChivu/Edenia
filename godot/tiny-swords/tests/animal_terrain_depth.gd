extends SceneTree

# Run with a renderer: this checks the real animal sprites and terrain pixels.
const TerrainView = preload("res://scripts/terrain_view.gd")
var world
var mask_view: SubViewport
var mask_piece
var failures := 0
var checked := 0
var no_overlap := 0
var totals := {}

func _initialize() -> void:
	run.call_deferred()

func capture() -> Image:
	await process_frame
	await process_frame
	RenderingServer.force_draw()
	return root.get_texture().get_image()

func differences(a: Image, b: Image, mask: Image) -> int:
	var count := 0
	var bounds := mask.get_used_rect()
	for y in range(bounds.position.y, bounds.end.y):
		for x in range(bounds.position.x, bounds.end.x):
			if mask.get_pixel(x, y).a > 0.99 and a.get_pixel(x, y) != b.get_pixel(x, y):
				count += 1
	return count

func set_pawn(point: Vector2) -> void:
	world.pawn.position = point
	var height: float = world.ground_height(point)
	world.pawn.sprite.position.y = -32 - height
	world.pawn.z_index = int(ceil(height / 64.0))

func probe(animal, occluder, mask: Image, point: Vector2, expected_front: bool, label: String) -> void:
	animal.position = point
	var height: float = world.ground_height(point)
	animal.offset = animal.art_offset - Vector2(0, height / animal.art_scale)
	animal.z_index = int(ceil(height / 64.0))
	animal.hide()
	var baseline: Image = await capture()
	animal.show()
	var rendered: Image = await capture()
	if label.ends_with("dir=1/height=0/pawn=0/slope_front") or label.ends_with("dir=1/height=0/pawn=2/slope_behind"):
		var evidence := OS.get_environment("TINY_SWORDS_DEPTH_EVIDENCE")
		if not evidence.is_empty():
			rendered.save_png(evidence + "/" + label.get_slice("/", 0) + "-" + label.get_slice("/", 5) + ".png")
	if label.ends_with("dir=1/height=0/pawn=0/lower_behind_landing"):
		var evidence := OS.get_environment("TINY_SWORDS_LANDING_EVIDENCE")
		if not evidence.is_empty():
			rendered.save_png(evidence + "/" + label.get_slice("/", 0) + "-behind-landing.png")
	var visible := differences(baseline, rendered, mask)
	# Prove that this pose overlaps opaque terrain, so zero changes cannot
	# accidentally pass an occlusion check with no overlapping animal pixels.
	occluder.hide()
	animal.hide()
	var uncovered_baseline: Image = await capture()
	animal.show()
	var uncovered: Image = await capture()
	var overlapping := differences(uncovered_baseline, uncovered, mask)
	occluder.show()
	if overlapping == 0:
		no_overlap += 1
		return
	checked += 1
	var group: String = label.get_slice("/", 0) + "/" + label.get_slice("/", 1)
	if not totals.has(group):
		totals[group] = {"checked": 0, "failed": 0}
	totals[group].checked += 1
	if (visible > 0) != expected_front:
		failures += 1
		totals[group].failed += 1
		print("FAIL ", label, " visible=", visible, " overlap=", overlapping, " expected_front=", expected_front)
		if totals[group].failed == 1:
			rendered.save_png("/tmp/edenia-%s-depth-failure.png" % group.replace("/", "-"))
	animal.hide()

func terrain_mask(cell: Vector2i) -> Image:
	mask_piece.piece = cell
	mask_piece.layout = world.layout
	mask_piece.queue_redraw()
	mask_view.canvas_transform = world.terrain.get_global_transform_with_canvas()
	await capture()
	return mask_view.get_texture().get_image()

func run() -> void:
	root.size = Vector2i(1152, 496)
	world = load("res://scenes/level_two_preview.tscn").instantiate()
	world.island_start_enabled = false
	world.preview_save_enabled = false
	root.add_child(world)
	await process_frame
	world.set_process(false)
	world.harvesting.set_process(false)
	world.pawn.set_physics_process(false)
	world.pawn.hide()
	world.editing = false
	world.terrain.editing = false
	world.game_camera.zoom = Vector2.ONE
	world.game_camera.force_update_scroll()
	for node in world.find_children("*", "", true, false):
		if node.has_method("update_depth_mask"):
			node.hide()
	mask_view = SubViewport.new()
	mask_view.size = root.size
	mask_view.transparent_bg = true
	mask_view.disable_3d = true
	mask_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(mask_view)
	mask_piece = TerrainView.new()
	mask_piece.layout = world.layout
	mask_piece.piece = Vector2i.ZERO
	mask_view.add_child(mask_piece)
	var l = world.layout
	l.trees.clear()
	l.flora.clear()
	l.decorations.clear()
	for species in ["sheep", "chicken"]:
		for direction in [Vector2i.RIGHT, Vector2i.LEFT]:
			for landing_first in [false, true]:
				for height in [0, 64]:
					l.cells = {Vector2i.ZERO: "stairs", -direction: "meadow", direction: "high_gold"} if not landing_first else {direction: "high_gold", -direction: "meadow", Vector2i.ZERO: "stairs"}
					l.elevations = {Vector2i.ZERO: height, -direction: height, direction: height + 64}
					for x in range(-2, 3):
						if x not in [0, direction.x]:
							l.cells[Vector2i(x,0)] = "meadow"
							l.elevations[Vector2i(x,0)] = height
						for y in [-1, 1]:
							l.cells[Vector2i(x,y)] = "meadow"
							l.elevations[Vector2i(x,y)] = height
					for cell in l.cells:
						if l.cells[cell] != "stairs" and l.height_at(cell) > 0:
							l.cells[cell] = "high_gold"
					l.sheep.clear()
					l.chickens.clear()
					(l.sheep if species == "sheep" else l.chickens).append(l.center(-direction))
					world.rebuild_decorations()
					await process_frame
					var animal = world.get_node("World").get_children().filter(func(n): return not n.is_queued_for_deletion() and n.has_method("animal_positions"))[0]
					animal.set_process(false)
					animal.frame = 0
					animal.hide()
					var surfaces: Array = world.get_node("World").get_children().filter(func(n): return not n.is_queued_for_deletion() and n.has_meta("terrain_occluder"))
					var ramp = surfaces.filter(func(n): return n.piece == Vector2i.ZERO)[0]
					var cliff = surfaces.filter(func(n): return n.piece == direction)[0]
					var ramp_mask: Image = await terrain_mask(Vector2i.ZERO)
					var cliff_mask: Image = await terrain_mask(direction)
					var pawn_points := [l.center(-direction), l.center(Vector2i(-1,1)), l.center(Vector2i(1,1)), l.center(direction)]
					for pawn_index in pawn_points.size():
						set_pawn(pawn_points[pawn_index])
						var prefix := "%s/%%s/dir=%s/height=%d/pawn=%d/" % [species,direction.x,height,pawn_index]
						for situation in ["slope_behind", "slope_front", "beside", "ramp", "front"]:
							var point: Vector2 = l.center(Vector2i.ZERO)
							if situation.begins_with("slope_"):
								point.y = l.ORIGIN.y - (34 if situation == "slope_behind" else 20)
							if situation == "beside":
								point.x = l.ORIGIN.x + (-12 if direction.x > 0 else 76)
							if situation == "front":
								point.y = l.ORIGIN.y + 68
							await probe(animal, ramp, ramp_mask, point, situation != "slope_behind", (prefix % "ramp") + situation)
						await probe(animal, cliff, cliff_mask, l.center(direction + Vector2i.UP) + Vector2(0, 20), false, (prefix % "cliff") + "lower_behind_landing")
						var side: Vector2 = l.center(direction) + Vector2(direction.x * 36, 0)
						await probe(animal, cliff, cliff_mask, side, false, (prefix % "cliff") + "lower_side")
						await probe(animal, cliff, cliff_mask, l.center(direction), true, (prefix % "cliff") + "upper_surface")
						await probe(animal, cliff, cliff_mask, l.center(direction + Vector2i.DOWN) - Vector2(0,20), true, (prefix % "cliff") + "lower_front")
	# Two actors must be able to straddle one slope independently.
	l.sheep.clear()
	l.chickens.clear()
	l.sheep.append(l.center(Vector2i.RIGHT))
	l.chickens.append(l.center(Vector2i.RIGHT))
	world.rebuild_decorations()
	await process_frame
	var actors: Array = world.get_node("World").get_children().filter(func(n): return not n.is_queued_for_deletion() and n.has_method("animal_positions"))
	var ramp = world.get_node("World").get_children().filter(func(n): return not n.is_queued_for_deletion() and n.has_meta("terrain_occluder") and n.piece == Vector2i.ZERO)[0]
	var mask: Image = await terrain_mask(Vector2i.ZERO)
	for actor in actors:
		actor.set_process(false)
		actor.frame = 0
	for swap in [false, true]:
		for index in actors.size():
			var actor = actors[index]
			actor.position = Vector2(l.ORIGIN.x + (12 if index == 0 else 52), l.ORIGIN.y - (52 if index == 0 else 12) + (12 if (index == 0) != swap else -2))
			var height: float = world.ground_height(actor.position)
			actor.offset = actor.art_offset - Vector2(0, height / actor.art_scale)
			actor.z_index = int(ceil(height / 64.0))
			actor.show()
		for pawn_point in [l.center(Vector2i.RIGHT), l.center(Vector2i(-1,1))]:
			set_pawn(pawn_point)
			for index in actors.size():
				var actor = actors[index]
				var species: String = "chicken" if actor.get_script().resource_path.ends_with("chicken_visual.gd") else "sheep"
				await probe(actor, ramp, mask, actor.position, (index == 0) != swap, species + "/ramp/simultaneous")
				actor.show()
	if checked == 0 or totals.size() != 4 or no_overlap > 0:
		failures += 1
		push_error("Both animals must exercise overlapping ramp and cliff cases")
	for group in totals:
		print(group, ": ", totals[group].checked, " overlapping cases, ", totals[group].failed, " failures")
	print("Animal terrain depth: ", "PASS" if failures == 0 else "FAIL", "; checked=",checked," failures=",failures," non-overlapping poses=",no_overlap)
	quit(0 if failures == 0 else 1)
