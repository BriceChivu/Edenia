shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_nearest;
uniform vec2 screen_span_uv = vec2(0.1);
uniform float motion = 1.0;
uniform float facing = -1.0;
uniform sampler2D particle_mask : repeat_disable, filter_linear;
uniform float flow_time = 0.0;

bool grass(vec3 color) {
	// Screen samples may include a creature, shore rock or portal fringe.
	// Only the existing green ground palette belongs in this terrain effect.
	return color.g > 0.32 && color.g > max(color.r, color.b) * 1.1;
}

void fragment() {
	vec2 p = (UV - vec2(0.5)) * 2.0;
	vec2 mask_uv = vec2(facing < 0.0 ? UV.x : 1.0 - UV.x, UV.y);
	float trail = texture(particle_mask, mask_uv).r;
	if (trail <= 0.0) { discard; }
	vec4 original = textureLod(screen_texture, SCREEN_UV, 0.0);
	if (!grass(original.rgb)) { discard; }
	float front = smoothstep(0.0, 0.25, p.x * facing);
	// Inverse advection along y = lane * (0.55 + 0.65*x*x). As pixels
	// approach the aperture, upper/lower lanes curve toward its center;
	// the middle lane stays horizontal. Mirroring preserves that symmetry.
	float distance = p.x * facing;
	float wave = sin(distance * 10.0 + flow_time * 4.0);
	// Ease both ends into the untouched grass instead of ending in a hard
	// stretched edge. The central part retains the visible inward curve.
	float taper = smoothstep(0.24, 0.46, distance) * (1.0 - smoothstep(0.78, 1.04, distance));
	float pull = (0.8 + 0.12 * wave * motion) * trail * front * taper;
	float source_x = distance + max(0.0, 1.05 - distance) * pull;
	float source_y = p.y * (0.55 + 0.65 * source_x * source_x) / (0.55 + 0.65 * distance * distance);
	vec2 offset = (vec2(source_x * facing, source_y) - p) * 0.5 * screen_span_uv;
	// Retreat along the same stream if scenery interrupts a source sample.
	// Keep a nearest-sampled grass pixel rather than importing dark outlines.
	vec4 pulled = original;
	for (int step = 4; step >= 1; step--) {
		vec4 candidate = textureLod(screen_texture, SCREEN_UV + offset * (float(step) / 4.0), 0.0);
		if (grass(candidate.rgb)) {
			pulled = candidate;
			break;
		}
	}
	COLOR = pulled;
	// The copied background is opaque; its buffer alpha is not coverage.
	COLOR.a = 1.0;
}
