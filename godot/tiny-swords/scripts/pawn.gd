extends Node2D

@export var speed: float = 70.0
@onready var sprite: AnimatedSprite2D = $Sprite
var destination: Vector2
var axe_equipped := false
var chopping := false
var carrying_wood := false
var carrying_chicken := false
var hammering := false
# Movement stays at its existing anchor; drawing sorts at the bottom foot pixel.
const FOOT_DEPTH_Y := 6.0
const ACTION_ATLASES := {
	"chicken_idle": preload("res://assets/pawn/chicken_carry_idle.png"),
	"chicken_run": preload("res://assets/pawn/chicken_carry_run.png"),
	"hammer_interact": preload("res://Tiny Swords (Free Pack)/Units/Blue Units/Pawn/Pawn_Interact Hammer.png"),
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
	for animation in ACTION_ATLASES:
		var texture: Texture2D = ACTION_ATLASES[animation]
		sprite.sprite_frames.add_animation(animation)
		sprite.sprite_frames.set_animation_speed(animation, 10.0)
		for frame in int(texture.get_width() / 192):
			var atlas := AtlasTexture.new()
			atlas.atlas = texture
			atlas.region = Rect2(frame * 192, 0, 192, 192)
			sprite.sprite_frames.add_frame(animation, atlas)

func walk_to(point: Vector2) -> void:
	destination = point

func tile_step_allowed(target: Vector2) -> bool:
	var allowed := true
	for animal in get_tree().get_nodes_in_group("pawn_tile_avoiders"):
		if not animal.is_queued_for_deletion() and animal.world.pawn == self and not animal.allow_pawn_step(position, target):
			allowed = false
	return allowed

func _physics_process(delta: float) -> void:
	if hammering and not carrying_chicken:
		sprite.play("hammer_interact")
		return
	if chopping and not carrying_chicken:
		sprite.play("axe_interact")
		return
	var direction := destination - position
	if direction.length() > 0.1:
		if absf(direction.x) > 0.1:
			sprite.flip_h = direction.x < 0.0
		sprite.play("chicken_run" if carrying_chicken else ("wood_run" if carrying_wood else ("axe_run" if axe_equipped else "run")))
		var next_position := position.move_toward(destination, speed * delta)
		if tile_step_allowed(next_position):
			position = next_position
	else:
		if tile_step_allowed(destination):
			position = destination
		sprite.play("chicken_idle" if carrying_chicken else ("wood_idle" if carrying_wood else ("axe_idle" if axe_equipped else "idle")))
