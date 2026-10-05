extends Node2D

## Foam has its own retained canvas commands, below the static grass surface.
var terrain
var keys: Array = []
var phase := -1

func update_frame(cells: Array, tick: int) -> void:
	if keys == cells and phase == tick:
		return
	keys = cells
	phase = tick
	queue_redraw()

func _draw() -> void:
	for cell in keys:
		var p: Vector2 = terrain.layout.ORIGIN + Vector2(cell) * 64
		var frame := (phase + absi(cell.x * 7 + cell.y * 11)) % 16
		draw_texture_rect_region(terrain.foam, Rect2(p - Vector2(32, 32), Vector2(128, 128)), Rect2(frame * 192 + 32, 32, 128, 128))
