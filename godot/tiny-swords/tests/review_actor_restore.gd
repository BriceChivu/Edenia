extends SceneTree
var failures:=0
func check(ok: bool, message: String) -> void:
	if not ok:
		failures+=1
		push_error(message)
func _initialize() -> void:
	run.call_deferred()
func run() -> void:
	var game=load('res://previews/review_sandbox.tscn').instantiate()
	game.review_persistence_enabled=false
	game.review_stock_enabled=false
	root.add_child(game)
	await process_frame
	game.selected_id=1
	var pawn: Dictionary=game.selected_item()
	pawn.hidden=true
	pawn.point=[game.ORIGIN_POINT.x-150,game.ORIGIN_POINT.y-20]
	pawn.alpha=0
	var id: int=game.insert_item('portal',1,game.ORIGIN_POINT+Vector2(120,100))
	game.selected_id=id
	game.selected_item().occupants=['pawn']
	game.apply_items()
	game.refresh_review_ui()
	check(not game.pawn.visible,'Fixture reproduces an absorbed pawn')
	check(game.movement_review.actor_picker.get_item_index(1)>=0,'Pawn is selectable even when absorbed')
	if game.has_method('restore_review_pawn'):
		check(game.restore_review_pawn(),'Pawn can return to clear ground')
		check(game.pawn.visible and not game.pawn.portal_absorbed and game.pawn.sprite.modulate.a==1,'Restored pawn has a visible native pose')
		check(game.contact_rules.error_for(game.layout,game.items,game.selected_item(),game.pawn.position,1).is_empty(),'Restored pawn avoids the tree contact area')
		for item in game.items:
			if item.kind=='portal': check(not item.occupants.has('pawn'),'Restoration removes the pawn from portal occupants')
	game.queue_free()
	await process_frame
	print('Review pawn restoration: ','PASS' if failures==0 else 'FAIL')
	quit(0 if failures==0 else 1)
