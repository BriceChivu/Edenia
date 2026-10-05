extends RefCounted

const HOUSE_TEXTURES := [
	preload("res://Tiny Swords (Free Pack)/Buildings/Blue Buildings/House1.png"),
	preload("res://Tiny Swords (Free Pack)/Buildings/Blue Buildings/House2.png"),
	preload("res://Tiny Swords (Free Pack)/Buildings/Blue Buildings/House3.png"),
	preload("res://Tiny Swords (Free Pack)/Buildings/Blue Buildings/House2.png"),
]
const SHEEP_IDLE = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Meat/Sheep/Sheep_Idle.png")
const SHEEP_GRASS = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Meat/Sheep/Sheep_Grass.png")
const SHEEP_RUN = preload("res://Tiny Swords (Free Pack)/Terrain/Resources/Meat/Sheep/Sheep_Move.png")

static func house_rect(layout, cell: Vector2i) -> Rect2:
	return Rect2(layout.center(cell) + layout.house_offsets.get(cell, Vector2.ZERO) - Vector2(32, 96 + layout.height_at(cell)), Vector2(128, 192))

static func sheep_rect(layout, cell: Vector2i) -> Rect2:
	return Rect2(layout.center(cell) - Vector2(64, 72 + layout.height_at(cell)), Vector2(128, 128))

const CHICKEN_SCALE := 0.595
const CHICKEN_OFFSET := Vector2(0, -39)
const CHICKEN = preload("res://assets/chicken.png")
const CHICKEN_IDLE = preload("res://assets/chicken/chicken_idle.png")
const CHICKEN_EATING = preload("res://assets/chicken/chicken_eating.png")
const CHICKEN_RUN = preload("res://assets/chicken/chicken_run.png")

static func chicken_rect(layout, cell: Vector2i) -> Rect2:
	var size := CHICKEN.get_size() * CHICKEN_SCALE
	return Rect2(layout.center(cell) - Vector2(0, layout.height_at(cell)) + CHICKEN_OFFSET * CHICKEN_SCALE - size / 2, size)

static func house_depth_y(layout, cell: Vector2i, facing: int) -> float:
	if facing == 0:
		# Front view sorts at the annotated bottom edge in the ground plane.
		return layout.house_footprint(cell, facing)[2].y
	if facing in [1, 3]:
		# Either cyan side corner defines the horizontal perspective line.
		# Use the first annotated corner (PNG y=148), including its mirror.
		return layout.house_footprint(cell, facing)[0].y
	# Back view uses the bottom wall edge, above the two projecting posts.
	return layout.house_footprint(cell, facing)[4].y
