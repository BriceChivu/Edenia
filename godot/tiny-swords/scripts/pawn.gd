extends Node2D

@export var speed: float = 70.0
@onready var sprite: AnimatedSprite2D = $Sprite
var destination: Vector2
var axe_equipped := false
var chopping := false
var carrying_wood := false
# Movement stays at its existing anchor; drawing sorts at the bottom foot pixel.
const FOOT_DEPTH_Y := 6.0
const AXE_ATLASES := {
	"wood_idle": preload("res://Tiny Swords (Free Pack)/Units/Blue Units/Pawn/Pawn_Idle Wood.png"),
	"wood_run": preload("res://Tiny Swords (Free Pack)/Units/Blue Units/Pawn/Pawn_Run Wood.png"),
	"axe_idle": preload("res://Tiny Swords (Free Pack)/Units/Blue Units/Pawn/Pawn_Idle Axe.png"),
	"axe_run": preload("res://Tiny Swords (Free Pack)/Units/Blue Units/Pawn/Pawn_Run Axe.png"),
	"axe_interact": preload("res://Tiny Swords (Free Pack)/Units/Blue Units/Pawn/Pawn_Interact Axe.png"),
}

func _ready() -> void:
	y_sort_enabled = true
	var foot_depth := Node2D.new()
	foot_depth.name = "FootDepth"
	foot_depth.position.y = FOOT_DEPTH_Y
	add_child(foot_depth)
	sprite.reparent(foot_depth, false)
	sprite.offset.y -= FOOT_DEPTH_Y
	destination = position
	sprite.sprite_frames = sprite.sprite_frames.duplicate()
	for animation in AXE_ATLASES:
		var texture: Texture2D = AXE_ATLASES[animation]
		sprite.sprite_frames.add_animation(animation)
		sprite.sprite_frames.set_animation_speed(animation, 10.0)
		for frame in int(texture.get_width() / 192):
			var atlas := AtlasTexture.new()
			atlas.atlas = texture
			atlas.region = Rect2(frame * 192, 0, 192, 192)
			sprite.sprite_frames.add_frame(animation, atlas)

func walk_to(point: Vector2) -> void:
	destination = point

func _physics_process(delta: float) -> void:
	if chopping:
		sprite.play("axe_interact")
		return
	var direction := destination - position
	if direction.length() > 0.1:
		if absf(direction.x) > 0.1:
			sprite.flip_h = direction.x < 0.0
		sprite.play("wood_run" if carrying_wood else ("axe_run" if axe_equipped else "run"))
		position = position.move_toward(destination, speed * delta)
	else:
		position = destination
		sprite.play("wood_idle" if carrying_wood else ("axe_idle" if axe_equipped else "idle"))
