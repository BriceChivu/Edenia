shader_type canvas_item;
render_mode unshaded;

// Side-only reflected light over the pack's untouched turquoise water tile.
uniform vec2 surface_size = vec2(2000.0, 1200.0);
uniform float glint_strength : hint_range(0.0, 0.3) = 0.11;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void fragment() {
	vec2 p = floor(UV * surface_size / 2.0) * 2.0;
	vec2 drift = vec2(TIME * 0.025, TIME * -0.012);
	float broad = noise(p / vec2(105.0, 60.0) + drift);
	float detail = noise(p / vec2(27.0, 16.0) - drift * 0.6);
	float field = broad * 0.65 + detail * 0.35;
	float line = 1.0 - smoothstep(0.008, 0.035, abs(field - 0.51));
	float patches = smoothstep(0.38, 0.70, noise(p / 180.0));
	float shimmer = 0.75 + 0.25 * sin(TIME * 0.6 + broad * 8.0);
	// Screen coordinates keep the central half clear at every aspect ratio.
	float edge_distance = min(SCREEN_UV.x, 1.0 - SCREEN_UV.x);
	float edges = 1.0 - smoothstep(0.10, 0.25, edge_distance);
	COLOR = vec4(vec3(0.78, 0.94, 0.86), line * patches * glint_strength * shimmer * edges);
}
