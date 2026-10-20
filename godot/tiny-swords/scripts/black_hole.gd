extends Node2D

const Visibility = preload("res://scripts/portal_visibility.gd")
const LENS_SHADER = preload("res://shaders/black_hole_lens.gdshader")
const ACTOR_SHADER = preload("res://shaders/black_hole_actor.gdshader")
const LENS_SIZE := Vector2(320, 240)
const PORTAL_CLEARANCE := Vector2(144, 160)
const State = preload("res://scripts/black_hole_state.gd")
const SHEEP = preload("res://scripts/sheep_visual.gd")
const CHICKEN = preload("res://scripts/chicken_visual.gd")
const ATLAS = preload("res://assets/black-hole/portal.png")
const NO_CELL := Vector2i(999, 999)
const BASE_SCALE := Vector2(0.24, 0.24)
const HOVER_HEIGHT := 48.0
const ABSORPTION_SECONDS := 0.9
const RADIUS := 21.0
var world
var portal: Sprite2D
var ground_shadow: Polygon2D
var lens: ColorRect
var backbuffer: BackBufferCopy
var last_art_revision := -1
var previous := {}
var visited := false
var last_process_at := 0.0
var frame_clock := 0.0
var wait := 1.8
var effects: Array[Node] = []
var effects_busy := 0
var generation := 0
var tweens: Array[Tween] = []

func _ready() -> void:
	process_priority = 50 # Observe actors after their normal movement.
	portal = Sprite2D.new()
	portal.texture = ATLAS
	portal.hframes = 4
	portal.vframes = 2
	portal.rotation = 0.0
	portal.z_index = 92 # Preserve the GIF above its surrounding lens.
	portal.scale = BASE_SCALE
	portal.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	portal.hide()
	add_child(portal)
	ground_shadow = Polygon2D.new()
	var outline := PackedVector2Array()
	for index in 32:
		var angle := TAU * index / 32.0
		outline.append(Vector2(cos(angle) * 30.0, sin(angle) * 6.0))
	ground_shadow.polygon = outline
	ground_shadow.color = Color(0, 0, 0, 0.2) # Match the existing animal ground shadows.
	ground_shadow.z_index = 91 # Grounded shadow stays outside the screen warp.
	ground_shadow.hide()
	add_child(ground_shadow)
	backbuffer = BackBufferCopy.new()
	backbuffer.copy_mode = BackBufferCopy.COPY_MODE_RECT
	backbuffer.z_index = 89
	backbuffer.hide()
	add_child(backbuffer)
	lens = ColorRect.new()
	lens.size = LENS_SIZE
	lens.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lens.z_index = 90
	lens.material = ShaderMaterial.new()
	lens.material.shader = LENS_SHADER
	lens.hide()
	add_child(lens)

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_IN and visited and world != null and world.playground_ready:
		start_visit.call_deferred()

func pawn_absorbed() -> bool:
	return State.count(world.layout.black_hole, "pawn") > 0

func reset_visit() -> void:
	generation += 1
	for tween in tweens:
		if tween.is_valid(): tween.kill()
	tweens.clear()
	for effect in effects:
		if is_instance_valid(effect): effect.queue_free()
	effects.clear()
	effects_busy = 0
	previous.clear()
	visited = false
	last_process_at = 0.0
	last_art_revision = -1
	wait = 1.8
	apply_pawn_state()
	update_portal()

func apply_pawn_state() -> void:
	world.pawn.portal_absorbed = pawn_absorbed()
	world.pawn.visible = not world.editing and not pawn_absorbed()
	if pawn_absorbed():
		world.waypoints.clear()
		world.pawn.walk_to(world.pawn.position)

func start_visit(day: int = State.today()) -> void:
	if not world.black_hole_enabled: return
	visited = true
	var state: Dictionary = world.layout.black_hole
	if state.is_empty():
		world.layout.black_hole = State.initial(day, randi_range(14, 28))
		world.save_layout()
		return
	if state.phase == "hungry" and day > int(state.day):
		state.phase = "returning"
		world.history.clear()
		var cell := choose_cell()
		if cell != NO_CELL: state.cell = [cell.x, cell.y]
		world.save_layout()
	elif state.phase == "idle" and day >= int(state.next_day):
		open(day)
	apply_pawn_state()
	update_portal()

