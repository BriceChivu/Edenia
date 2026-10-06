extends Node

enum Phase { WAITING, TERRAIN, DUST, READY }
const PAWN_DELAY := 1.0
const REVEAL_DELAY := 0.1
const REVEAL_SECONDS := 0.2
const DustEffect = preload("res://scripts/dust_effect.gd")
var world
var phase := Phase.WAITING
var elapsed := 0.0
var effect: Node2D
var layer: CanvasLayer
var root: Control
var button: Button

func _ready() -> void:
	layer = CanvasLayer.new()
	layer.layer = 22
	add_child(layer)
	root = Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)
	button = preload("res://scenes/island_start.tscn").instantiate()
	root.add_child(button)
	button.pressed.connect(start)
	GameCopy.changed.connect(localize)
	localize()
	get_viewport().size_changed.connect(arrange)
	restore()

func arrange() -> void:
	world.ui.arrange()
	root.scale = Vector2.ONE * world.ui.scale_ui
	button.position = (get_viewport().get_visible_rect().size / root.scale - button.size) / 2

func restore() -> void:
	if is_instance_valid(effect):
		effect.queue_free()
	elapsed = 0.0
	phase = Phase.READY if world.island_started else Phase.WAITING
	apply_visibility()
	arrange()

func blocks_gameplay() -> bool:
	return phase != Phase.READY

func apply_visibility() -> void:
	var land_visible := phase != Phase.WAITING
	world.terrain.visible = land_visible
	world.get_node("World").visible = land_visible
	world.get_node("WaterRocks").visible = land_visible
	for node in world.get_children():
		if node.has_meta("terrain_shadow") or node.has_meta("terrain_backing"):
			node.visible = land_visible
	world.pawn.visible = phase == Phase.READY and not world.editing
	world.pawn.modulate.a = 1.0
	world.pawn.set_physics_process(phase == Phase.READY)
	world.ui.root.visible = phase == Phase.READY
	if world.playground != null:
		world.playground.root.visible = phase == Phase.READY
	button.visible = phase == Phase.WAITING

func start() -> void:
	if phase != Phase.WAITING or not world.playground_ready:
		return
	world.island_started = true
	phase = Phase.TERRAIN
	elapsed = 0.0
	world.world_pointer_down = null
	world.world_dragging = false
	world.pawn.walk_to(world.pawn.position)
	world.game_camera.position = world.pawn_view_center()
	apply_visibility()
	world.save_layout()

func _process(delta: float) -> void:
	button.disabled = not world.playground_ready
	if phase == Phase.WAITING:
		arrange()
	elif phase == Phase.TERRAIN:
		elapsed += delta
		if elapsed >= PAWN_DELAY:
			phase = Phase.DUST
			elapsed = 0.0
			effect = DustEffect.new()
			effect.position = world.pawn.position
			effect.z_index = world.pawn.z_index + 1
			effect.setup_dust(world.ground_height(world.pawn.position))
			world.get_node("World").add_child(effect)
			effect.visible = not GamePresentation.reduced_motion
	elif phase == Phase.DUST:
		elapsed += delta
		if is_instance_valid(effect):
			effect.visible = not GamePresentation.reduced_motion
		world.pawn.visible = elapsed >= REVEAL_DELAY
		world.pawn.modulate.a = 1.0 if GamePresentation.reduced_motion else clampf((elapsed - REVEAL_DELAY) / REVEAL_SECONDS, 0.0, 1.0)
		if not is_instance_valid(effect):
			phase = Phase.READY
			apply_visibility()
			world.refresh()

func localize() -> void:
	button.text = GameCopy.text("start")
	button.accessibility_name = button.text
	GameCopy.font(button)
