extends RefCounted

const KINDS := ['grass','stairs','bridge']

func cells_for(item: Dictionary, cell: Vector2i) -> Array:
	if item.kind=='bridge': return [cell+Vector2i.LEFT,cell,cell+Vector2i.RIGHT,cell+Vector2i(2,0)]
	if item.kind=='stairs': return [cell,cell+(Vector2i.RIGHT if int(item.variant)==1 else Vector2i.LEFT)]
	return [cell]

func overlaps(review, item: Dictionary, cell: Vector2i, ignored_id: int = -1) -> bool:
	var cells := cells_for(item,cell)
	for other in review.items:
		if int(other.id)==ignored_id or other.kind not in KINDS: continue
		for occupied in cells_for(other,review.layout.cell_at(review.item_point(other))):
			if occupied in cells: return true
	return false

func place(layout, item: Dictionary, cell: Vector2i) -> void:
	var underlay: Array = []
	for target in cells_for(item,cell):
		underlay.append([target.x,target.y,layout.cells.get(target),layout.height_at(target),layout.stair_directions.get(target,Vector2i.RIGHT).x])
	item.terrain_underlay = underlay
	var floor_height := float(item.get('floor',0))*64
	if item.kind=='bridge':
		floor_height = maxf(64,floor_height)
		for bank in layout.BridgeRules.ends(cell):
			layout.cells[bank] = layout.kind_at_height(floor_height)
			layout.elevations[bank] = floor_height
			layout.stair_directions.erase(bank)
		for gap in [cell,cell+Vector2i.RIGHT]:
			layout.cells.erase(gap)
			layout.elevations.erase(gap)
			layout.stair_directions.erase(gap)
		layout.bridges[cell] = floor_height
	else:
		layout.cells[cell] = 'stairs' if item.kind=='stairs' else layout.kind_at_height(floor_height)
		layout.elevations[cell] = floor_height
		layout.stair_directions.erase(cell)
		if item.kind=='stairs':
			var direction := Vector2i.RIGHT if int(item.variant)==1 else Vector2i.LEFT
			layout.stair_directions[cell] = direction
			layout.cells[cell+direction] = layout.kind_at_height(floor_height+64)
			layout.elevations[cell+direction] = floor_height+64

func restore(layout, item: Dictionary, cell: Vector2i) -> void:
	if item.kind=='bridge': layout.bridges.erase(cell)
	for tile in item.get('terrain_underlay',[]):
		var target := Vector2i(int(tile[0]),int(tile[1]))
		layout.stair_directions.erase(target)
		if tile[2]==null:
			layout.cells.erase(target)
			layout.elevations.erase(target)
		else:
			layout.cells[target] = tile[2]
			layout.elevations[target] = float(tile[3])
			if tile[2]=='stairs': layout.stair_directions[target] = Vector2i(int(tile[4]),0)
