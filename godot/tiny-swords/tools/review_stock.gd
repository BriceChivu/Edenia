extends RefCounted

const TERRAIN := ['grass','stairs','bridge']
const WATER := ['water_rock','ducks']

func key(item: Dictionary) -> String:
	if item.kind=='pawn': return 'pawn'
	return '%s:%d:%d'%[item.kind,int(item.variant),int(item.get('floor',0)) if item.kind=='grass' else int(item.get('stump',false))]

func represented(review, choice: Dictionary) -> bool:
	var wanted := key(choice)
	for item in review.items:
		if key(item)==wanted and (int(item.variant)>0 or item.kind=='pawn'): return true
	return false

func needed_choices(review) -> Array:
	var result: Array = []
	for choice in review.catalog_choices():
		if choice.kind=='water' or (choice.kind=='pawn' and int(choice.variant)==2): continue
		result.append(choice)
	return result

func last_example(review, item: Dictionary) -> bool:
	var count := 0
	for other in review.items:
		if key(other)==key(item): count+=1
	return count<=1

func populate(review) -> bool:
	var missing: Array = []
	for choice in needed_choices(review):
		if not represented(review,choice): missing.append(choice)
	if missing.is_empty(): return false
	# Expand around the saved island; never fill its deliberately removed water.
	var first := Vector2i(100000,100000)
	var last := -first
	for cell in review.layout.cells:
		first = first.min(cell)
		last = last.max(cell)
	for y in range(-7,11):
		for x in range(-14,18):
			var cell := Vector2i(x,y)
			if not review.layout.cells.has(cell) and (x<first.x or x>last.x or y<first.y or y>last.y):
				review.layout.cells[cell] = 'meadow'
				review.layout.elevations[cell] = 0
	# Structural samples are laid out before the movable props.
	missing.sort_custom(func(a,b): return int(a.kind in TERRAIN)>int(b.kind in TERRAIN))
	for choice in missing:
		var placed := false
		for y in range(-6,10,3):
			for x in range(-13,18,3):
				var cell := Vector2i(x,y)
				var point: Vector2 = review.layout.center(cell)
				var nearby := false
				for item in review.items:
					if review.item_point(item).distance_to(point)<150:
						nearby = true
						break
				if nearby: continue
				if choice.kind in TERRAIN:
					if not review.add_terrain_sample(choice,cell): continue
				elif choice.kind in WATER:
					for offset in [Vector2i.ZERO,Vector2i.RIGHT,Vector2i.DOWN,Vector2i.ONE]:
						review.layout.cells.erase(cell+offset)
						review.layout.elevations.erase(cell+offset)
					review.insert_item(choice.kind,int(choice.variant),point)
				else:
					if not review.contact_rules.error_for(review.layout,review.items,choice,point).is_empty(): continue
					var id: int = review.insert_item(choice.kind,int(choice.variant),point)
					for item in review.items:
						if int(item.id)==id: item.stump = choice.get('stump',false)
				placed = true
				break
			if placed: break
		if not placed: push_warning('No clear review sample space for '+str(choice.name))
	return true
