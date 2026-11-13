"""Cartographic polar relief from the official downloaded LOLA elevation grid."""
from pathlib import Path
import json,numpy as np
from PIL import Image
from prepare_data import product,bilinear,R,OUT
def main():
 grid,meta=product('cylindrical','ldem_128');size=1024;extent=2*R*np.tan(np.radians(5));axis=np.linspace(-extent,extent,size);x,y=np.meshgrid(axis,axis[::-1]);rho=np.hypot(x,y);lon=np.degrees(np.arctan2(x,y))%360
 for north in [False,True]:
  lat=(1 if north else -1)*(90-np.degrees(2*np.arctan(rho/(2*R))));h=bilinear(grid,lon/360*grid.shape[1]-.5,(90-lat)/180*grid.shape[0]-.5)
  gy,gx=np.gradient(h,extent*2/(size-1));norm=np.sqrt(gx*gx+gy*gy+1);light=np.clip((-.5*gx-.5*gy+.7071)/norm,0,1);gray=np.clip((.13+.8*light)*255,0,255).astype('uint8');rgba=np.dstack([gray,gray,gray,np.where(rho<=extent,255,0).astype('uint8')]);name='polar-north' if north else 'polar-south';Image.fromarray(rgba).save(OUT/(name+'.png'))
  (OUT/(name+'.json')).write_text(json.dumps({'source':meta,'projection':'Polar stereographic, true at pole, reference radius 1737400 m','latitudeExtent':[80,90] if north else [-90,-80],'note':'Cartographic hillshade from LOLA elevation, not illumination at the selected clock. Rendering light is fixed.'},indent=2))
 image=np.array(grid[::32,::32],dtype=np.float32)*.5;image=np.roll(image,image.shape[1]//2,axis=1);Image.fromarray(np.clip((image+12000)/24000*65535,0,65535).astype(np.uint16)).save(OUT/'moon-height.png')
 (OUT/'moon-height.json').write_text(json.dumps({'source':meta,'scaleM':24000,'offsetM':-12000,'renderOnly':True,'downsampleFactor':32}))
 print('Prepared both polar relief maps and globe displacement.',flush=True)
if __name__=='__main__':main()
