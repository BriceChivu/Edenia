shader_type canvas_item;
render_mode unshaded;

uniform bool event_active = false;
// The bright purple from the portal artwork.
uniform vec4 edge_color : source_color = vec4(0.627451, 0.011765, 0.780392, 1.0);
uniform float fade_width : hint_range(0.01, 0.5) = 0.07;
uniform float edge_intensity : hint_range(0.0, 1.0) = 0.20;

void fragment() {
	// Measure inward from the visible game, independently of camera pan/zoom.
	// Pixel distances give every side the same fade width on wide/tall views.
	vec2 viewport_size = 1.0 / SCREEN_PIXEL_SIZE;
	vec2 edge_distance = min(SCREEN_UV, vec2(1.0) - SCREEN_UV) * viewport_size;
	float distance_inside = min(edge_distance.x, edge_distance.y);
	float width = min(viewport_size.x, viewport_size.y) * fade_width;
	float tint = event_active ? edge_intensity * (1.0 - smoothstep(0.0, width, distance_inside)) : 0.0;
	COLOR.rgb = mix(COLOR.rgb, edge_color.rgb, tint);
}
