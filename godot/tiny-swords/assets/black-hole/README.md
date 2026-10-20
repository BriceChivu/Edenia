# Portal Outra Dimensão — Samuel Maciel

Source: https://www.artstation.com/artwork/DAvxk9
Original: https://cdnb.artstation.com/p/assets/images/images/044/227/481/original/samuel-maciel-portalanimation-1.gif?1639432653
Downloaded 2026-10-20 at the user's request for Tiny Swords.

`original.gif` is the unmodified 567×567, eight-frame animation. `portal.png`
is its eight coalesced frames, losslessly laid out in a 4×2 atlas at full size (2268×1134):

    magick original.gif -coalesce /tmp/portal-frame-%02d.png
    magick montage /tmp/portal-frame-*.png -tile 4x2 -geometry +0+0 -background none portal.png

Each frame lasts 100 ms. Transparency is preserved. No new artwork was drawn.
The Godot sprite displays these frames upright, hovering over its grass tile.
This source attribution does not grant a redistribution license.

The procedural shadow uses the game's existing animal-shadow opacity and a slow,
subtle size cycle synchronized with the portal's vertical hover.
