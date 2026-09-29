extends Node2D

@export var speed: float = 70.0
@onready var sprite: AnimatedSprite2D = $Sprite
var destination: Vector2

func _ready() -> void:
	destination = position

func walk_to(point: Vector2) -> void:
	destination = point

func _physics_process(delta: float) -> void:
	var direction := destination - position
	if direction.length() > 0.1:
		if absf(direction.x) > 0.1:
			sprite.flip_h = direction.x < 0.0
		sprite.play("run")
		position = position.move_toward(destination, speed * delta)
	else:
		position = destination
		sprite.play("idle")
