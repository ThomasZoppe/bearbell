"""Builds dist/: the whole app in one index.html, plus what iOS needs to install it and run it offline.

Run:  python3 build.py
"""
import pathlib, shutil

ROOT = pathlib.Path(__file__).parent
DIST = ROOT / 'dist'

html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'styles.css').read_text(encoding='utf-8')
js = '\n'.join((ROOT / f).read_text(encoding='utf-8') for f in ('exercises.js', 'app.js'))
assert '</script' not in js and '</style' not in css, 'a closing tag inside the code would break the inlined file'

out = (html
       .replace('<link rel="stylesheet" href="styles.css">', f'<style>\n{css}\n</style>')
       .replace('<script src="exercises.js"></script>\n<script src="app.js"></script>', f'<script>\n{js}\n</script>'))
assert 'styles.css' not in out and 'app.js' not in out, 'index.html changed: update the replace() lines in build.py'

if DIST.exists():
    shutil.rmtree(DIST)
(DIST / 'icons').mkdir(parents=True)
(DIST / 'index.html').write_text(out, encoding='utf-8')
for f in ('sw.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-512.png'):
    shutil.copy(ROOT / f, DIST / f)
print(f'dist/ pronto: index.html {len(out) // 1024} KB + sw.js, manifest, icone')
