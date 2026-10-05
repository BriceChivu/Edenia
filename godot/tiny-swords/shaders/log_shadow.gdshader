shader_type canvas_item;
render_mode unshaded;

uniform sampler2D grass_atlas : filter_nearest;
uniform vec4 grass_region;
uniform vec4 ground_axes;
uniform vec2 ground_origin;
uniform sampler2D log_texture : filter_nearest;
uniform vec2 log_centers[6];
uniform int log_count;
varying vec2 shadow_pixel;
varying vec2 ground_pixel;

void vertex() {
	shadow_pixel = VERTEX;
	vec2 world = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
	ground_pixel = vec2(dot(world, ground_axes.xy), dot(world, ground_axes.zw)) + ground_origin;
}

void fragment() {
	// Clouds_01_shadow.png uses #242a3b at one-third alpha, then the
	// low-cloud projection applies 0.48 opacity. Increase its alpha by 25%.
	// Ignore the resource PNG's faint baked fringe; project its solid shape.
	float silhouette = 0.0;
	vec2 log_size = vec2(textureSize(log_texture, 0)) * 0.9;
	for (int i = 0; i < log_count; i++) {
		vec2 log_uv = (shadow_pixel - log_centers[i]) / log_size + vec2(0.5);
		float in_log = step(0.0, log_uv.x) * step(0.0, log_uv.y)
			* (1.0 - step(1.0, log_uv.x)) * (1.0 - step(1.0, log_uv.y));
		silhouette = max(silhouette, step(0.9, texture(log_texture, log_uv).a) * in_log);
	}
	// Sample the same authored grass pixels as terrain rendering. The tile
	// bounds and opaque alpha exclude water, foam and irregular shore gaps.
	float inside = step(0.0, ground_pixel.x) * step(0.0, ground_pixel.y)
		* (1.0 - step(64.0, ground_pixel.x)) * (1.0 - step(64.0, ground_pixel.y));
	vec2 grass_uv = (grass_region.xy + floor(ground_pixel) + vec2(0.5)) / vec2(textureSize(grass_atlas, 0));
	float grass = step(0.99, texture(grass_atlas, grass_uv).a) * inside;
	COLOR = vec4(vec3(36.0, 42.0, 59.0) / 255.0, silhouette * grass * 0.20);
}
