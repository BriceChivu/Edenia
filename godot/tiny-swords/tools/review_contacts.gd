extends RefCounted

const ReviewLayout = preload('res://tools/review_layout.gd')
const ACTORS := ['pawn','sheep','chicken']
const SOLIDS := ['tree','land_rock','house','logs']
var probe = ReviewLayout.new()

# Use the game's authored contact geometry, never the sprite's full rectangle.
func patch(item: Dictionary, point: Vector2) -> PackedVector2Array:
	var slot := probe.register_object(0,item.kind,point)
	match item.kind:
		'tree': return probe.tree_footprint(point,probe.TREE_VARIANTS[int(item.variant)-1])
		'land_rock':
			probe.decorations[slot] = {'kind':'land_rock','variant':int(item.variant)}
			return probe.rock_footprint(slot)
		'house': return probe.house_footprint(slot,int(item.variant)-1,Vector2.ZERO)
		'logs': return probe.log_footprint(slot,int(item.variant))
		'pawn','sheep','chicken':
			var depth := 7.0 if item.kind=='pawn' else 2.0
			return rectangle(point,7,depth)
	return PackedVector2Array()

func rectangle(point: Vector2, width: float, depth: float) -> PackedVector2Array:
	return PackedVector2Array([point+Vector2(-width,-depth),point+Vector2(width,-depth),point+Vector2(width,depth),point+Vector2(-width,depth)])

func overlap(a: PackedVector2Array, b: PackedVector2Array) -> bool:
	return not a.is_empty() and not b.is_empty() and not Geometry2D.intersect_polygons(a,b).is_empty()

func active(item: Dictionary) -> bool:
	return not item.get('hidden',false) and not (item.kind=='logs' and int(item.variant)==0)

func height(layout, point: Vector2) -> float:
	var bridge: Vector2i = layout.BridgeRules.owner(layout,layout.cell_at(point))
	if layout.bridges.has(bridge): return layout.BridgeRules.height(layout,bridge,point.x)
	return layout.surface_height(point)

func support_error(layout, item: Dictionary, point: Vector2) -> String:
	if item.kind in ACTORS:
		var bridge: Vector2i = layout.BridgeRules.owner(layout,layout.cell_at(point))
		if layout.bridges.has(bridge) and absf(point.y-layout.center(bridge).y)<=7: return ''
		if not layout.terrain_feet_free(point,item.kind!='pawn'): return 'Feet need supported ground; avoid water and cliff edges.'
	elif item.kind in SOLIDS:
		if not layout.terrain_supports_contact(patch(item,point),layout.surface_height(point)):
			return 'The whole contact area needs flat ground on the same floor.'
	return ''

func error_for(layout, items: Array, item: Dictionary, point: Vector2, ignored_id: int = -1) -> String:
	var support := support_error(layout,item,point)
	if not support.is_empty(): return support
	var own := patch(item,point)
	var own_solid: bool = item.kind in SOLIDS
	var own_actor: bool = item.kind in ACTORS
	for other in items:
		if int(other.id)==ignored_id or not active(other): continue
		var other_solid: bool = other.kind in SOLIDS
		var other_actor: bool = other.kind in ACTORS
		if not other_solid and not (own_solid and other_actor) and not (own_actor and other_actor): continue
		var other_point := Vector2(float(other.point[0]),float(other.point[1]))
		if absf(height(layout,point)-height(layout,other_point))>0.01: continue
		var target := patch(other,other_point)
		var candidate := own
		# The pawn's two boot poses span a wider, shallower strip against logs.
		if item.kind=='pawn' and other.kind=='logs': candidate = rectangle(point,20,1)
		if item.kind=='logs' and other.kind=='pawn': target = rectangle(other_point,20,1)
		var blocked := overlap(candidate,target) if not candidate.is_empty() else Geometry2D.is_point_in_polygon(point,target)
		if blocked: return 'Blocked by %s contact area.'%str(other.kind).replace('_',' ')
	return ''