func clear_cells() -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	var spawn: Vector2i = world.layout.spawn_cell()
	for cell: Vector2i in world.layout.cells:
		if not world.layout.asset_ground_free(cell) or world.layout.flora.has(cell) or world.layout.decorations.has(cell):
			continue
		var neighbors := 0
		for step in world.layout.STEPS:
			if world.layout.cells.has(cell + step) and world.layout.cells[cell + step] != "stairs" and world.layout.height_at(cell + step) == world.layout.height_at(cell):
				neighbors += 1
		if neighbors < 3:
			continue # Avoid narrow routes and small ledges.
		var point: Vector2 = world.layout.center(cell)
		if not spot_visible(cell): continue
		if not world.layout.walkable_point(point) or world.layout.cell_at(world.pawn.position) == cell:
			continue
		if not world.layout.path(spawn, cell).is_empty():
			result.append(cell)
	return result

func spot_visible(cell: Vector2i) -> bool:
	var point: Vector2 = world.layout.center(cell) - Vector2(0, world.layout.height_at(cell))
	# Reserve both the visible grass and the airborne portal itself, including
	# its maximum pulse and bob, rather than checking only roots/foundations.
	var area := Rect2(point - Vector2(32, 32), Vector2(64, 64))
	area = area.merge(Rect2(point - Vector2(0, HOVER_HEIGHT) - PORTAL_CLEARANCE / 2.0, PORTAL_CLEARANCE).grow(5.0))
	return Visibility.clear(world, area, world.layout.height_at(cell))

func ensure_visible_spot() -> bool:
	var state: Dictionary = world.layout.black_hole
	if last_art_revision != world.inventory_art_revision:
		last_art_revision = world.inventory_art_revision
		var cell := Vector2i(state.cell[0], state.cell[1])
		if not spot_visible(cell):
			cell = choose_cell()
			if cell == NO_CELL:
				portal.hide()
				lens.hide()
				backbuffer.hide()
				ground_shadow.hide()
				previous.clear()
				return false
			state.cell = [cell.x, cell.y]
			world.history.clear()
			world.save_layout()
		update_portal()
	return portal.visible

func choose_cell() -> Vector2i:
	var candidates := clear_cells()
	if candidates.is_empty(): return NO_CELL
	return candidates.pick_random()

func open(day: int = State.today(), cell: Vector2i = NO_CELL) -> bool:
	if not world.black_hole_enabled: return false
	if not world.layout.black_hole.is_empty() and world.layout.black_hole.phase != "idle": return false
	if cell == NO_CELL: cell = choose_cell()
	if not clear_cells().has(cell): return false
	world.layout.black_hole = {"phase": "hungry", "day": day, "next_day": day + randi_range(14, 28), "cell": [cell.x, cell.y], "occupants": [], "facing_left": true}
	world.history.clear()
	world.save_layout()
	previous.clear()
	update_portal()
	portal.scale = BASE_SCALE * 0.01
	var opening := create_tween()
	tweens.append(opening)
	opening.tween_property(portal, "scale", BASE_SCALE, 0.7)
	return true

func center() -> Vector2:
	var state: Dictionary = world.layout.black_hole
	return world.layout.center(Vector2i(state.cell[0], state.cell[1]))

func hover_phase() -> float:
	return 0.0 if GamePresentation.reduced_motion else sin(frame_clock)

func visual_center() -> Vector2:
	var point := center()
	var bob := hover_phase() * 2.0
	return point - Vector2(0, world.ground_height(point) + HOVER_HEIGHT + bob)

func update_shadow() -> void:
	if ground_shadow == null: return
	ground_shadow.visible = portal.visible
	# Share the slow hover phase: widest at the highest point, without the
	# GIF's rapid frame-size flicker or the absorption sprite's sudden swell.
	var reveal := minf(portal.scale.x / BASE_SCALE.x, 1.0)
	ground_shadow.scale = Vector2(1.0 + hover_phase() * 0.025, 1.0 + hover_phase() * 0.0125) * reveal

