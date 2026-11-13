"""Read the numeric LOLA long-term visibility products linked by NASA PGDA.
Their any-disc definition differs from this app's centre/half-disc event convention.
"""
from pathlib import Path
import json,re,hashlib,time,concurrent.futures
import requests,numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];RAW=ROOT/'.cache/statistics-pds';OUT=ROOT/'public/layers';RAW.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads((OUT/'manifest.json').read_text()) if (OUT/'manifest.json').exists() else {}
for name,suffix in [('illumination',''),('earth_visibility','_EARTH')]:
 product='AVGVISIB_85S_060M_201608'+suffix;base='https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/'+product.lower()
 try:
  label=requests.get(base+'.lbl',timeout=40);label.raise_for_status();text=label.text;(RAW/(product+'.LBL')).write_text(text)
  def number(key):return float(re.search(r'\b'+key+r'\s*=\s*([-\d.]+)',text).group(1))
  size=int(number('LINES'));cols=int(number('LINE_SAMPLES'));path=RAW/(product+'.IMG')
  if not path.exists() or path.stat().st_size!=size*cols*2:
   total=size*cols*2;step=2*1024*1024;ranges=[(a,min(total,a+step)) for a in range(0,total,step)]
   def part(bounds):
    a,b=bounds;p=RAW/f'{product}.{a}.part'
    if p.exists() and p.stat().st_size==b-a:return p
    for attempt in range(4):
     try:
      r=requests.get(base+'.img',headers={'Range':f'bytes={a}-{b-1}'},timeout=60);r.raise_for_status()
      if r.status_code!=206 or not r.headers.get('Content-Range','').startswith(f'bytes {a}-{b-1}/') or len(r.content)!=b-a:raise ValueError('Incomplete or mismatched source range')
      p.write_bytes(r.content);return p
     except Exception:
      if attempt==3:raise
      time.sleep(attempt+1)
   with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(part,ranges))
   with path.with_suffix('.assembling').open('wb') as f:
    for a,b in ranges:
     p=RAW/f'{product}.{a}.part';f.write(p.read_bytes());p.unlink()
   path.with_suffix('.assembling').replace(path)
  if path.stat().st_size!=size*cols*2:raise ValueError('Truncated statistics product')
  values=np.memmap(path,dtype='<i2',mode='r',shape=(size,cols));fraction=np.clip(np.array(values[::4,::4],dtype=float)*number('SCALING_FACTOR'),0,1);low=np.array([19,36,48]);high=np.array([241,207,116]) if name=='illumination' else np.array([137,201,234]);rgb=(low[None,None,:]+fraction[:,:,None]*(high-low)[None,None,:]).astype('uint8');Image.fromarray(rgb).save(OUT/(name+'.png'))
  half=size*number('MAP_SCALE')/2;manifest[name]={'product':product,'url':base+'.img','labelUrl':base+'.lbl','sourcePage':'https://pgda.gsfc.nasa.gov/products/69','sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest(),'resolutionM':number('MAP_SCALE'),'displayResolutionM':number('MAP_SCALE')*4,'boundsM':[-half,-half,half,half],'legend':{'min':0,'max':100,'unit':'%','low':'#132430','high':'#f1cf74' if name=='illumination' else '#89c9ea'},'note':'Precomputed long-term average, not the selected clock or mission interval. Source definition counts visibility of any part of the disc. DE421 ME/PA source frame. Numerical mission metrics use live Horizons and local terrain instead of raster colours.'}
  (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));print('Prepared numeric LOLA statistics',name,flush=True)
 except Exception as e:print('Statistics unavailable:',name,str(e),flush=True)
