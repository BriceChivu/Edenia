extends SceneTree
var failures := 0
func check(ok: bool, label: String) -> void:
 if not ok:
  failures += 1
  push_error(label)
func _initialize() -> void:
 run.call_deferred()
func run() -> void:
 var level = load("res://previews/level_two.tscn").instantiate()
 root.add_child(level)
 await process_frame
 level.ui.buttons.ground.pressed.emit()
 check(level.editing and level.ui.panel.visible, "Selecting artwork keeps strip open")
 level.pointer_inside = true
 level.terrain.valid = true
 level.update_cursor()
 check(level.cursor_mode == "place" and level.pointer.visible and level.pointer.texture == level.UI_CURSOR, "Valid placement keeps a freely moving pointer visible beside the terrain preview")
 var previous_pointer: Vector2 = level.pointer.position
 level.pointer_position += Vector2(0.5, 0.25)
 level.update_cursor()
 check((level.pointer.position - previous_pointer).is_equal_approx(Vector2(0.5, 0.25)), "Placement pointer follows subpixel movement without snapping to the grid")
 level.ui.action_buttons[0].pressed.emit()
 level.terrain.valid = true
 level.update_cursor()
 check(level.cursor_mode == "build" and level.pointer.visible and level.pointer.texture == level.build_cursor, "Pickup uses cursor four")
 level.ui.buttons.ground.pressed.emit()

 check(level.apply_edit(Vector2i(2,1)), "Place first ground")
 check(level.editing, "Partial inventory keeps strip open")
 check(level.ui.buttons.ground.get_node("Remaining").text == "×2", "Ground counter updates after placement")
 check(level.apply_edit(Vector2i(3,1)) and level.apply_edit(Vector2i(4,1)), "Use remaining ground")
 check(level.editing and not level.ui.buttons.ground.disabled and not level.ui.buttons.stairs.disabled, "One depleted type does not close strip")
 level.ui.buttons.stairs.pressed.emit()
 check(level.apply_edit(Vector2i(2,0)), "Place final stair bundle")
 check(not level.editing and not level.ui.panel.visible and level.ui.launch.visible, "Final placement exits building and closes strip")
 level.ui.launch.pressed.emit()
 check(level.editing and level.ui.panel.visible and not level.ui.undo_button.disabled, "Empty inventory reopens with undo retained")
 level.ui.action_buttons[0].pressed.emit()
 level.terrain.hover = Vector2i(2,0)
 level.terrain.valid = true
 level.update_cursor()
 check(level.pointer.texture.get_size() == Vector2(71,71), "Stair pickup keeps the standard pointer size")
 var cursor_position: Vector2 = level.pointer.position
 level.pointer_position += Vector2(5,3)
 level.update_cursor()
 check(level.pointer.position - cursor_position == Vector2(5,3), "Wide pickup cursor still follows the mouse freely")
 level.terrain.hover = Vector2i(0,1)
 level.update_cursor()
 check(level.pointer.texture.get_size() == Vector2(71,71), "Ordinary tile pickup returns to one square")

 level.ui.undo_button.pressed.emit()
 check(level.layout.stock.stairs == 1 and level.editing, "Undo restores final item without closing strip")
 check(level.ui.buttons.stairs.get_node("Remaining").text == "×1", "Undo updates item counter")
 level.ui.buttons.stairs.pressed.emit()
 check(level.apply_edit(Vector2i(2,0)), "Replace last stair bundle")
 level.ui.launch.pressed.emit()
 level.ui.action_buttons[0].pressed.emit()
 check(level.editing and level.apply_edit(Vector2i(4,1)) and level.layout.ground_count() == 1, "Pickup from empty inventory restores ground")
 level.ui.done_button.pressed.emit()
 check(not level.editing and level.ui.launch.visible, "Exit icon returns to walking")
 level.layout.unlock(3)
 level.ui.launch.pressed.emit()
 check(not level.ui.buttons.tree.disabled, "Level three makes pine artwork available")
 level.ui.buttons.ground.pressed.emit()
 for cell in [Vector2i(-1,0),Vector2i(-1,1),Vector2i(-2,0),Vector2i(-3,1)]:
  check(level.apply_edit(cell), "Place level-three ground")
 level.ui.buttons.stairs.pressed.emit()
 check(level.apply_edit(Vector2i(-3,0)) and level.editing, "Tree remaining keeps level-three toolbar open")
 level.ui.action_buttons[0].pressed.emit()
 level.terrain.hover = Vector2i(-3,0)
 level.terrain.valid = true
 level.update_cursor()
 check(level.pointer.texture.get_size() == Vector2(71,71) and is_equal_approx(level.pointer.position.x, level.pointer_position.x - 35.5), "Left-facing stairs keep the pointer centered")
 level.ui.buttons.tree.pressed.emit()
 check(level.apply_edit(Vector2i(0,1)) and not level.editing, "Final pine placement closes level-three toolbar")
 level.ui.launch.pressed.emit()
 var escape := InputEventKey.new()
 escape.keycode = KEY_ESCAPE
 escape.pressed = true
 level._input(escape)
 check(not level.editing and not level.ui.panel.visible and not level.ui.done_button.visible, "Escape exits build mode and hides its cross")
 level.queue_free()
 await process_frame
 print("Inventory strip checks: ", "PASS" if failures == 0 else "FAIL")
 quit(0 if failures == 0 else 1)
