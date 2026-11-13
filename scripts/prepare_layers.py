"""Build display-only south-pole overlays from the live NASA Moon Trek WMTS API.
Tile capabilities, source bounds and retrieval metadata are retained. No-data stays transparent.
"""
from pathlib import Path
import requests,xml.etree.ElementTree as E,json,io,math
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/layers';OUT.mkdir(parents=True,exist_ok=True)
NS={'w':'http://www.opengis.net/wmts/1.0','o':'http://www.opengis.net/ows/1.1'}
products={'illumination':'WAC_POLE_ILL_PCT_SOUTH_100M','earth_visibility':'AVGVISIB_85S_060M_201608_EARTH_SP'}
manifest=json.loads((OUT/'manifest.json').read_text()) if (OUT/'manifest.json').exists() else {}
for name,product in products.items():
 if name in manifest and (OUT/(name+'.png')).exists():continue
 try:
  url=f'https://trek.nasa.gov/tiles/Moon/SP/{product}/1.0.0/WMTSCapabilities.xml'
  response=requests.get(url,timeout=30);response.raise_for_status();doc=E.fromstring(response.content)
  (OUT/(name+'.xml')).write_bytes(response.content)
  layer=doc.find('.//w:Layer',NS);template=layer.find('w:ResourceURL',NS).attrib['template']
  box=layer.find('o:BoundingBox',NS);lo=list(map(float,box.find('o:LowerCorner',NS).text.split()));hi=list(map(float,box.find('o:UpperCorner',NS).text.split()))
  matrix=next(m for m in doc.findall('.//w:TileMatrix',NS) if m.find('o:Identifier',NS).text=='4')
  resolution=float(matrix.find('w:ScaleDenominator',NS).text)*.00028;left,top=map(float,matrix.find('w:TopLeftCorner',NS).text.split());tileSize=int(matrix.find('w:TileWidth',NS).text);span=resolution*tileSize
  firstCol=math.floor((lo[0]-left)/span);lastCol=math.floor((hi[0]-left)/span);firstRow=math.floor((top-hi[1])/span);lastRow=math.floor((top-lo[1])/span)
  full=Image.new('RGBA',((lastCol-firstCol+1)*tileSize,(lastRow-firstRow+1)*tileSize));downloaded=0
  for row in range(firstRow,lastRow+1):
   for col in range(firstCol,lastCol+1):
    link=template.replace('{Style}','default').replace('{TileMatrixSet}','default028mm').replace('{TileMatrix}','4').replace('{TileRow}',str(row)).replace('{TileCol}',str(col))
    cache=ROOT/'.cache/wmts'/f'{name}-4-{row}-{col}.png';cache.parent.mkdir(parents=True,exist_ok=True)
    if cache.exists():tile=Image.open(cache).convert('RGBA');full.paste(tile,((col-firstCol)*tileSize,(row-firstRow)*tileSize));downloaded+=1;continue
    r=requests.get(link,timeout=90)
    if r.status_code!=200:continue
    tile=Image.open(io.BytesIO(r.content)).convert('RGBA');cache.write_bytes(r.content);full.paste(tile,((col-firstCol)*tileSize,(row-firstRow)*tileSize));downloaded+=1
  if not downloaded:raise ValueError('No source tiles returned')
  full.save(OUT/(name+'.png'))
  manifest[name]={'product':product,'capabilities':url,'tileCount':downloaded,'resolutionM':resolution,'boundsM':[left+firstCol*span,top-(lastRow+1)*span,left+(lastCol+1)*span,top-firstRow*span],'sourceBoundsM':lo+hi,'note':'Display-only precomputed raster. Its averaging/observation period differs from the selected clock. No mission-window numerical values are read from image colours.'}
  print('Prepared NASA Moon Trek layer',name,'tiles',downloaded,flush=True)
 except Exception as e:print('Layer unavailable:',name,str(e),flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
