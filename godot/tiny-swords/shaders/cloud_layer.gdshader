shader_type canvas_item;
render_mode unshaded;

uniform bool shadow_only = false;
uniform float opacity : hint_range(0.0, 1.0) = 1.0;

void fragment() {
	vec4 pixel = texture(TEXTURE, UV);
	// Original sheets use a dark teal shadow and light cream cloud pixels.
	bool is_shadow = dot(pixel.rgb, vec3(0.299, 0.587, 0.114)) < 0.52;
	COLOR = vec4(pixel.rgb, pixel.a * opacity * (is_shadow == shadow_only ? 1.0 : 0.0));
}
