extends RefCounted

# Measured from Particle FX_07.gif frames 14–21 (zero-based), at 100 ms/frame.
# Position is relative to the last idle pose; artwork remains at native scale.
const FRAME_SECONDS := 0.1
const CONTACT_FRAME := 5
const TRAVEL := [3.0, 6.0, 15.0, 26.0, 43.0, 53.0, 59.0, 69.0]
const VERTICAL := [0.0, 0.0, 1.0, -7.0, -7.0, -1.0, 18.0, 32.0]
const OPACITY := [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.7, 0.0]
const SPLASH_DISTANCE := 69.0
const SPLASH_DROP := 3.0

static func apply_pose(pawn, frame: int, start: Vector2, direction: Vector2, height: float) -> void:
	var index := clampi(frame, 0, 7)
	pawn.position = start + direction * TRAVEL[index]
	pawn.sprite.position = Vector2(0, -32 + VERTICAL[index] - height * (1.0 - minf(float(index) / CONTACT_FRAME, 1.0)))
	pawn.sprite.animation = &"run"
	pawn.sprite.set_frame_and_progress(index % 6, 0.0)
	pawn.sprite.modulate.a = OPACITY[index]
	pawn.sprite.rotation = 0.0
	if absf(direction.x) > 0.01:
		pawn.sprite.flip_h = direction.x < 0

static func align_splash(splash: AnimatedSprite2D, pawn, frame: int, start: Vector2, direction: Vector2) -> void:
	var contact := start + direction * SPLASH_DISTANCE + Vector2(0, SPLASH_DROP)
	# The source pawn covers the first two splash frames, rather than the rim
	# covering his face. Keep both in World depth sorting for foreground trees.
	splash.position = contact
	splash.offset = Vector2.ZERO
	if frame < 7:
		splash.position.y = pawn.position.y - 0.01
		splash.offset.y = contact.y - splash.position.y

static func apply_motion(pawn, seconds: float, start: Vector2, direction: Vector2, height: float) -> int:
	var phase := clampf(seconds / FRAME_SECONDS, 0.0, 7.0)
	var index := mini(7, int(floorf(phase + 0.00001)))
	var next := mini(7, index + 1)
	var weight := clampf(phase - index, 0.0, 1.0)
	# The GIF samples motion at 10 fps; retain its poses without also limiting
	# world movement to 10 fps. Every measured key position is still preserved.
	apply_pose(pawn, index, start, direction, height)
	pawn.position = start + direction * lerpf(TRAVEL[index], TRAVEL[next], weight)
	pawn.sprite.position.y = -32 + lerpf(VERTICAL[index], VERTICAL[next], weight) - height * (1.0 - minf(phase / CONTACT_FRAME, 1.0))
	return index
