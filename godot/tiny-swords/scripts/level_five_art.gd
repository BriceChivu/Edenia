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
	return Rect2(layout.center(cell) - Vector2(32, 96 + layout.height_at(cell)), Vector2(128, 192))

static func sheep_rect(layout, cell: Vector2i) -> Rect2:
	return Rect2(layout.center(cell) - Vector2(64, 72 + layout.height_at(cell)), Vector2(128, 128))
