shader_type canvas_item;
render_mode unshaded;

uniform bool shadow_only = false;
uniform float opacity : hint_range(0.0, 1.0) = 1.0;

uniform bool use_depth_mask = false;
uniform sampler2D depth_mask : filter_nearest;

uniform vec2 mask_size;
uniform vec4 mask_axes;
uniform vec2 mask_origin;
varying vec2 depth_uv;

void vertex() {
	vec2 world = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
	depth_uv = (world.x * mask_axes.xy + world.y * mask_axes.zw + mask_origin) / mask_size;
}

void fragment() {
	vec4 pixel = texture(TEXTURE, UV);
	// Original sheets use a dark teal shadow and light cream cloud pixels.
	bool is_shadow = dot(pixel.rgb, vec3(0.299, 0.587, 0.114)) < 0.52;
	COLOR = vec4(pixel.rgb, pixel.a * opacity * (is_shadow == shadow_only ? 1.0 : 0.0));
	if (use_depth_mask && !shadow_only) {
		COLOR.a *= 1.0 - texture(depth_mask, depth_uv).a;
	}
}
