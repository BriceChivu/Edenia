extends Sprite2D

const FRAMES := [
	preload("res://assets/chicken/frame_00.png"),
	preload("res://assets/chicken/frame_01.png"),
	preload("res://assets/chicken/frame_02.png"),
	preload("res://assets/chicken/frame_03.png"),
	preload("res://assets/chicken/frame_04.png"),
	preload("res://assets/chicken/frame_05.png"),
]
const FRAME_MS := 100

func _process(_delta: float) -> void:
	texture = FRAMES[int(Time.get_ticks_msec() / FRAME_MS) % FRAMES.size()]
