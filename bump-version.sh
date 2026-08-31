#!/bin/sh
# Pone la version (hash del commit) en las URLs de los assets para que los
# navegadores no sirvan copias antiguas de la cache.
V=$(git rev-parse --short HEAD)
python3 - "$V" << 'PY'
import sys, re
v = sys.argv[1]
with open('index.html') as f: h = f.read()
h = re.sub(r'(museo_bacterias\.glb)(\?v=[^"]*)?', r'\1?v=%s' % v, h)
h = re.sub(r'(modulos/[a-z0-9_]+\.glb)(\?v=[^"]*)?', r'\1?v=%s' % v, h)
h = re.sub(r'(href="\./style\.css)(\?v=[^"]*)?"', r'\1?v=%s"' % v, h)
h = re.sub(r'(src="\./script\.js)(\?v=[^"]*)?"', r'\1?v=%s"' % v, h)
with open('index.html','w') as f: f.write(h)
print('assets versionados ->', v)
PY
