shader_type canvas_item;

// Reuse the rock animation's authored foam and water shades, removing rock
// pixels so the supplied shark can sit inside the same expanding rings.
void fragment() {
	vec4 pixel = texture(TEXTURE, UV);
	bool foam = distance(pixel.rgb, vec3(198.0, 240.0, 219.0) / 255.0) < 0.01;
	bool water_edge = distance(pixel.rgb, vec3(69.0, 133.0, 151.0) / 255.0) < 0.01;
	COLOR = vec4(pixel.rgb, pixel.a * float(foam || water_edge));
}
