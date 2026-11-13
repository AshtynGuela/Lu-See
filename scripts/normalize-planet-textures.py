"""Normalize source PNG encodings for browser asset optimization; originals untouched."""
from pathlib import Path
import json, struct, io
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'.cache/planet-input';out.mkdir(parents=True,exist_ok=True)
for source in (ROOT.parent/'SolarSystem').glob('*.glb'):
    raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);offset=20+n;length=struct.unpack_from('<I',raw,offset)[0];binary=bytearray(raw[offset+8:offset+8+length])
    for img in g.get('images',[]):
        if 'bufferView' not in img: continue
        view=g['bufferViews'][img['bufferView']];start=view.get('byteOffset',0);im=Image.open(io.BytesIO(binary[start:start+view['byteLength']]))
        if im.mode in ('I;16','I','F'):
            a=np.array(im);a=np.clip(a/(257 if a.max()>255 else 1),0,255).astype('uint8');im=Image.fromarray(a)
        im=im.convert('RGBA');im.thumbnail((512,512),Image.Resampling.LANCZOS);buf=io.BytesIO();im.save(buf,format='PNG');data=buf.getvalue()
        while len(binary)%4:binary.append(0)
        g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});img['bufferView']=len(g['bufferViews'])-1;img['mimeType']='image/png';binary.extend(data)
    while len(binary)%4:binary.append(0)
    g['buffers'][0]['byteLength']=len(binary);js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
    body=struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    (out/source.name).write_bytes(struct.pack('<III',0x46546c67,2,12+len(body))+body)
print('Prepared normalized texture copies for all supplied planet models.')
