extends RefCounted

## Paused experiment. Flip this flag to resume the bridge trial.
const ENABLED := false

const TEXTURE = preload("res://assets/bridges/wooden-rope-bridge-horizontal.png")
const ART_OFFSET := Vector2(0, -25)
const SAG := 20.0

static func ends(start: Vector2i) -> Array[Vector2i]:
	return [start + Vector2i.LEFT, start + Vector2i(2, 0)]

static func valid(layout, start: Vector2i) -> bool:
	var banks := ends(start)
	if not layout.cells.has(banks[0]) or not layout.cells.has(banks[1]):
		return false
	var height: float = layout.height_at(banks[0])
	if height <= 0 or height != layout.height_at(banks[1]):
		return false
	for bank in banks:
		if layout.cells[bank] == "stairs" or layout.trees.has(bank):
			return false
	for gap in [start, start + Vector2i.RIGHT]:
		if not layout.in_bounds(gap) or layout.trees.has(gap) or layout.cells.get(gap) == "stairs":
			return false
		if layout.cells.has(gap) and layout.height_at(gap) >= height:
			return false
		for existing in layout.bridges:
			if gap in [existing, existing + Vector2i.RIGHT]:
				return false
	return true

static func candidate(layout, cell: Vector2i) -> Vector2i:
	return cell if valid(layout, cell) else cell + Vector2i.LEFT

static func owner(layout, cell: Vector2i) -> Vector2i:
	if not layout.bridges_enabled:
		return Vector2i(999, 999)
	for start in layout.bridges:
		if cell in [start, start + Vector2i.RIGHT]:
			return start
	return Vector2i(999, 999)

static func touches(layout, cell: Vector2i) -> bool:
	if not layout.bridges_enabled:
		return false
	for start in layout.bridges:
		if cell in ends(start) or cell in [start, start + Vector2i.RIGHT]:
			return true
	return false

static func height(layout, start: Vector2i, x: float) -> float:
	var progress := clampf((x - layout.ORIGIN.x - start.x * 64) / 128.0, 0, 1)
	# The same curve drives feet height, deck hit testing and the walking lane.
	return float(layout.bridges.get(start, layout.height_at(start + Vector2i.LEFT))) - SAG * 4 * progress * (1 - progress)

static func art_rect(layout, start: Vector2i) -> Rect2:
	var elevation: float = layout.bridges.get(start, layout.height_at(start + Vector2i.LEFT))
	return Rect2(layout.ORIGIN + Vector2(start) * 64 - Vector2(0, elevation) + ART_OFFSET, Vector2(128, 128))

static func hit(layout, point: Vector2) -> Vector2i:
	if not layout.bridges_enabled:
		return Vector2i(999, 999)
	for start in layout.bridges:
		var rect := art_rect(layout, start)
		var pixel := Vector2i((point - rect.position).floor())
		if pixel.x >= 0 and pixel.x < 128 and pixel.y >= 0 and pixel.y < 128 and TEXTURE.get_image().get_pixelv(pixel).a > 0.1:
			return start
	return Vector2i(999, 999)

static func spans(layout, start: Vector2i, a: Vector2, b: Vector2) -> bool:
	if not layout.bridges_enabled:
		return false
	var banks := ends(start)
	var left: Vector2 = layout.center(banks[0])
	var right: Vector2 = layout.center(banks[1])
	if absf(a.y - left.y) > 7 or absf(b.y - left.y) > 7:
		return false
	return minf(a.x, b.x) >= left.x and maxf(a.x, b.x) <= right.x
