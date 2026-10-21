extends Node
var review
func _process(delta: float) -> void:
	if is_instance_valid(review): review.review_tick(delta)
func _input(event: InputEvent) -> void:
	if is_instance_valid(review): review.review_input(event)
func _unhandled_input(event: InputEvent) -> void:
	if is_instance_valid(review): review.review_unhandled_input(event)
