shader_type canvas_item;
render_mode unshaded;

uniform vec4 frame_uv = vec4(0.0, 0.0, 1.0, 1.0);
uniform vec2 pull_direction = vec2(1.0, 0.0);
uniform float suction : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec2 local = (UV - frame_uv.xy) / frame_uv.zw;
	vec2 direction = normalize(pull_direction + vec2(0.00001));
	vec2 pivot = vec2(0.5) + direction * 0.3 * suction;
	vec2 p = local - pivot;
	float angle = suction * 2.4 * (1.0 - min(length(p), 1.0));
	mat2 twist = mat2(vec2(cos(angle), sin(angle)), vec2(-sin(angle), cos(angle)));
	p = twist * p;
	float along = dot(p, direction);
	vec2 across = p - direction * along;
	vec2 sample_local = pivot + direction * along / (1.0 + suction * 1.8) + across * (1.0 + suction * 2.5);
	vec2 inside = step(vec2(0.0), sample_local) * step(sample_local, vec2(1.0));
	COLOR = texture(TEXTURE, frame_uv.xy + clamp(sample_local, vec2(0.0), vec2(0.9999)) * frame_uv.zw);
	COLOR.a *= inside.x * inside.y;
}
