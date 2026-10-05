extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var pawn = preload("res://scenes/pawn.tscn").instantiate()
	root.add_child(pawn)
	pawn.set_physics_process(false)
	var pixels: Image = pawn.sprite.sprite_frames.get_frame_texture("idle", 0).get_image()
	var bottom := pixels.get_used_rect().end.y - 1
	var feet_y: float = pawn.sprite.position.y + bottom - pixels.get_height() / 2.0
	print("Lowest foot pixel relative to movement anchor: ", feet_y)
	var depth = pawn.get_node_or_null("FootDepth")
	if depth == null or not is_equal_approx(depth.position.y, feet_y):
		push_error("Pawn depth must follow its lowest foot pixel, so a bush between movement anchor and feet draws behind it")
		quit(1)
		return
	if not pawn.y_sort_enabled or not is_equal_approx(pawn.sprite.position.y + depth.position.y + pawn.sprite.offset.y, -32.0):
		push_error("Foot sorting must preserve the sprite position and enable nested Y sorting")
		quit(1)
		return
	print("PASS: Pawn sorts at lowest foot pixel without moving its artwork")
	quit()
