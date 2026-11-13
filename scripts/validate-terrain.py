"""Independent sanity checks on prepared terrain, including published landing heights."""
import json,math
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'public/data';report=[]
for path in out.glob('*.json'):
 record=json.loads(path.read_text())
 if 'masks' not in record:continue
 masks={m:np.array(v) for m,v in record['masks'].items()}
 for m,a in masks.items():
  assert len(a)==720 and np.isfinite(a).all() and np.max(a)<90 and np.min(a)>-90
 for high,low in [('2','0'),('5','2'),('10','5')]:assert np.all(masks[high]<=masks[low]+.00002),'Raising observer must not raise terrain horizon'
 for mast, ray in record.get('obstructions',{}).items():
  distance=np.asarray(ray['distanceM'])
  height=np.asarray(ray['elevationM'])
  assert len(distance)==720 and np.all((distance>0)&(distance<=150000))
  theta=distance/1737400
  radius=1737400+height
  angle=np.degrees(np.arctan2(radius*np.cos(theta)-1737400-record['elevationM']-int(mast),radius*np.sin(theta)))
  assert np.allclose(angle,masks[mast],atol=.065,rtol=0),'Stored skyline obstruction must reproduce its angle'
 assert len(record['tile']['heightsM'])==record['tile']['size']**2
 assert np.isfinite(record['tile']['heightsM']).all()
 report.append({'site':record['siteId'],'elevationM':record['elevationM'],'minHorizonDeg':float(masks['2'].min()),'maxHorizonDeg':float(masks['2'].max()),'resolutionM':record['resolutionM']})
# External NASA published heights, with deliberately loose tolerances for rounded
# coordinates, frame realization and the DEM sampling resolution.
checks=[('im1',2579,80,'https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/'),('chandrayaan3',529.2,100,'https://www.nasa.gov/wp-content/uploads/2026/02/42-240a.pdf'),('change6',-5256,100,'https://www.nasa.gov/centers-and-facilities/goddard/nasas-lro-spots-chinas-change-6-spacecraft-on-lunar-far-side/')]
heights=[]
for ident,reference,tolerance,source in checks:
 record=json.loads((out/(ident+'.json')).read_text());delta=record['elevationM']-reference;assert abs(delta)<tolerance,(ident,delta);heights.append({'site':ident,'demHeightM':record['elevationM'],'publishedHeightM':reference,'deltaM':delta,'toleranceM':tolerance,'source':source})
# Constant-elevation spherical terrain must recover the limb depression at a mast.
r=1737400.;mast=2;d=np.linspace(1,150000,500000);angles=np.arctan2(r*np.cos(d/r)-(r+mast),r*np.sin(d/r));expected=-math.acos(r/(r+mast));assert abs(angles.max()-expected)<1e-7
target=ROOT/'data/validation/terrain.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps({'maskChecks':report,'publishedHeightChecks':heights,'flatSphereLimbTest':True,'limitations':'Sanity checks and three published height spot checks, not independent validation of every horizon ray against QuickMap or a mission-grade model.'},indent=2));print(json.dumps({'sites':len(report),'heightChecks':heights,'flatSphereLimbTest':True},indent=2))
