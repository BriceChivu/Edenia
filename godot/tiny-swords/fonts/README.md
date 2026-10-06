# Tiny Swords UI fonts

MedievalSharp remains the authored Latin UI font. EdeniaNotoTC and EdeniaNotoSC
are static subsets of Noto Sans CJK Regular for Traditional and Simplified Chinese.
The modified fonts use distinct family names and are distributed under the SIL OFL
in `../notices/NotoSans-OFL.txt`.

Sources (6 October 2026):
- https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf
- https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf

Regenerate with `python scripts/subset-tiny-swords-fonts.py --source-dir DIR`, using
those two source files in DIR and a Python environment with fontTools installed.
The script includes each Chinese game catalog, Latin punctuation/numerals and UI
symbols. Commit the resulting OTFs and their Godot import metadata, and rebuild.
Static OTF sources are used because Godot 4.7.2's importer crashed with the first
subsets made from Google Fonts' variable TrueType sources on the local Mac.
