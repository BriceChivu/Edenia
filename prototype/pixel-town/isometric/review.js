import {render} from './art.js';
const q=new URLSearchParams(location.search);
let stage=q.get('stage')==='2'?2:12;
let light=['day','sunset','night'].includes(q.get('light'))?q.get('light'):'day';
let motion=q.get('motion')!=='still';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const $=id=>document.getElementById(id),hero=$('hero');
const labels={day:'Day · 13:00',sunset:'Sunset · 18:30',night:'Night · 22:00'};
const base=document.createElement('canvas'),scratch=document.createElement('canvas');
const frames=36,tileSize=32;
let patches=null,previous=[],frame=0,timer=null,generation=0,building=false,inView=false;
const canAnimate=()=>motion&&!reduced.matches&&!document.hidden&&inView;
function showState(){
 $('motion').textContent=motion?'Pause animation':'Play animation';
 $('motion').setAttribute('aria-pressed',String(motion));
 $('motion').disabled=reduced.matches;
 $('motion-state').textContent=reduced.matches?'Still · system reduced motion':!motion?'Still':!inView||document.hidden?'Animation paused offscreen':building?'Preparing gentle motion…':'Gentle motion';
}
function stop(){clearTimeout(timer);timer=null;generation++;building=false;}
function still(){const ctx=hero.getContext('2d');ctx.drawImage(base,0,0);previous=[];frame=0;}
function play(){
 if(!canAnimate()||!patches)return;
 const ctx=hero.getContext('2d');
 // Restore only previously changed tiles, then apply the current frame's patches.
 for(const p of previous)ctx.drawImage(base,p.x,p.y,p.w,p.h,p.x,p.y,p.w,p.h);
 previous=patches[frame];for(const p of previous)ctx.drawImage(p.canvas,p.x,p.y);
 frame=(frame+1)%frames;
 timer=setTimeout(play,1000/6);
}
async function build(){
 if(building||patches||!canAnimate())return;
 building=true;showState();const token=++generation,result=[];
 const reference=base.getContext('2d').getImageData(0,0,base.width,base.height).data;
 for(let f=0;f<frames;f++){
  // Yield between fixtures; abandon stale work after any setting or lifecycle change.
  await new Promise(resolve=>setTimeout(resolve,0));
  if(token!==generation||!canAnimate())return;
  render(scratch,{stage,light,time:f/6});
  const ctx=scratch.getContext('2d',{willReadFrequently:true});
  const pixels=ctx.getImageData(0,0,scratch.width,scratch.height).data,tiles=[];
  for(let y=0;y<base.height;y+=tileSize)for(let x=0;x<base.width;x+=tileSize){
   const w=Math.min(tileSize,base.width-x),h=Math.min(tileSize,base.height-y);let changed=false;
   scan:for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=(yy*base.width+xx)*4;if(pixels[i]!==reference[i]||pixels[i+1]!==reference[i+1]||pixels[i+2]!==reference[i+2]){changed=true;break scan;}}
   if(changed){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(scratch,x,y,w,h,0,0,w,h);tiles.push({x,y,w,h,canvas});}
  }
  result.push(tiles);
 }
 if(token!==generation)return;
 patches=result;building=false;showState();play();
}
function reconcile(){stop();if(!canAnimate()){still();showState();return;}showState();if(patches)play();else build();}
function update(){
 stop();patches=null;previous=[];frame=0;
 render(base,{stage,light});hero.width=base.width;hero.height=base.height;still();
 hero.setAttribute('aria-label',`${stage===2?'Early':'Mature'} isometric pixel town, ${labels[light]}`);
 render($('compare'),{stage});$('compare').setAttribute('aria-label','Pixel-art reinterpretation in daylight');
 $('original').src=`../../../images/city/level%20${stage}.webp`;$('original').alt=`Existing stage ${stage} town artwork`;
 $('caption').textContent=`${stage===2?'Early town · home & boat':'Mature town · the full island group'} / ${labels[light]}`;
 document.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.stage===stage)));
 document.querySelectorAll('[data-light]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.light===light)));
 syncUrl();reconcile();
}
function syncUrl(){history.replaceState(null,'',`?stage=${stage}&light=${light}&motion=${motion?'gentle':'still'}`);}
document.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>{stage=+b.dataset.stage;update();});
document.querySelectorAll('[data-light]').forEach(b=>b.onclick=()=>{light=b.dataset.light;update();});
$('motion').onclick=()=>{motion=!motion;syncUrl();reconcile();};
reduced.addEventListener('change',reconcile);document.addEventListener('visibilitychange',reconcile);
const observer=new IntersectionObserver(([entry])=>{const next=entry.isIntersecting;if(next!==inView){inView=next;reconcile();}},{threshold:0});observer.observe(hero);
addEventListener('pagehide',()=>{stop();patches=null;});addEventListener('pageshow',()=>reconcile());
for(const stage of [2,12])for(const light of ['day','sunset','night']){
 const f=document.createElement('figure'),c=document.createElement('canvas'),cap=document.createElement('figcaption');
 render(c,{stage,light});c.role='img';c.setAttribute('aria-label',`Stage ${stage}, ${labels[light]}`);
 cap.textContent=`${stage===2?'Early':'Mature'} town · ${labels[light]}`;f.append(c,cap);$('gallery').append(f);
}
update();document.documentElement.dataset.ready='true';
