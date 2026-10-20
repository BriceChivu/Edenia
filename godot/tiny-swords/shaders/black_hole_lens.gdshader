shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_nearest;
uniform vec2 screen_span_uv = vec2(0.1);
uniform float motion = 1.0;
uniform float facing = -1.0;

vec4 flowing_pixels(vec2 screen_uv, vec2 p, float radius, float age, float front) {
	// Inverse advection: sample farther out as time advances, so the actual
	// terrain/actor pixels visibly travel inward toward the aperture.
	float source_radius = radius + (1.0 - radius) * age * 0.95 * motion * front;
	float angle = age * (1.0 - radius) * 0.35 * motion * front * facing;
	mat2 turn = mat2(vec2(cos(angle), sin(angle)), vec2(-sin(angle), cos(angle)));
	vec2 source = turn * p * source_radius / max(radius, 0.001);
	return texture(screen_texture, screen_uv + (source - p) * 0.5 * screen_span_uv);
}

void fragment() {
	vec2 p = (UV - vec2(0.5)) * 2.0;
	float radius = length(p);
	if (radius >= 1.0) { discard; }
	float front = smoothstep(-0.35, 0.15, p.x * facing);
	float phase = fract(TIME * 0.5);
	float other_phase = fract(phase + 0.5);
	float weight = 1.0 - abs(phase * 2.0 - 1.0);
	// Two staggered streams hide their resets. Each screen sample stays nearest
	// filtered; this moves existing pixels instead of drawing particle artwork.
	vec4 streams = mix(flowing_pixels(SCREEN_UV, p, radius, other_phase, front), flowing_pixels(SCREEN_UV, p, radius, phase, front), weight);
	vec4 original = texture(screen_texture, SCREEN_UV);
	COLOR = mix(original, streams, front * (1.0 - smoothstep(0.82, 1.0, radius)));
	COLOR.a *= 1.0 - smoothstep(0.95, 1.0, radius);
}
