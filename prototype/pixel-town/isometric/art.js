// Second visual study: redraw the existing miniature islands on an integer pixel grid.
// All shapes and materials are authored here; no raster source is sampled.
export function render(canvas,{stage=12,light='day',time=0}={}){
 const W=768,H=460;canvas.width=W;canvas.height=H;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 const night=light==='night',sunset=light==='sunset';
 const phase=time*Math.PI/3, breeze=(seed=0)=>Math.round(Math.sin(phase+seed));
 const base={sea:'#78b5c9',sea2:'#81bfce',ripple:'#b0d4d6',deep:'#5594a7',sand:'#ebd7aa',stone:'#b9a483',stoneD:'#92856f',stoneL:'#f1dfb9',grass:'#a7b981',grassD:'#718f67',grassL:'#c1cf99',leaf:'#729d7b',leafD:'#477865',leafL:'#a7c294',bark:'#997856',barkD:'#705b47',cream:'#f3dfb8',wall:'#dbc69c',wallD:'#b7a17e',outline:'#706d5c',roof:'#e69b72',roofL:'#f1b78c',roofD:'#b86f53',purple:'#aaa0c2',purpleL:'#c3b3d0',purpleD:'#827593',teal:'#78a69d',tealD:'#527d79',glass:'#86bec2',flower:'#e7b2c5',flower2:'#d7cd9d',wood:'#c79e6b',woodL:'#edc491',woodD:'#957349'};
 const tint=night?[34,54,83]:sunset?[219,140,119]:[0,0,0],mix=night?.60:sunset?.19:0,p={};
 for(const [key,hex]of Object.entries(base)){p[key]='#'+[1,3,5].map((i,j)=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-mix)+tint[j]*mix).toString(16).padStart(2,'0')).join('');}
 if(night)Object.assign(p,{sea:'#294963',sea2:'#325771',ripple:'#678a9b',deep:'#223d56',cream:'#8c9ca5',wall:'#6f8391',wallD:'#566c7d',stoneL:'#9caeb5',sand:'#8d9d9f',stone:'#6d828c',stoneD:'#4f6678',grass:'#5d7a70',grassD:'#3c5c59',grassL:'#789285',leaf:'#557e78',leafD:'#365a5d',leafL:'#789c8c',roof:'#8e7478',roofL:'#bba3a1',roofD:'#695b6b',purple:'#827b9d',purpleL:'#ada5c4',purpleD:'#615d7e'});
 if(sunset)Object.assign(p,{sea:'#94adb4',sea2:'#a2bdbe',ripple:'#d4c9bd',cream:'#f3d2ad',roof:'#e59a77',roofL:'#f8b991',roofD:'#ae6e5f'});
 const R=(x,y,w,h,col)=>{c.fillStyle=p[col]||col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
 const poly=(ps,col)=>{const ymin=Math.floor(Math.min(...ps.map(a=>a[1]))),ymax=Math.ceil(Math.max(...ps.map(a=>a[1])));for(let y=ymin;y<ymax;y++){const xs=[];for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))xs.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);for(let i=0;i<xs.length;i+=2)R(Math.round(xs[i]),y,Math.round(xs[i+1])-Math.round(xs[i]),1,col);}};
 const line=(a,b,col,w=1)=>{let [x,y]=a.map(Math.round),[tx,ty]=b.map(Math.round),dx=Math.abs(tx-x),sx=x<tx?1:-1,dy=-Math.abs(ty-y),sy=y<ty?1:-1,err=dx+dy;while(true){R(x,y,w,w,col);if(x===tx&&y===ty)break;const e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}};
 const oval=(x,y,rx,ry,col)=>{for(let j=-Math.ceil(ry);j<=ry;j++){let half=Math.floor(rx*Math.sqrt(Math.max(0,1-j*j/(ry*ry))));R(x-half,y+j,half*2+1,1,col);}};
 const rand=n=>{const k=Math.sin(n*78.233+12.9898)*43758.5453;return k-Math.floor(k);};
 R(0,0,W,H,'sea');
 // Quiet broad bands replace the wallpaper-like ripples of the rejected pass.
 for(let i=0;i<380;i++){const moving=i%6===0,x=Math.floor(rand(i+50)*W)+(moving?breeze(i)*2:0),y=Math.floor(rand(i+730)*H);c.globalAlpha=(.08+rand(i+800)*.13)*(moving?.8+Math.sin(phase+i)*.2:1);R(x,y,3+rand(i+310)*17,1,i%3?'ripple':'deep');}c.globalAlpha=1;
 let ox=0,oy=0,scale=1;
 const P=(x,y,z=14)=>[ox+(x-y)*.866*scale,oy+(x+y)*.5*scale-z*scale];
 const face=(ps,col)=>poly(ps.map(a=>P(...a)),col);
 const seg=(a,b,col,w=1)=>line(P(...a),P(...b),col,w);
 function box(x,y,z,w,d,h,top='stoneL',front='stone',side='stoneD'){
  face([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],top);
  face([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]],front);
  face([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]],side);
 }
 function rounded(w,d,r=Math.min(w,d)*.29){const pts=[];for(const [x,y,start]of [[w/2-r,-d/2+r,-90],[w/2-r,d/2-r,0],[-w/2+r,d/2-r,90],[-w/2+r,-d/2+r,180]])for(let i=0;i<=6;i++){let a=(start+i*15)*Math.PI/180;pts.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}return pts;}
 function island(w,d){
  const a=P(0,0,0);c.globalAlpha=.18;oval(a[0]+9*scale,a[1]+11*scale,(w+d)*.45*scale,(w+d)*.24*scale,'deep');c.globalAlpha=1;
  for(const [add,z,color]of [[19,-4,'sea2'],[9,-2,'ripple'],[4,-1,'deep']])face(rounded(w+add,d+add).map(([x,y])=>[x,y,z]),color);
  const pts=rounded(w,d);
  // Individual sandstone blocks around the full curved retaining wall.
  for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];face([[...a,0],[...b,0],[...b,14],[...a,14]],i<13?'stone':'stoneD');seg([...a,0],[...b,0],'stoneD');seg([...a,1],[...a,14],'stoneD');seg([a[0],a[1],7],[b[0],b[1],7],'stoneD');}
  face(pts.map(([x,y])=>[x,y,14]),'sand');
  face(rounded(w-11,d-11,16).map(([x,y])=>[x,y,14]),'grass');
  for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];seg([...a,14],[...b,14],'stoneL');}
  for(let i=0;i<220;i++){const x=(rand(i+41)-.5)*(w-20),y=(rand(i+87)-.5)*(d-20);if(Math.abs(x)>w/2-23&&Math.abs(y)>d/2-23)continue;const q=P(x,y);R(q[0],q[1],1+rand(i+67)*2,1,i%3?'grassL':'grassD');if(i%19===0){R(q[0],q[1]-2,1,2,'grassD');R(q[0]+breeze(i),q[1]-3,1,1,'grassL');}}
 }
 function paving(x,y,w,d){for(let yy=y;yy<y+d;yy+=8)for(let xx=x;xx<x+w;xx+=10){const n=xx+yy*123;face([[xx+.7,yy+.7,14.5],[Math.min(xx+9,x+w),yy+.4,14.5],[Math.min(xx+9,x+w),Math.min(yy+7,y+d),14.5],[xx+.3,Math.min(yy+7,y+d),14.5]],rand(n)>.4?'sand':'stoneL');seg([xx+.5,Math.min(yy+7,y+d),14.6],[Math.min(xx+9,x+w),Math.min(yy+7,y+d),14.6],'stone');}}
 function flowers(x,y,n=16){for(let i=0;i<n;i++){const q=P(x+(rand(i+x)*2-1)*12,y+(rand(i+y+65)*2-1)*6);R(q[0],q[1]-4,1,4,'leafD');const sway=i%4===0?breeze(x+i):0;R(q[0]-1+sway,q[1]-5,3,2,i%3?'flower':'flower2');R(q[0]+sway,q[1]-5,1,1,'cream');}}
 function shrub(x,y,r=7){let a=P(x,y,18);oval(a[0]+2,a[1]+3,r*scale,r*.6*scale,'grassD');oval(a[0],a[1],r*scale,r*.7*scale,'leafD');oval(a[0]-1,a[1]-2,(r-1)*scale,r*.6*scale,'leaf');for(let i=0;i<8;i++)R(a[0]+(rand(i+x)*2-1)*r*.7*scale,a[1]-(rand(i+y)*r*.5)*scale,2,1,'leafL');}
 function pot(x,y){box(x-3,y-3,14,6,6,5,'sand','roof','roofD');shrub(x,y,5);}
 function fence(x,y,n,dir='x'){const dx=dir==='x'?1:0,dy=1-dx;for(const z of [18,23])seg([x,y,z],[x+dx*n,y+dy*n,z],'cream',2);for(let i=0;i<=n;i+=8)box(x+dx*i,y+dy*i,14,3,3,13,'stoneL','cream','wall');}
 function lamp(x,y){box(x,y,14,3,3,30,'woodL','wood','woodD');seg([x,y,42],[x+9,y,42],'woodD',2);box(x+6,y-1,32,7,5,9,'woodD','woodD','woodD');face([[x+7,y+4,34],[x+12,y+4,34],[x+12,y+4,39],[x+7,y+4,39]],night?'#ffdc9b':sunset?'#ffe0a2':'sand');const a=P(x+9,y+2,37);if(night||sunset){c.globalAlpha=night?.13:.065;const ground=P(x+9,y+4,15);oval(ground[0],ground[1],15*scale,7*scale,'#ffd38b');c.globalAlpha=night?.12:.06;oval(a[0],a[1],15*scale,15*scale,'#ffd38b');c.globalAlpha=1;}}
 function tree(x,y){
  const foot=P(x,y);c.globalAlpha=.18;oval(foot[0]+12*scale,foot[1]+3*scale,23*scale,9*scale,'leafD');c.globalAlpha=1;
  seg([x,y,14],[x-2,y,52],'barkD',5*scale);seg([x-1,y,14],[x-3,y,51],'bark',2*scale);seg([x-2,y,34],[x-12,y,47],'bark',3*scale);seg([x-2,y,37],[x+9,y-1,53],'bark',3*scale);
  const clusters=[[-13,1,49,11],[9,0,51,14],[-7,-3,64,15],[5,4,64,15],[-15,7,59,11],[0,11,54,14],[10,10,59,11]];
  for(const [dx,dy,z,r]of clusters){const a=P(x+dx,y+dy,z);a[0]+=breeze(x+dx*.08)*.7;oval(a[0]+2,a[1]+3,r*scale,r*.84*scale,'leafD');oval(a[0],a[1],r*scale,r*.82*scale,'leaf');oval(a[0]-r*.22*scale,a[1]-r*.25*scale,r*.72*scale,r*.48*scale,'leafL');for(let i=0;i<12;i++){const xx=a[0]+(rand(i+dx+33)*2-1)*r*.74*scale,yy=a[1]+(rand(i+dy+44)*2-1)*r*.57*scale;R(xx,yy,2*scale,1*scale,i%3?'leaf':'leafD');}for(let i=0;i<2;i++){let xx=a[0]+(rand(i+z)*2-1)*r*.55*scale,yy=a[1]+(rand(i+z+9)*2-1)*r*.5*scale;R(xx,yy,3,2,'flower2');R(xx+1,yy-1,1,4,'cream');}}
 }
 function house(x,y,w=48,d=40,h=43,purple=false){
  const z=14,rh=w*.68,roof=purple?'purple':'roof',rL=purple?'purpleL':'roofL',rD=purple?'purpleD':'roofD';
  c.globalAlpha=.18;face([[x,y+d,z],[x+w+23,y+d+13,z],[x+w+25,y-2,z],[x+w,y-7,z]],'outline');c.globalAlpha=1;
  box(x-1,y-1,z,w+2,d+2,5,'stoneL','stone','stoneD');box(x,y,z+5,w,d,h-5,'cream','cream','wall');
  face([[x,y+d,z+h],[x+w,y+d,z+h],[x+w/2,y+d,z+h+rh]],'cream');
  // Small masonry courses remain subordinate to the windows and roof.
  for(let zz=z+8;zz<z+h-2;zz+=7)for(let xx=x+2;xx<x+w-3;xx+=10){if(rand(xx+zz)>.55)seg([xx,y+d+.1,zz],[xx+5,y+d+.1,zz],'wall');}
  for(let zz=z+8;zz<z+h-2;zz+=8)for(let yy=y+3;yy<y+d-3;yy+=11)if(rand(yy+zz)>.35)seg([x+w+.1,yy,zz],[x+w+.1,yy+7,zz],'wallD');
  // Arched front door, drawn directly in its isometric wall plane.
  const doorx=x+w*.39,doorw=w*.23,doorh=h*.57;
  const arch=(xx,ww,hh,col)=>{let a=[[xx,y+d+.3,z+4],[xx+ww,y+d+.3,z+4],[xx+ww,y+d+.3,z+hh-ww/2]];for(let i=0;i<=12;i++){const t=i/12*Math.PI;a.push([xx+ww/2+Math.cos(t)*ww/2,y+d+.3,z+hh-ww/2+Math.sin(t)*ww/2]);}face(a,col);};
  arch(doorx-2,doorw+4,doorh+3,'wallD');arch(doorx,doorw,doorh,'tealD');arch(doorx+1,doorw-2,doorh-1,'teal');
  for(let i=3;i<doorw-1;i+=3)seg([doorx+i,y+d+.6,z+5],[doorx+i,y+d+.6,z+doorh-7],'tealD');let knob=P(doorx+doorw-3,y+d+.8,z+13);R(knob[0],knob[1],2,2,'sand');
  box(doorx-3,y+d+1,z,doorw+6,7,3,'sand','stone','stoneD');
  // Round attic window in the gable, with a warm inset and cross mullion.
  let cx=x+w/2,cz=z+h+rh*.28;const circle=[];for(let i=0;i<32;i++){let a=i*Math.PI/16;circle.push([cx+Math.cos(a)*5.7,y+d+.5,cz+Math.sin(a)*6.5]);}face(circle,'woodD');const inner=circle.map(([xx,yy,zz])=>[cx+(xx-cx)*.72,yy,cz+(zz-cz)*.72]);face(inner,night?'#f4d394':sunset?'#f6d49f':'glass');seg([cx,y+d+.6,cz-4.5],[cx,y+d+.6,cz+4.5],'cream');seg([cx-3.5,y+d+.6,cz],[cx+3.5,y+d+.6,cz],'cream');
  // Side window with shutters and planter.
  let wy=y+d*.34,wz=z+h*.43;face([[x+w+.3,wy,wz],[x+w+.3,wy+14,wz],[x+w+.3,wy+14,wz+15],[x+w+.3,wy,wz+15]],'tealD');face([[x+w+.5,wy+2,wz+2],[x+w+.5,wy+12,wz+2],[x+w+.5,wy+12,wz+13],[x+w+.5,wy+2,wz+13]],night?'#e9c890':'glass');seg([x+w+.7,wy+7,wz+2],[x+w+.7,wy+7,wz+13],'cream');seg([x+w+.7,wy+2,wz+7],[x+w+.7,wy+12,wz+7],'cream');
  box(x+w,wy-1,wz-3,3,16,3,'woodL','wood','woodD');
  // Swept roof slope. Each terracotta tile is its own polygon, not a texture filter.
  const rz=(u)=>z+h+rh*(1-u)-Math.sin(u*Math.PI)*2;
  const left=[[x-4,y-4,z+h-2],[x+w/2,y-4,z+h+rh],[x+w/2,y+d+4,z+h+rh],[x-4,y+d+4,z+h-2]];face(left,rD);
  const roofRows=8,roofCols=7;for(let row=0;row<roofRows;row++){let u=row/roofRows,v=(row+1)/roofRows;for(let j=-1;j<roofCols;j++){let ya=Math.max(y-4,y-4+(j+(row%2)*.5)*(d+8)/roofCols),yb=Math.min(y+d+4,y-4+(j+1+(row%2)*.5)*(d+8)/roofCols);if(yb<=ya)continue;const xa=x+w/2+u*(w/2+5),xb=x+w/2+v*(w/2+5);face([[xa,ya,rz(u)],[xb,ya,rz(v)],[xb,yb-.7,rz(v)],[xa,yb-.7,rz(u)]],roof);seg([xb,ya,rz(v)],[xb,yb-.7,rz(v)],rD);seg([xa,ya,rz(u)],[xb,ya,rz(v)],rD);if(row%2===0)seg([xa+.5,ya+.8,rz(u)+.4],[xa+(xb-xa)*.48,ya+.8,rz((u+v)/2)+.4],rL);}}
  seg([x+w+5,y-4,z+h-2],[x+w+5,y+d+4,z+h-2],rD,3*scale);
  seg([x-4,y+d+4,z+h-2],[x+w/2,y+d+4,z+h+rh],rL,3*scale);seg([x+w/2,y+d+4,z+h+rh],[x+w+5,y+d+4,z+h-2],rL,3*scale);seg([x+w/2,y-4,z+h+rh+1],[x+w/2,y+d+4,z+h+rh+1],rL,3*scale);
  box(x+w*.58,y+3,z+h+rh*.58,8,8,23,'stoneL','cream','wall');box(x+w*.58-1,y+2,z+h+rh*.58+22,10,10,3,'sand','stone','stoneD');face([[x+w*.58+1,y+4,z+h+rh*.58+25.1],[x+w*.58+6,y+4,z+h+rh*.58+25.1],[x+w*.58+6,y+9,z+h+rh*.58+25.1],[x+w*.58+1,y+9,z+h+rh*.58+25.1]],'outline');
  const smoke=P(x+w*.58+4,y+6,z+h+rh*.58+29);for(let i=0;i<5;i++){const age=(i/5+time/6)%1;c.globalAlpha=.22*Math.sin(age*Math.PI);oval(smoke[0]+(Math.sin(age*5+x)*2+age*6)*scale,smoke[1]-age*32*scale,(2+age*3)*scale,(1.5+age*2)*scale,'cream');}c.globalAlpha=1;
  if(night||sunset){c.globalAlpha=night?.15:.05;face([[doorx,y+d+5,14.7],[doorx+doorw,y+d+5,14.7],[doorx+doorw+8,y+d+25,14.7],[doorx-8,y+d+25,14.7]],'#ffd596');c.globalAlpha=1;}
 }
 function dock(){for(let i=0;i<6;i++)box(-21,53+i*5,10,32,4.5,3,'woodL','wood','woodD');for(const x of [-23,10])for(const y of [56,79])box(x,y,0,4,4,23,'woodL','wood','woodD');seg([10,77,3],[10,77,13],'woodL',2);for(let z=1;z<12;z+=4)seg([10,75,z],[10,85,z],'woodL');}
 function boat(){const oldY=oy;oy+=breeze(1)*.8;const x=-12,y=105;face([[x-9,y-21,0],[x+9,y-18,0],[x+12,y+12,0],[x,y+22,0],[x-10,y+12,0]],'deep');const pts=[[x-8,y-19,5],[x+7,y-19,5],[x+11,y+10,5],[x,y+20,5],[x-10,y+10,5]];face(pts,'woodD');face(pts.map(([xx,yy,z])=>[x+(xx-x)*.8,y+(yy-y)*.89,z+1]),'woodL');face(pts.map(([xx,yy,z])=>[x+(xx-x)*.58,y+(yy-y)*.77,z+1.1]),'woodD');for(const yy of [y-9,y+5])box(x-7,yy,6,14,3,2,'woodL','wood','woodD');seg([x-17,y-10,9],[x+17,y+11,9],'wood',2);oy=oldY;}
 function pool(x,y){const a=P(x,y,18);oval(a[0],a[1]+3,23*scale,12*scale,'stone');oval(a[0],a[1],23*scale,12*scale,'stoneL');oval(a[0],a[1]-2,19*scale,9*scale,'teal');oval(a[0],a[1]-3,16*scale,7*scale,'glass');line([a[0]-11*scale,a[1]-5*scale],[a[0]+3*scale,a[1]-5*scale],'ripple');oval(a[0]-3*scale,a[1]-4*scale,4*scale,2*scale,'roofL');R(a[0],a[1]-8*scale,3*scale,4*scale,'roofL');}
 function chair(x,y){for(let i=0;i<4;i++)face([[x+i*3,y,18],[x+i*3+3,y,18],[x+i*3+3,y-13,28],[x+i*3,y-13,28]],i%2?'teal':'cream');for(let i=0;i<4;i++)face([[x+i*3,y,18],[x+i*3+3,y,18],[x+i*3+3,y+12,16],[x+i*3,y+12,16]],i%2?'teal':'cream');for(const xx of [x-1,x+13]){seg([xx,y-13,28],[xx,y+13,14],'wood',2);seg([xx,y-4,14],[xx,y+5,21],'wood',2);}}
 function playground(x,y){for(const xx of [x,x+27]){seg([xx,y-5,14],[xx,y,43],'wood',3);seg([xx,y+12,14],[xx,y,43],'wood',3);}seg([x-3,y,43],[x+30,y,43],'woodL',3);for(const xx of [x+9,x+20])seg([xx,y,41],[xx,y+2,24],'woodD');box(x+8,y,23,14,5,2,'roofL','roof','roofD');box(x+37,y-5,14,3,3,25,'woodL','wood','woodD');box(x+49,y-5,14,3,3,25,'woodL','wood','woodD');face([[x+34,y-9,39],[x+44,y-9,47],[x+55,y-9,39],[x+55,y+2,39],[x+44,y+2,47],[x+34,y+2,39]],'roof');face([[x+38,y+1,33],[x+46,y+1,33],[x+46,y+26,14],[x+38,y+26,14]],'teal');seg([x+37,y+1,34],[x+37,y+26,15],'sand',2);seg([x+47,y+1,34],[x+47,y+26,15],'sand',2);}
 function rocks(x,y){for(let i=0;i<3;i++){const a=P(x+i*13,y+rand(i+8)*7,1);oval(a[0],a[1],5*scale,3*scale,'ripple');poly([[a[0]-4*scale,a[1]],[a[0]-3*scale,a[1]-7*scale],[a[0]+1*scale,a[1]-9*scale],[a[0]+5*scale,a[1]-3*scale],[a[0]+3*scale,a[1]+2*scale]],i%2?'stone':'sand');}}
 function reflection(cx,cy,w,h){for(let i=0;i<12;i++){c.globalAlpha=(1-i/12)*(night?.12:.09);const rw=w*(1-i/17)*(.35+rand(i+1)*.4);R(cx-rw/2+(rand(i+71)-.5)*12+breeze(i)*2,cy+i*3,rw,1,night?'#efc993':'stoneL');}c.globalAlpha=1;}
 function at(x,y,s,fn){ox=x;oy=y;scale=s;fn();}
 // The broad left-to-right arrangement follows the original mature town.
 if(stage===12){
  at(544,208,1,()=>{island(97,83);paving(-13,-4,24,44);fence(-39,28,68);const objs=[{d:-30,f:()=>house(-28,-27,43,37,42,true)},{d:2,f:()=>tree(29,-22)},{d:3,f:()=>lamp(-36,9)},{d:36,f:()=>flowers(-25,29,32)},{d:46,f:()=>flowers(22,25,32)}];objs.sort((a,b)=>a.d-b.d).forEach(o=>o.f());rocks(53,20);});reflection(546,250,85,42);
  at(140,293,1,()=>{island(103,82);paving(-15,-12,29,45);house(-22,-29,33,29,33);pool(-19,25);chair(21,22);flowers(-32,2,25);flowers(32,8,22);fence(-32,33,45);});reflection(140,337,70,33);
  // Arched bridge connects the pool island and home without changing their placement.
  for(let i=0;i<16;i++){let x=200+i*5,y=283+Math.sin(i/15*Math.PI)*-9;poly([[x,y],[x+5,y+1],[x+5,y+15],[x,y+14]],i%3?'wood':'woodL');line([x,y-8],[x+5,y-7],'woodL',2);line([x,y+7],[x+5,y+8],'woodL',2);line([x,y+16],[x+5,y+17],'woodD',2);if(i%4===0||i===15){R(x,y-9,3,25,'wood');R(x,y+5,3,15,'woodD');R(x,y+4,3,2,'woodL');}}
 }
 at(stage===12?383:384,stage===12?305:308,stage===12?1.18:1.6,()=>{
  island(stage===12?148:109,108);paving(-33,-5,24,57);paving(-29,18,65,17);shrub(-45,-7,8);shrub(17,39,7);shrub(36,38,7);flowers(-43,42,27);flowers(24,41,25);
  const q=[{d:-53,f:()=>house(-42,-35)},{d:6,f:()=>tree(30,-24)},{d:17,f:()=>lamp(-46,30)},{d:10,f:()=>flowers(-49,13,23)},{d:49,f:()=>pot(-24,40)},{d:48,f:()=>pot(7,34)},{d:50,f:()=>fence(11,40,28)},{d:56,f:()=>{box(-30,33,14,2,2,15,'wood','wood','woodD');box(-33,32,28,8,6,6,'teal','teal','tealD');}}];
  if(stage===12)q.push({d:60,f:()=>playground(31,7)});q.sort((a,b)=>a.d-b.d).forEach(o=>o.f());dock();boat();rocks(-51,55);
 });reflection(388,stage===12?390:426,110,30);
 if(stage===12){at(663,325,1,()=>{island(43,40);const facets=[[[ -17,13,14],[-8,-4,62],[0,-8,68],[2,12,14]],[[2,12,14],[0,-8,68],[9,-6,66],[20,8,14]],[[20,8,14],[9,-6,66],[16,1,49],[23,10,14]]];facets.forEach((a,i)=>face(a,['stone','stoneD','outline'][i]));seg([-8,4,24],[-5,-2,54],'stoneL',2);seg([5,7,19],[5,-3,55],'stone',2);const a=P(1,-5,66);oval(a[0],a[1],9,4,'stoneL');oval(a[0],a[1],6,2,'outline');for(let i=0;i<5;i++){const age=(i/5+time/6)%1;c.globalAlpha=.13*Math.sin(age*Math.PI);oval(a[0]+age*9,a[1]-4-age*28,3+age*4,2+age*3,'cream');}c.globalAlpha=1;shrub(-12,11,5);shrub(18,6,5);});
  for(let i=0;i<3;i++){const x=438+i*17,y=403+(i%2)*9;oval(x+breeze(i),y+3,7,2,'sea2');R(x,y,6,3,'cream');R(x+5,y-3,3,5,'cream');R(x+8,y-1,2,1,'roofL');}
 }
 return {width:W,height:H};
}
