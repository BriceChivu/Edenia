shader_type canvas_item;

uniform float press : hint_range(0.0, 1.0) = 0.0;
varying vec4 sprite_tint;

void vertex() {
	sprite_tint = COLOR;
}

void fragment() {
	vec2 pixel = UV / TEXTURE_PIXEL_SIZE;
	// Bend only Cursor 02's raised index finger toward the stationary palm.
	// The original texture, hand position and hotspot stay unchanged.
	float finger = (1.0 - smoothstep(22.0, 33.0, pixel.y))
		* (1.0 - smoothstep(30.0, 34.0, pixel.x));
	vec2 source = pixel - vec2(0.7, 1.3) * press * finger;
	COLOR = texture(TEXTURE, source * TEXTURE_PIXEL_SIZE) * sprite_tint;
}
