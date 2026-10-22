shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_nearest;
uniform vec2 screen_span_uv = vec2(0.1);
uniform float motion = 1.0;
uniform float facing = -1.0;
uniform sampler2D particle_mask : repeat_disable, filter_linear;
uniform float flow_time = 0.0;

void fragment() {
	vec2 p = (UV - vec2(0.5)) * 2.0;
	float radius = length(p);
	vec2 mask_uv = vec2(facing < 0.0 ? UV.x : 1.0 - UV.x, UV.y);
	float trail = texture(particle_mask, mask_uv).r;
	if (trail <= 0.0) { discard; }
	// Sample farther from the center to compress the actual background into
	// the aperture, only on its facing (intake) side. Fade the displacement
	// to zero before crossing the center plane or the lens boundary.
	float front = smoothstep(0.0, 0.25, p.x * facing);
	float envelope = max(0.0, 1.0 - radius * 0.55) * front * trail;
	float wave = sin(radius * 12.0 + flow_time * 2.5);
	float source_radius = radius + envelope * (0.24 + 0.035 * wave * motion);
	float angle = envelope * (0.16 + 0.025 * wave * motion) * facing;
	mat2 turn = mat2(vec2(cos(angle), sin(angle)), vec2(-sin(angle), cos(angle)));
	vec2 source = turn * p * source_radius / max(radius, 0.001);
	// One nearest-filtered sample keeps the grass recognizable while it bends;
	// crossfading displaced copies would wash its pixel pattern away.
	COLOR = texture(screen_texture, SCREEN_UV + (source - p) * 0.5 * screen_span_uv);
}