func update_portal() -> void:
	if portal == null: return
	var state: Dictionary = world.layout.black_hole
	portal.visible = world.black_hole_enabled and not state.is_empty() and state.phase != "idle"
	lens.visible = portal.visible
	backbuffer.visible = portal.visible
	update_shadow()
	if not portal.visible: return
	var point := center()
	portal.flip_h = not state.get("facing_left", true)
	ground_shadow.position = point - Vector2(0, world.ground_height(point) - 2.0)
	portal.position = visual_center()
	# The trigger stays on its grass tile; the upright artwork floats above it.
	z_index = int(ceil(world.ground_height(point) / 64.0)) - 1
	portal.scale = BASE_SCALE

func _process(delta: float) -> void:
	if not world.black_hole_enabled: return
	if not world.playground_ready or (world.arrival != null and world.arrival.blocks_gameplay()): return
	var now := Time.get_unix_time_from_system()
	# The host/browser can suspend this same scene while the island is away.
	# Treat a resumed visit like reopening, without a midnight interruption.
	if not visited or (last_process_at > 0 and now - last_process_at > 60): start_visit()
	last_process_at = now
	var state: Dictionary = world.layout.black_hole
	if state.is_empty() or state.phase == "idle":
		lens.hide()
		backbuffer.hide()
		update_shadow()
		return
	if world.editing:
		portal.hide()
		lens.hide()
		backbuffer.hide()
		ground_shadow.hide()
		last_art_revision = -1
		previous.clear()
		return
	if not ensure_visible_spot(): return
	frame_clock += delta
	portal.position = visual_center()
	lens.position = portal.position - LENS_SIZE / 2.0
	# Copy only the local lens plus its sampling margin, not the whole canvas.
	backbuffer.rect = Rect2(lens.position, LENS_SIZE).grow(24.0)
	var lens_transform := lens.get_global_transform_with_canvas()
	var viewport_size := get_viewport_rect().size
	lens.material.set_shader_parameter("screen_span_uv", LENS_SIZE * Vector2(lens_transform.x.length(), lens_transform.y.length()) / viewport_size)
	lens.material.set_shader_parameter("facing", -1.0 if state.get("facing_left", true) else 1.0)
	lens.material.set_shader_parameter("motion", 0.0 if GamePresentation.reduced_motion else 1.0)
	portal.frame = 0 if GamePresentation.reduced_motion else int(frame_clock * 10) % 8
	update_shadow()
	if world.editing or world.ui.celebration != null:
		previous.clear()
		return
	if state.phase == "returning":
		if effects_busy > 0: return
		wait -= minf(delta, 0.1) # Do not fast-forward the reunion after suspension.
		if wait <= 0:
			if state.occupants.is_empty():
				finish()
			elif release_one():
				wait = 2.1 if state.occupants.size() == 1 else 1.2
			else:
				wait = 1.0 # No clear landing: keep the passenger saved and retry.
		return
	var actors: Array[Node2D] = [world.pawn]
	for node in world.asset_nodes:
		if is_instance_valid(node) and not node.is_queued_for_deletion() and node.get_script() in [SHEEP, CHICKEN]: actors.append(node)
	var entrants: Array[Dictionary] = []
	for actor in actors:
		if actor == world.pawn and (pawn_absorbed() or world.water_phase != world.WaterPhase.READY): continue
		var point: Vector2 = actor.position
		var old: Vector2 = previous.get(actor.get_instance_id(), point)
		previous[actor.get_instance_id()] = point
		if point.distance_squared_to(old) < 0.001: continue
		if absf(world.ground_height(point) - world.ground_height(center())) > 1.0: continue
		if Geometry2D.get_closest_point_to_segment(center(), old, point).distance_to(center()) <= RADIUS:
			entrants.append({"actor": actor, "approach": old})
	# Remove simultaneous animals in descending slot order so rebuilding cannot
	# stop another entrant or shift its index before it has been captured.
	entrants.sort_custom(func(a, b):
		var first: String = "pawn" if a.actor == world.pawn else ("chicken" if a.actor.get_script() == CHICKEN else "sheep")
		var second: String = "pawn" if b.actor == world.pawn else ("chicken" if b.actor.get_script() == CHICKEN else "sheep")
		return a.actor.sheep_index > b.actor.sheep_index if first == second and first != "pawn" else first < second)
	var captured := false
	for entrant in entrants:
		captured = absorb(entrant.actor, entrant.approach, false) or captured
	if captured:
		world.rebuild_decorations()
		previous.clear()
		previous[world.pawn.get_instance_id()] = world.pawn.position

