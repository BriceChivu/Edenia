extends Node2D

signal splash_started
signal respawned

enum WaterPhase { READY, APPROACHING, FALLING, SPLASH, WAITING, RESPAWNING }
const GRASS_BOUNDS := Rect2(512, 176, 128, 128)
const ISLET_BOUNDS := Rect2(712, 308, 64, 64)
const FOOT_MARGIN := Vector2(12, 12)
const RESPAWN_DELAY := 1.0
const WaterFall = preload("res://scripts/water_fall.gd")
const SPAWN := Vector2(576, 240)
const CURSOR := preload("res://Tiny Swords (Free Pack)/UI Elements/UI Elements/Cursors/Cursor_02.png")
var water_phase: WaterPhase = WaterPhase.READY
@onready var pawn = $World/Pawn
@onready var splash: AnimatedSprite2D = $WaterSplash

func _ready() -> void:
	splash.reparent($World)
	# Water effects sit below solid shores and rocks, including foreground land.
	splash.z_index = -18
	$Water.z_index = -20
	$IslandShadows.z_index = -18
	$ShoreFoam.z_index = -17
	$Islands.z_index = -16
	$WaterRocks.z_index = -15
	Input.set_custom_mouse_cursor(CURSOR, Input.CURSOR_ARROW, Vector2(24, 18))

func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)

func _unhandled_input(event: InputEvent) -> void:
	if water_phase != WaterPhase.READY:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var point: Vector2 = get_global_transform_with_canvas().affine_inverse() * event.position
		if GRASS_BOUNDS.has_point(point):
			pawn.walk_to(point.clamp(GRASS_BOUNDS.position + FOOT_MARGIN,
				GRASS_BOUNDS.end - FOOT_MARGIN))
		elif not ISLET_BOUNDS.has_point(point):
			fall_into_water(point)

func fall_into_water(point: Vector2) -> void:
	water_phase = WaterPhase.APPROACHING
	var edge := point.clamp(GRASS_BOUNDS.position + Vector2(32, 32),
		GRASS_BOUNDS.end - Vector2(32, 32))
	if pawn.position.distance_to(edge) < 32.0:
		edge = pawn.position
	var direction := (point - edge).normalized()
	pawn.walk_to(edge)
	while pawn.position.distance_to(edge) > 0.1:
		await get_tree().physics_frame
	await perform_water_fall(edge, direction, 0.0, SPAWN, 0.0)

func perform_water_fall(start: Vector2, direction: Vector2, height: float, spawn: Vector2, spawn_height: float) -> void:
	water_phase = WaterPhase.FALLING
	pawn.set_physics_process(false)
	pawn.sprite.stop()
	# Pose changes remain at 10 fps; the trajectory runs at the renderer's rate.
	WaterFall.apply_pose(pawn, 0, start, direction, height)
	var motion := create_tween()
	motion.tween_method(func(seconds: float) -> void:
		var frame := WaterFall.apply_motion(pawn, seconds, start, direction, height)
		WaterFall.align_splash(splash, pawn, frame, start, direction)
		if frame >= WaterFall.CONTACT_FRAME and water_phase == WaterPhase.FALLING:
			water_phase = WaterPhase.SPLASH
			pawn.z_index = 0
			splash.stop()
			splash.frame = 0
			splash.show()
			splash.play("splash")
			splash_started.emit()
	, 0.0, 7 * WaterFall.FRAME_SECONDS, 7 * WaterFall.FRAME_SECONDS)
	await motion.finished
	await splash.animation_finished
	splash.hide()
	water_phase = WaterPhase.WAITING
	await get_tree().create_timer(RESPAWN_DELAY).timeout
	water_phase = WaterPhase.RESPAWNING
	pawn.position = spawn
	pawn.destination = spawn
	pawn.z_index = int(ceil(spawn_height / 64.0))
	pawn.sprite.position = Vector2(0, -32 - spawn_height)
	pawn.sprite.rotation = 0.0
	pawn.sprite.play("idle")
	var appear := create_tween()
	appear.tween_property(pawn.sprite, "modulate:a", 1.0, 0.25)
	await appear.finished
	pawn.set_physics_process(true)
	water_phase = WaterPhase.READY
	respawned.emit()
