"""Fetch official PDS LOLA elevation products and derive reproducible horizon masks.
No synthetic elevations. Source labels, exact bytes, hashes and sampling metadata retained.
Run from lunar-scout. Downloads about 4 GB once, then uses memory-mapped arrays.
"""
from pathlib import Path
import json, math, hashlib, re, time, concurrent.futures
import requests
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/raw'; OUT=ROOT/'public/data'; RAW.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
BASE='https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/'
R=1737400.
def fetch(url,path):
 if path.exists():return
 with requests.get(url,stream=True,timeout=(20,180)) as r:
  r.raise_for_status()
  tmp=path.with_suffix(path.suffix+'.part')
  with tmp.open('wb') as f:
   for chunk in r.iter_content(1024*1024):f.write(chunk)
  tmp.replace(path)
def product(folder,name):
 url=BASE+folder+'/img/'+name
 lbl=RAW/(name+'.lbl');fetch(url+'.lbl',lbl);text=lbl.read_text()
 def number(key):return float(re.search(r'\b'+key+r'\s*=\s*([-\d.]+)',text).group(1))
 rows,cols=int(number('LINES')),int(number('LINE_SAMPLES'));size=rows*cols*2
 path=RAW/(name+'.img')
 if not path.exists() or path.stat().st_size!=size:
  print('Downloading',name,round(size/1e6),'MB',flush=True)
  step=16*1024*1024;ranges=[(start,min(size,start+step)) for start in range(0,size,step)]
  def part(bounds):
   start,end=bounds;p=RAW/f'{name}.{start}.part'
   if p.exists() and p.stat().st_size==end-start:return p
   for attempt in range(10):
    try:
     with requests.get(url+'.img',headers={'Range':f'bytes={start}-{end-1}'},stream=True,timeout=(20,180)) as res:
      res.raise_for_status()
      if res.status_code!=206 or not res.headers.get('Content-Range','').startswith(f'bytes {start}-{end-1}/'):raise ValueError('Range response mismatch')
      with p.open('wb') as f:
       for chunk in res.iter_content(1024*1024):f.write(chunk)
     if p.stat().st_size!=end-start:raise ValueError('Truncated PDS response')
     return p
    except Exception:
     if attempt==9:raise
     time.sleep(min(15,2+attempt*2))
  with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
   for count,_ in enumerate(pool.map(part,ranges),1):
    if count%10==0:print(name,round(min(size,count*step)/size*100),'percent',flush=True)
  tmp=path.with_suffix('.assembling')
  with tmp.open('wb') as f:
   for start,end in ranges:
    p=RAW/f'{name}.{start}.part'
    with p.open('rb') as src:
     while chunk:=src.read(1024*1024):f.write(chunk)
    p.unlink()
  tmp.replace(path)
 digest=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
 meta={'product':name,'url':url+'.img','labelUrl':url+'.lbl','sha256':digest,'rows':rows,'cols':cols,'scale':number('SCALING_FACTOR'),'mapScaleM':number('MAP_SCALE'),'retrievedUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 return np.memmap(path,dtype='<i2',mode='r',shape=(rows,cols)),meta
def bilinear(grid,x,y):
 x=np.clip(x,0,grid.shape[1]-1.001);y=np.clip(y,0,grid.shape[0]-1.001);a=x.astype(int);b=y.astype(int);u=x-a;v=y-b
 return (grid[b,a]*(1-u)*(1-v)+grid[b,a+1]*u*(1-v)+grid[b+1,a]*(1-u)*v+grid[b+1,a+1]*u*v)*.5
def forward(lat,lon,az,d):
 phi,lam=np.radians(lat),np.radians(lon);theta=d/R
 p=np.arcsin(np.sin(phi)*np.cos(theta)+np.cos(phi)*np.sin(theta)*np.cos(az))
 l=lam+np.arctan2(np.sin(az)*np.sin(theta)*np.cos(phi),np.cos(theta)-np.sin(phi)*np.sin(p))
 return np.degrees(p),np.degrees(l)%360
def main():
 global_dem,gm=product('cylindrical','ldem_128');polar,pm=product('polar','ldem_80s_20m')
 # A small view-only displacement image retains the PDS product scale. It is
 # decimated for rendering, never used by the scientific horizon calculation.
 from PIL import Image
 image=np.array(global_dem[::32,::32],dtype=np.float32)*.5
 image=np.roll(image,image.shape[1]//2,axis=1)
 Image.fromarray(np.clip((image+12000)/24000*65535,0,65535).astype(np.uint16)).save(OUT/'moon-height.png')
 (OUT/'moon-height.json').write_text(json.dumps({'source':gm,'scaleM':24000,'offsetM':-12000,'renderOnly':True,'downsampleFactor':32}))
 from lunar_terrain import terrain_at
 sites=json.loads((ROOT/'data/sites.json').read_text(encoding='utf-8'))
 for site in sites:
  record=terrain_at(site['lat'],site['lon'],[gm,pm])
  record['siteId']=site['id']
  (OUT/(site['id']+'.json')).write_text(json.dumps(record,separators=(',',':')))
  print('Prepared horizon and surface',site['name'],'elevation',round(record['elevationM']),'m',flush=True)
 (OUT/'manifest.json').write_text(json.dumps({'products':[gm,pm],'siteIds':[s['id'] for s in sites]},indent=2))
 print('Finished official LOLA terrain preparation.',flush=True)
if __name__=='__main__':main()