func sprite_copy(actor: Node2D) -> Sprite2D:
	var source = actor.sprite if actor == world.pawn else actor
	var copy := Sprite2D.new()
	if source is AnimatedSprite2D:
		copy.texture = source.sprite_frames.get_frame_texture(source.animation, source.frame)
	else:
		copy.texture = source.texture
		copy.hframes = source.hframes
		copy.vframes = source.vframes
		copy.frame = source.frame
	copy.flip_h = source.flip_h
	copy.offset = source.offset
	copy.position = source.global_position
	copy.scale = source.global_scale
	copy.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	copy.z_index = source.z_index + 2
	world.get_node("World").add_child(copy)
	return copy

func animate_copy(copy: Sprite2D, from: Vector2, to: Vector2, growing: bool) -> void:
	effects.append(copy)
	effects_busy += 1
	var token := generation
	var copy_ref: WeakRef = weakref(copy)
	var full_scale := copy.scale
	var material := ShaderMaterial.new()
	material.shader = ACTOR_SHADER
	var texture: Texture2D = copy.texture
	var region := Rect2(Vector2.ZERO, texture.get_size())
	if texture is AtlasTexture:
		region.position = texture.region.position
		texture = texture.atlas
	var frame_size := region.size / Vector2(copy.hframes, copy.vframes)
	region.position += Vector2(copy.frame % copy.hframes, floori(float(copy.frame) / copy.hframes)) * frame_size
	region.size = frame_size
	material.set_shader_parameter("frame_uv", Vector4(region.position.x / texture.get_width(), region.position.y / texture.get_height(), region.size.x / texture.get_width(), region.size.y / texture.get_height()))
	var direction := (to - from).normalized()
	if copy.flip_h: direction.x *= -1.0
	material.set_shader_parameter("pull_direction", direction)
	material.set_shader_parameter("suction", 1.0 if growing else 0.0)
	copy.material = material
	copy.position = from
	if growing: copy.scale = full_scale * 0.01
	var tween := create_tween().set_parallel(true)
	tweens.append(tween)
	tween.tween_method(func(value: float): material.set_shader_parameter("suction", value), 1.0 if growing else 0.0, 0.0 if growing else 1.0, ABSORPTION_SECONDS)
	tween.tween_property(copy, "position", to, ABSORPTION_SECONDS).set_trans(Tween.TRANS_QUAD)
	tween.tween_property(copy, "scale", full_scale if growing else full_scale * 0.01, ABSORPTION_SECONDS)
	tween.finished.connect(func():
		if token == generation: effects_busy = maxi(0, effects_busy - 1)
		var effect = copy_ref.get_ref()
		if effect != null:
			effects.erase(effect)
			effect.queue_free())

func absorb(actor: Node2D, approach: Vector2 = Vector2.INF, rebuild_now: bool = true) -> bool:
	if not world.black_hole_enabled: return false
	var state: Dictionary = world.layout.black_hole
	if state.is_empty() or state.phase != "hungry" or state.occupants.size() >= 1024: return false
	if actor == world.pawn and pawn_absorbed(): return false
	var incoming: Vector2 = actor.position if not approach.is_finite() else approach
	if absf(incoming.x - center().x) > 2.0:
		state.facing_left = incoming.x < center().x
	portal.flip_h = not state.get("facing_left", true)
	lens.material.set_shader_parameter("facing", -1.0 if state.get("facing_left", true) else 1.0)
	var copy := sprite_copy(actor)
	var start := copy.position
	if actor == world.pawn:
		world.harvesting.cancel()
		world.movement_generation += 1
		world.navigation_pending = false
		world.waypoints.clear()
		world.log_pickup = NO_CELL
		world.log_delivery = NO_CELL
		world.construction.phase = world.construction.Phase.READY
		world.pawn.hammering = false
		state.occupants.append("pawn")
		if world.layout.chicken_release_at > 0:
			state.occupants.append("chicken")
			world.layout.chicken_release_at = 0.0
			world.pawn.carrying_chicken = false
	else:
		var kind := "chicken" if actor.get_script() == CHICKEN else "sheep"
		var animals: Array[Vector2] = world.layout.chickens if kind == "chicken" else world.layout.sheep
		animals.remove_at(actor.sheep_index)
		state.occupants.append(kind)
	world.history.clear()
	apply_pawn_state()
	world.save_layout() # The durable queue replaces the live actor atomically.
	if rebuild_now: world.rebuild_decorations()
	previous.clear()
	previous[world.pawn.get_instance_id()] = world.pawn.position
	animate_copy(copy, start, visual_center(), false)
	pulse()
	return true

