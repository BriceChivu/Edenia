extends Node2D

signal splash_started
signal respawned

enum WaterPhase { READY, APPROACHING, FALLING, SPLASH, WAITING, RESPAWNING }
const GRASS_BOUNDS := Rect2(512, 176, 128, 128)
const ISLET_BOUNDS := Rect2(712, 308, 64, 64)
const FOOT_MARGIN := Vector2(12, 12)
const RESPAWN_DELAY := 1.0
const SPAWN := Vector2(576, 240)
const CURSOR := preload("res://art/Cursor_02.png")
var water_phase: WaterPhase = WaterPhase.READY
@onready var pawn = $World/Pawn
@onready var splash: AnimatedSprite2D = $WaterSplash

func _ready() -> void:
	$Water.z_index = -20
	$Reflections.z_index = -19
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
	var edge := point.clamp(GRASS_BOUNDS.position + FOOT_MARGIN,
		GRASS_BOUNDS.end - FOOT_MARGIN)
	var landing := edge + (point - edge).normalized() * 42.0
	pawn.walk_to(edge)
	while pawn.position.distance_to(edge) > 0.1:
		await get_tree().physics_frame

	water_phase = WaterPhase.FALLING
	pawn.set_physics_process(false)
	# Match the pack demo: a short upright step/hop, then sink at the splash.
	pawn.sprite.play("run")
	var step_off := create_tween()
	step_off.tween_method(func(progress: float) -> void:
		pawn.position = edge.lerp(landing, progress) + Vector2(0, -sin(progress * PI) * 16.0)
	, 0.0, 1.0, 0.4)
	await step_off.finished

	water_phase = WaterPhase.SPLASH
	pawn.sprite.play("idle")
	splash.position = landing
	splash.frame = 0
	splash.show()
	splash.play("splash")
	splash_started.emit()
	var sink := create_tween().set_parallel(true)
	sink.tween_property(pawn.sprite, "position:y", -12.0, 0.2)
	sink.tween_property(pawn.sprite, "modulate:a", 0.0, 0.2)
	await splash.animation_finished
	splash.hide()
	water_phase = WaterPhase.WAITING
	await get_tree().create_timer(RESPAWN_DELAY).timeout

	water_phase = WaterPhase.RESPAWNING
	pawn.position = SPAWN
	pawn.destination = SPAWN
	pawn.sprite.position = Vector2(0, -32)
	pawn.sprite.rotation = 0.0
	pawn.sprite.play("idle")
	var appear := create_tween()
	appear.tween_property(pawn.sprite, "modulate:a", 1.0, 0.25)
	await appear.finished
	pawn.set_physics_process(true)
	water_phase = WaterPhase.READY
	respawned.emit()
