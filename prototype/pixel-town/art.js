// THROWAWAY: three spatial arrangements of the same earned town, authored on an integer pixel grid.
export const milestones=['Initial / loading sea','Lonely house','Fresh home + boat','Tiny island','Playground','Pool','Visiting friends','Expanded island','Deckchair + flowers','Backyard cottage','Purple neighbor','Neighbor’s garden','Volcano'];
export const variants={A:'Wide harbor',B:'Island courtyard',C:'North–south islands'};
const colors={water:'#5596b2',deep:'#45839f',wave:'#7eb8c9',foam:'#b0d7d7',shore:'#789b85',sand:'#e5c997',sandLight:'#f9e1b0',stone:'#ae9877',seam:'#8c8168',grass:'#86b365',grassLight:'#a8cc79',grassDark:'#5f925b',leaf:'#50845a',leafMid:'#6f9d61',leafLight:'#96bd72',trunk:'#94644b',ink:'#3c5350',wall:'#f1d9a3',wallShade:'#c8b488',roof:'#d57854',roofDark:'#a25142',roofLight:'#eeac73',purple:'#8b78a9',purpleDark:'#645880',purpleLight:'#b3a0ce',door:'#5e9790',glass:'#91c4c4',wood:'#be9866',woodLight:'#e4bd7a',woodDark:'#8b7153',flower:'#e49aa0',white:'#f4ead0',gold:'#efc86c'};
const stops=[{t:0,rgb:[43,56,101],mix:.61,light:1},{t:5,rgb:[63,68,111],mix:.5,light:.9},{t:6.5,rgb:[223,159,136],mix:.23,light:.3},{t:8,rgb:[255,232,192],mix:0,light:0},{t:16.5,rgb:[255,232,192],mix:0,light:0},{t:18,rgb:[226,153,104],mix:.24,light:.25},{t:19,rgb:[177,115,139],mix:.38,light:.75},{t:20.5,rgb:[43,56,101],mix:.61,light:1},{t:24,rgb:[43,56,101],mix:.61,light:1}];
export function lighting(hour){let i=stops.findIndex((s,j)=>j<stops.length-1&&hour>=s.t&&hour<=stops[j+1].t);i=Math.max(0,i);let a=stops[i],b=stops[i+1],q=(hour-a.t)/(b.t-a.t);return{rgb:a.rgb.map((v,k)=>v+(b.rgb[k]-v)*q),mix:a.mix+(b.mix-a.mix)*q,light:a.light+(b.light-a.light)*q};}
export function layout(variant,phone=false){
 if(variant==='C')return{w:288,h:344,main:[92,140],pool:[38,48],neighbor:[179,39],volcano:[204,268]};
 if(variant==='B')return{w:288,h:256,main:[97,119],pool:[20,31],neighbor:[173,30],volcano:[220,199]};
 return phone?{w:288,h:272,main:[96,143],pool:[18,47],neighbor:[174,45],volcano:[228,204]}:{w:480,h:248,main:[211,108],pool:[93,89],neighbor:[331,46],volcano:[410,172]};
}
export function drawTown(canvas,{stage=12,hour=12,variant='A',phone=false,frame=0}={}){
 const L=layout(variant,phone),light=lighting(hour),p={};
 for(const [k,v] of Object.entries(colors)){const rgb=[1,3,5].map(i=>parseInt(v.slice(i,i+2),16));p[k]='#'+rgb.map((v,i)=>Math.round(v*(1-light.mix)+light.rgb[i]*light.mix).toString(16).padStart(2,'0')).join('');}
 canvas.width=L.w;canvas.height=L.h;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 const rect=(x,y,w,h,col)=>{c.fillStyle=p[col]||col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
 const poly=(points,col)=>{ // Scanlines keep diagonals on the pixel grid, without antialiased edges.
  const min=Math.floor(Math.min(...points.map(v=>v[1]))),max=Math.ceil(Math.max(...points.map(v=>v[1])));
  for(let y=min;y<max;y++){const hits=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y+.5&&b[1]>y+.5)||(b[1]<=y+.5&&a[1]>y+.5))hits.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));}hits.sort((a,b)=>a-b);for(let i=0;i<hits.length;i+=2)rect(Math.round(hits[i]),y,Math.round(hits[i+1])-Math.round(hits[i]),1,col);}
 };
 const oval=(x,y,w,h,col)=>{for(let yy=0;yy<h;yy++){const r=Math.sqrt(Math.max(0,1-((yy+.5-h/2)/(h/2))**2));const xx=Math.round(w/2*(1-r));rect(x+xx,y+yy,w-xx*2,1,col);}};
 const warm=(base,target)=>'#'+[1,3,5].map(i=>Math.round(parseInt(base.slice(i,i+2),16)*(1-light.light)+parseInt(target.slice(i,i+2),16)*light.light).toString(16).padStart(2,'0')).join('');
 const random=(n)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
 function ripple(x,y,w=12){rect(x+2,y,w-4,1,'wave');rect(x,y+1,3,1,'wave');rect(x+w-3,y+1,3,1,'wave');}
 rect(0,0,L.w,L.h,'water');
 // Low contrast, widely spaced water tiles; no gradients or canvas smoothing.
 for(let y=3;y<L.h;y+=13)for(let x=3;x<L.w;x+=24){const n=x+y*L.w;if(random(n)>.43){const dx=Math.floor(random(n+1)*9);const shift=(frame+Math.floor(random(n+2)*4))%4;ripple(x+dx+shift,y+Math.floor(random(n+3)*6),5+Math.floor(random(n+4)*8));}}
 function island(x,y,w,h){
  oval(x-5,y+8,w+14,h+6,'deep');oval(x-4,y+2,w+8,h+8,'wave');oval(x-2,y+1,w+4,h+6,'foam');
  oval(x,y+7,w,h,'seam');oval(x,y+3,w,h,'stone');
  for(let xx=x+5;xx<x+w-4;xx+=9)rect(xx,y+h-3,1,7,'seam');
  oval(x,y,w,h,'sandLight');oval(x+3,y+2,w-6,h-5,'sand');oval(x+7,y+4,w-14,h-11,'grass');
  for(let i=0;i<w*h/160;i++){let xx=x+13+Math.floor(random(i+x)*Math.max(1,w-27)),yy=y+9+Math.floor(random(i+y+99)*Math.max(1,h-25));rect(xx,yy,2,1,'grassLight');}
 }
 function tuft(x,y){rect(x,y,1,3,'grassDark');rect(x-2+(frame%2),y-1,1,2,'grassDark');rect(x+2,y-2,1,3,'grassLight');}
 function flowers(x,y,w=20){for(let i=0;i<7;i++){let xx=x+Math.floor(random(i+x+20)*w),yy=y+Math.floor(random(i+y+80)*10);rect(xx,yy+2,1,3,'leaf');rect(xx-1,yy,3,2,i%2?'flower':'white');rect(xx,yy,1,1,'gold');}}
 function tree(x,y){oval(x-9,y+23,28,9,'grassDark');rect(x+1,y+12,5,18,'trunk');rect(x+2,y+16,1,11,'wood');rect(x-3,y+17,4,3,'trunk');oval(x-13,y+4,32,21,'ink');oval(x-14,y,32,22,'leaf');oval(x-11,y-4,26,23,'leafMid');oval(x-8,y-4,18,12,'leafLight');for(let i=0;i<8;i++){rect(x-8+Math.floor(random(i+1)*21),y+3+Math.floor(random(i+32)*13),3,2,i%3?'leaf':'leafLight');}rect(x-2,y-1,3,2,'white');rect(x+9,y+10,3,2,'flower');}
 function fence(x,y,w){rect(x,y+4,w,2,'wood');for(let i=0;i<w;i+=6){rect(x+i,y,3,10,'white');rect(x+i+2,y+1,1,9,'sand');}}
 function path(x,y,w,h){rect(x,y,w,h,'sand');for(let yy=y+2;yy<y+h;yy+=6)for(let xx=x+((yy-y)%12?2:5);xx<x+w-2;xx+=9){rect(xx,yy,7,4,'sandLight');rect(xx,yy+4,7,1,'stone');}}
 function lamp(x,y){rect(x,y,2,19,'woodDark');rect(x-2,y-3,6,7,'ink');rect(x-1,y-2,4,4,warm(p.gold,'#f8d88c'));if(light.light>0){c.globalAlpha=light.light*.15;oval(x-9,y-8,20,20,'#ffca72');c.globalAlpha=1;}}
 function house(x,y,small=false,purple=false){let w=small?29:43,h=small?23:31,rh=small?19:26;const roof=purple?'purple':stage===1?'wood':'roof',dark=purple?'purpleDark':'roofDark',hi=purple?'purpleLight':'roofLight';
  poly([[x+3,y+9],[x+w+9,y+14],[x+w+12,y+h+9],[x+5,y+h+9]],'grassDark');
  rect(x,y,w,h,'ink');rect(x+2,y+2,w-4,h-3,'wall');rect(x+w-9,y+2,7,h-3,'wallShade');rect(x+2,y+h-5,w-4,3,'stone');
  for(let yy=y+5;yy<y+h-5;yy+=6){rect(x+3,yy,4,1,'wallShade');rect(x+w-8,yy+2,4,1,'stone');}
  const dx=x+Math.floor(w/2)-4;rect(dx-2,y+h-17,12,18,'stone');rect(dx,y+h-16,8,16,'ink');rect(dx+1,y+h-15,6,14,'door');rect(dx+5,y+h-8,1,1,'gold');rect(dx-2,y+h,12,3,'sandLight');rect(dx-3,y+h+3,14,2,'stone');
  for(const wx of [x+5,x+w-13]){rect(wx,y+8,8,9,'ink');rect(wx+1,y+9,6,6,warm(p.glass,'#f5cf8b'));rect(wx+3,y+9,1,6,'white');rect(wx+1,y+12,6,1,'white');rect(wx-1,y+17,10,2,'woodDark');}
  // Orthogonal roof pitch: parallel eaves, hand-stepped hips, individual tile highlights.
  poly([[x-4,y+5],[x-4,y-2],[x+3,y-rh],[x+w-3,y-rh],[x+w+4,y-2],[x+w+4,y+5]],'ink');
  for(let row=0;row<rh+5;row++){const inset=Math.max(0,Math.ceil((rh-row)/4));rect(x-3+inset,y-rh+1+row,w+6-inset*2,1,row%5===0?dark:roof);}
  for(let yy=y-rh+3;yy<y+2;yy+=5){let inset=Math.max(1,Math.ceil((y-yy)/4));for(let xx=x+inset+(yy%2)*3;xx<x+w-inset;xx+=7){rect(xx,yy,5,1,hi);rect(xx+5,yy,1,3,dark);}}
  rect(x+4,y-rh-1,w-8,3,hi);rect(x-3,y+3,w+6,2,dark);
  rect(x+w-14,y-rh-9,7,14,'stone');rect(x+w-15,y-rh-10,9,3,'sandLight');rect(x+w-13,y-rh-9,5,1,'ink');rect(x+w-12,y-rh-5,4,1,'wall');
  if(light.light>0){c.globalAlpha=light.light*.12;rect(dx-3,y+h+5,15,8,'#ffd68b');c.globalAlpha=1;}
 }
 function bridge(x1,y1,x2,y2){const horizontal=Math.abs(x2-x1)>Math.abs(y2-y1);if(horizontal){let x=Math.min(x1,x2),w=Math.abs(x2-x1);rect(x,y1+4,w,15,'woodDark');rect(x,y1,w,13,'wood');for(let xx=x;xx<x+w;xx+=4)rect(xx,y1+1,1,11,'woodLight');rect(x,y1-2,w,2,'woodDark');rect(x,y1+13,w,2,'woodDark');}else{let y=Math.min(y1,y2),h=Math.abs(y2-y1);rect(x1,y,16,h,'woodDark');rect(x1+2,y,12,h,'wood');for(let yy=y;yy<y+h;yy+=4)rect(x1+2,yy,12,1,'woodLight');rect(x1-1,y,2,h,'woodDark');rect(x1+15,y,2,h,'woodDark');}}
 function pool(x,y){oval(x-1,y,29,23,'stone');oval(x,y-2,27,22,'white');oval(x+3,y,21,16,'door');oval(x+5,y+2,17,11,'glass');ripple(x+7,y+6,11);rect(x+19,y+11,5,6,'sandLight');rect(x+20,y+10,1,7,'ink');rect(x+23,y+10,1,7,'ink');rect(x+8,y+4,4,3,'gold');}
 function chair(x,y){rect(x-1,y+6,2,15,'woodDark');rect(x+10,y+6,2,15,'woodDark');rect(x,y,11,11,'white');rect(x,y+12,11,6,'white');for(let xx=x+1;xx<x+10;xx+=4){rect(xx,y,2,10,'door');rect(xx,y+12,2,6,'door');}}
 function playground(x,y){rect(x,y,4,25,'woodDark');rect(x+20,y,4,25,'woodDark');rect(x-2,y,29,3,'woodLight');rect(x+8,y+3,1,13,'ink');rect(x+17,y+3,1,13,'ink');rect(x+7,y+16,12,3,'roof');rect(x+28,y+5,3,21,'woodDark');rect(x+38,y+5,3,21,'woodDark');rect(x+27,y+4,15,3,'wood');poly([[x+26,y+4],[x+34,y-3],[x+42,y+4]],'roof');for(let i=0;i<14;i++)rect(x+30-i/2,y+10+i,6,1,'door');}
 function boat(x,y){oval(x-2,y+1,18,28,'deep');poly([[x,y+2],[x+6,y-3],[x+13,y+2],[x+12,y+20],[x+7,y+25],[x+1,y+21]],'ink');poly([[x+2,y+3],[x+6,y],[x+11,y+3],[x+10,y+19],[x+7,y+22],[x+3,y+19]],'wood');rect(x+4,y+4,5,14,'woodDark');rect(x+2,y+7,9,3,'woodLight');rect(x+3,y+15,8,3,'woodLight');rect(x-4,y+8,19,1,'sand');}
 function duck(x,y){ripple(x-3,y+4,13);rect(x,y,7,3,'white');rect(x+5,y-3,3,5,'white');rect(x+8,y-1,2,1,'gold');rect(x+6,y-2,1,1,'ink');}
 if(stage===0)return L;
 let [mx,my]=L.main,[px,py]=L.pool,[nx,ny]=L.neighbor,[vx,vy]=L.volcano;
 const extended=stage>=4,mw=extended?110:83;
 island(mx,my,mw,78);if(stage>=3)island(px,py,stage>=7?72:51,stage>=7?78:52);
 if(stage>=3){if(variant==='A'&&!phone)bridge(px+(stage>=7?62:43),py+35,mx+10,py+35);else if(variant==='C'){bridge(px+39,py+(stage>=7?62:40),px+39,my+29);bridge(px+39,my+29,mx+10,my+29);}else{bridge(px+39,py+35,mx+6,py+35);bridge(mx-8,py+35,mx-8,my+40);bridge(mx-8,my+40,mx+10,my+40);}}
 if(stage>=10)island(nx,ny,77,82);
 // Broken, restrained reflections below each island; stills keep the same treatment.
 function reflection(x,y,w,purple=false){c.globalAlpha=.19;for(let i=0;i<5;i++){const offset=((frame+i)%3)-1;rect(x+i*2+offset,y+i*3,w-i*4,1,purple?'purple':'roof');}c.globalAlpha=1;if(light.light>0){c.globalAlpha=light.light*.25;for(let i=0;i<4;i++)rect(x+w/2-3+(i+frame)%2,y+i*4,7-i,1,'#f9d28a');c.globalAlpha=1;}}
 reflection(mx+45,my+88,29);if(stage>=9)reflection(px+15,py+87,30);if(stage>=10)reflection(nx+21,ny+91,29,true);
 path(mx+28,my+37,15,37);path(mx+20,my+39,42,10);house(mx+18,my+13,false,false);tree(mx+71,my+13);flowers(mx+9,my+40,13);fence(mx+48,my+59,20);lamp(mx+8,my+34);rect(mx+22,my+53,3,10,'woodDark');rect(mx+19,my+50,8,6,'door');rect(mx+20,my+51,5,1,'white');
 for(let i=0;i<5;i++)tuft(mx+13+i*17,my+62-(i%2)*5);
 if(stage>=2){bridge(mx+25,my+68,mx+25,my+93);for(let i=0;i<3;i++){rect(mx+23+i*7,my+91,3,8,'woodDark');rect(mx+23+i*7,my+90,3,2,'woodLight');}boat(mx+23,my+94);}
 if(stage>=4)playground(mx+66,my+43);
 if(stage>=3){if(stage<7){flowers(px+14,py+18,22);tuft(px+20,py+30);}else{path(px+30,py+15,12,52);flowers(px+9,py+51,20);fence(px+8,py+65,25);}}
 if(stage>=5)pool(px+10,py+(stage>=7?39:15));
 if(stage>=6){duck(mx+75,my+99);duck(mx+89,my+107);duck(mx+71,my+112);}
 if(stage>=8){chair(px+47,py+46);flowers(px+6,py+29,17);flowers(px+47,py+65,14);}
 if(stage>=9)house(px+25,py+20,true,false);
 if(stage>=10){path(nx+30,ny+39,13,32);house(nx+20,ny+18,false,true);tree(nx+63,ny+24);lamp(nx+9,ny+39);}
 if(stage>=11){fence(nx+6,ny+66,63);flowers(nx+8,ny+49,17);flowers(nx+46,ny+51,18);flowers(nx+11,ny+61,47);for(let i=0;i<4;i++){oval(nx+13+i*12,ny+67,7,5,'leaf');rect(nx+16+i*12,ny+66,2,2,'gold');}}
 if(stage>=12){island(vx-5,vy+8,38,29);poly([[vx,vy+28],[vx+5,vy+4],[vx+12,vy-6],[vx+23,vy-6],[vx+31,vy+27]],'ink');poly([[vx+2,vy+27],[vx+8,vy+3],[vx+13,vy-5],[vx+21,vy-5],[vx+27,vy+27]],'stone');poly([[vx+15,vy+3],[vx+21,vy-2],[vx+26,vy+24],[vx+20,vy+27]],'seam');rect(vx+12,vy-5,11,5,'woodDark');rect(vx+14,vy-4,7,2,'roofDark');rect(vx+7,vy+16,3,6,'sand');rect(vx+14,vy+9,2,10,'sand');tuft(vx+1,vy+27);tuft(vx+28,vy+24);}
 return L;
}