func landing_point(kind: String) -> Vector2:
	var candidates: Array = world.layout.cells.keys()
	candidates.sort_custom(func(a, b): return world.layout.center(a).distance_squared_to(center()) < world.layout.center(b).distance_squared_to(center()))
	for cell: Vector2i in candidates:
		if not world.layout.asset_ground_free(cell, false, true): continue
		var point: Vector2 = world.layout.safe_ground_point(cell, kind != "pawn")
		if not point.is_finite() or not world.layout.walkable_point(point, kind != "pawn"): continue
		if point.distance_to(center()) < 38: continue
		if not pawn_absorbed() and point.distance_to(world.pawn.position) < 34: continue
		var clear := true
		for other: Vector2 in world.layout.chickens + world.layout.sheep:
			if point.distance_to(other) < 34: clear = false
		if clear: return point
	return Vector2.INF

func release_one() -> bool:
	var state: Dictionary = world.layout.black_hole
	if state.phase != "returning" or state.occupants.is_empty(): return false
	var kind: String = state.occupants[0]
	var point := landing_point(kind)
	if not point.is_finite(): return false
	state.occupants.pop_front()
	if kind == "pawn":
		world.pawn.position = point
		world.pawn.walk_to(point)
	else:
		var animals: Array[Vector2] = world.layout.chickens if kind == "chicken" else world.layout.sheep
		animals.append(point)
	world.history.clear()
	apply_pawn_state()
	world.save_layout() # Commit removal and restoration together, before the effect.
	world.rebuild_decorations()
	var actor: Node2D = world.pawn
	if kind != "pawn":
		for node in world.asset_nodes:
			if node.get_script() == (CHICKEN if kind == "chicken" else SHEEP) and node.position.is_equal_approx(point): actor = node
	var copy := sprite_copy(actor)
	actor.hide()
	actor.set_process(false)
	if actor == world.pawn: actor.portal_absorbed = true
	var token := generation
	var actor_ref: WeakRef = weakref(actor)
	animate_copy(copy, visual_center(), copy.position, true)
	get_tree().create_timer(ABSORPTION_SECONDS).timeout.connect(func():
		var live = actor_ref.get_ref()
		if token != generation or live == null or live.is_queued_for_deletion(): return
		live.set_process(true)
		live.visible = not world.editing
		if live == world.pawn: live.portal_absorbed = false)
	pulse()
	return true

func pulse() -> void:
	if GamePresentation.reduced_motion: return
	var tween := create_tween()
	tweens.append(tween)
	tween.tween_property(portal, "scale", BASE_SCALE * 1.12, 0.1)
	tween.tween_property(portal, "scale", BASE_SCALE, 0.22)

func finish() -> void:
	var state: Dictionary = world.layout.black_hole
	if not state.occupants.is_empty(): return
	lens.hide()
	backbuffer.hide()
	world.layout.black_hole = State.initial(State.today(), randi_range(14, 28))
	world.history.clear()
	world.save_layout()
	var tween := create_tween()
	tweens.append(tween)
	tween.tween_property(portal, "scale", BASE_SCALE * 0.01, 0.5)
	tween.finished.connect(func():
		if world.layout.black_hole.phase == "idle": portal.hide())

# Only exposed by the existing localhost/native Playground.
func preview_tomorrow() -> void:
	var state: Dictionary = world.layout.black_hole
	if state.is_empty() or state.phase != "hungry": return
	if world.editing: world.toggle_editing()
	state.day = State.today() - 1
	world.save_layout()
	start_visit()
