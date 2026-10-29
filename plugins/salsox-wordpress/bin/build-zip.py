"""
Builds the upload-ready plugin zip: dist/salsox.zip at the repository root,
with everything under one salsox/ folder, as WordPress expects (the folder
name is the plugin's slug and text domain). Leaves out what is for
developers only: this bin/ folder, the WordPress.org listing assets in
.wordpress-org/ and the developer README.md.

    python plugins/salsox-wordpress/bin/build-zip.py

Python's zipfile writes forward-slash paths; Windows PowerShell 5.1's
Compress-Archive writes backslashes, which WordPress cannot unpack.
"""
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(PLUGIN))
OUT = os.path.join(ROOT, "dist", "salsox.zip")
SKIP_DIRS = {"bin", ".wordpress-org", "node_modules", ".git"}
SKIP_FILES = {"README.md", ".DS_Store", "Thumbs.db"}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
count = 0
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for folder, dirs, files in os.walk(PLUGIN):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        rel = os.path.relpath(folder, PLUGIN)
        for name in sorted(files):
            if name in SKIP_FILES:
                continue
            path = os.path.join(folder, name)
            arc = "/".join(p for p in ("salsox", "" if rel == "." else rel.replace(os.sep, "/"), name) if p)
            z.write(path, arc)
            count += 1
print(f"Wrote {OUT} ({count} files, {os.path.getsize(OUT)} bytes)")
sys.exit(0)
