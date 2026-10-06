shader_type canvas_item;

uniform vec2 frame_size = vec2(192.0, 256.0);
uniform vec2 root_pixel = vec2(96.0, 240.0);
uniform float bend_angle = 0.0;
varying vec4 sprite_tint;

void vertex() {
	sprite_tint = COLOR;
}

void fragment() {
	vec4 original = texture(TEXTURE, UV);
	if (abs(bend_angle) < 0.00001) {
		COLOR = original * sprite_tint;
	} else {
		vec2 texture_size = 1.0 / TEXTURE_PIXEL_SIZE;
		vec2 atlas_pixel = UV * texture_size;
		float frame_start = floor(atlas_pixel.x / frame_size.x) * frame_size.x;
		vec2 pixel = atlas_pixel - vec2(frame_start, 0.0);
		float c = cos(bend_angle);
		float s = sin(bend_angle);
		// Inverse rotation samples this frame around its planted root anchor.
		vec2 source = mat2(vec2(c, -s), vec2(s, c)) * (pixel - root_pixel) + root_pixel;
		vec4 body = vec4(0.0);
		if (all(greaterThanEqual(source, vec2(0.0))) && all(lessThan(source, frame_size))) {
			vec4 sample_color = texture(TEXTURE, (source + vec2(frame_start, 0.0)) / texture_size);
			// Opaque pixels are the tree; partial alpha is its baked ground shadow.
			if (sample_color.a > 0.99) {
				body = sample_color;
			}
		}
		vec4 shadow = original.a < 0.99 ? original : vec4(0.0);
		COLOR = (body.a > 0.99 ? body : shadow) * sprite_tint;
	}
}
