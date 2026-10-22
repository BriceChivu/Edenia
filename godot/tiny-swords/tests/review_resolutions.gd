extends SceneTree
const Resolutions=preload('res://tools/review_resolutions.gd')
func _initialize() -> void:
	var notes: Array=Resolutions.COMPLETED.duplicate(true)
	var newer: Dictionary=notes[0].duplicate()
	newer.created_at='2026-10-22T20:00:00'
	notes.append(newer)
	var result:=Resolutions.partition(notes,[])
	var again:=Resolutions.partition(result.pending,result.resolved)
	var ok: bool=result.pending==[newer] and result.resolved.size()==10 and again.resolved==result.resolved and Resolutions.next_id(result.pending,result.resolved)==11
	print('Resolved review archive: ','PASS' if ok else 'FAIL')
	quit(0 if ok else 1)
