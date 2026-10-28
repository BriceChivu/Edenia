"""Extract only complete game asset trees from a previous Pages artifact."""

import json
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile

archive, destination = sys.argv[1:]
roots = {"tiny-swords-game", "tiny-swords-engine", "tiny-swords-decoder"}
metadata = {"tiny-swords-current.json", "tiny-swords-history.json"}
with tarfile.open(archive) as source:
    selected = []
    for member in source.getmembers():
        parts = PurePosixPath(member.name).parts
        if not parts or parts[0] not in roots | metadata:
            continue
        if any(part.startswith("._") for part in parts):
            continue  # macOS tar metadata is not part of the published game.
        if ".." in parts or not (member.isdir() or member.isfile()):
            raise ValueError("Unsafe game archive entry")
        if parts[0] in metadata:
            if len(parts) != 1 or not member.isfile():
                raise ValueError("Invalid game archive metadata")
        elif len(parts) > 1 and not re.fullmatch(r"[a-f0-9]{64}", parts[1]):
            raise ValueError("Invalid game release directory")
        selected.append((member, parts))
    # Inspect every selected entry before writing; never follow links or let a
    # Pages artifact copy unrelated application configuration into the archive.
    for member, parts in selected:
        target = Path(destination).joinpath(*parts)
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.extractfile(member) as data, target.open("xb") as output:
                shutil.copyfileobj(data, output, length=64 * 1024)
    versions = {parts[1] for _, parts in selected if parts[0] == "tiny-swords-game" and len(parts) > 1}
    print(json.dumps({"releases": len(versions)}))
