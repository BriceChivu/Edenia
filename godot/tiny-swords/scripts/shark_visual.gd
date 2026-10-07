extends Sprite2D

# Ambient wildlife belongs to the ocean, independent of inventory and saves.
const ART = preload("res://assets/shark/shark.png")
const RIPPLE_ART = preload("res://Tiny Swords (Free Pack)/Terrain/Decorations/Rocks in the Water/Water Rocks_01.png")
const RIPPLE_SHADER = preload("res://shaders/shark_ripples.gdshader")
const RIPPLE_FPS := 5.0
const RIPPLE_SCALE := Vector2(3.5, 3.0)
var ripples: Sprite2D
var ripple_elapsed := 0.0
const SPEED := 24.0
const CLEARANCE := 6.0
const SAMPLE_STEP := 4.0
var world
var destination := Vector2.ZERO
var obstacles: Array[Rect2] = []
var geometry_inputs: Array = []
var roam_bounds := Rect2(120, -40, 912, 620)
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	texture = ART
	scale = Vector2.ONE * 0.55
	z_index = -18 # Above the ocean, below shoreline foam and solid terrain.
	ripples = Sprite2D.new()
	ripples.texture = RIPPLE_ART
	ripples.hframes = 16
	ripples.scale = RIPPLE_SCALE
	ripples.show_behind_parent = true
	var ripple_material := ShaderMaterial.new()
	ripple_material.shader = RIPPLE_SHADER
	ripples.material = ripple_material
	add_child(ripples)
	rng.randomize()
	position = Vector2(760, 430)
	refresh_obstacles()
	ensure_water_position()
	destination = position

func current_layout():
	if not "layout" in world:
		return null
	if world.terrain != null:
		return world.terrain.display_layout()
	return world.layout

func refresh_obstacles() -> void:
	var layout = current_layout()
	if layout == null:
		if not obstacles.is_empty(): return
		obstacles.assign([world.GRASS_BOUNDS, world.ISLET_BOUNDS])
	else:
		var inputs: Array = [layout.cells, layout.elevations, layout.stair_directions]
		if inputs == geometry_inputs: return
		geometry_inputs = inputs.duplicate(true)
		obstacles.clear()
		roam_bounds = Rect2(120, -40, 912, 620)
		for cell: Vector2i in layout.cells:
			# Reserve the top AND every cliff/support square down to water.
			# Shoreline stairs rise one tile above their water-level anchor.
			var height: float = layout.height_at(cell)
			if layout.cells[cell] == "stairs": height += layout.SIZE
			var origin: Vector2 = layout.ORIGIN + Vector2(cell) * layout.SIZE
			var solid := Rect2(origin - Vector2(0, height), Vector2(layout.SIZE, layout.SIZE + height))
			obstacles.append(solid)
			roam_bounds = roam_bounds.merge(solid.grow(320))
	# Static water rocks also keep the shark from disappearing behind artwork.
	for rock: Sprite2D in world.get_node("WaterRocks").get_children():
		var size := rock.texture.get_size() * rock.scale / Vector2(rock.hframes, rock.vframes)
		obstacles.append(Rect2(rock.position - size * 0.5, size))

func water_position(point: Vector2) -> bool:
	var half_size := texture.get_size() * scale.abs() * 0.5 + Vector2.ONE * CLEARANCE
	var footprint := Rect2(point - half_size, half_size * 2)
	# Visible ring pixels in the source occupy X 14..50, Y 28..50.
	var ripple_size := RIPPLE_SCALE * scale.abs()
	var ring := Rect2(point + Vector2(-18, -4) * ripple_size, Vector2(36, 22) * ripple_size)
	footprint = footprint.merge(ring.grow(CLEARANCE))
	if not roam_bounds.encloses(footprint): return false
	for solid in obstacles:
		if footprint.intersects(solid, true): return false
	return true

func water_segment(start: Vector2, finish: Vector2) -> bool:
	var steps := maxi(1, int(ceil(start.distance_to(finish) / SAMPLE_STEP)))
	for index in range(steps + 1):
		if not water_position(start.lerp(finish, float(index) / steps)): return false
	return true

func ensure_water_position() -> void:
	if water_position(position):
		show()
		return
	# Building/undo/restore may cover the current location. Relocate before
	# rendering a frame, or hide when the available water cannot fit the art.
	for radius in range(32, int(roam_bounds.size.length()) + 32, 32):
		for index in 32:
			var candidate := position + Vector2.from_angle(index * TAU / 32) * radius
			if water_position(candidate):
				position = candidate
				destination = candidate
				show()
				return
	hide()

func choose_destination() -> void:
	destination = position
	for attempt in 32:
		var candidate := position + Vector2.from_angle(rng.randf_range(0, TAU)) * rng.randf_range(80, 220)
		if water_segment(position, candidate):
			destination = candidate
			flip_h = destination.x > position.x # Original artwork faces left.
			return

func _process(delta: float) -> void:
	refresh_obstacles()
	ensure_water_position()
	if not visible or GamePresentation.reduced_motion: return
	ripple_elapsed += minf(delta, 0.1)
	ripples.frame = int(ripple_elapsed * RIPPLE_FPS) % 16
	var step := SPEED * minf(delta, 0.1)
	if position.distance_to(destination) < 0.1 or not water_segment(position, position.move_toward(destination, step)):
		choose_destination()
	var next := position.move_toward(destination, step)
	if water_segment(position, next):
		position = next
