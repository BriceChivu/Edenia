import {drawTown,layout,milestones,variants} from './art.js';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),media=matchMedia('(prefers-reduced-motion: reduce)');
let variant=variants[query.get('variant')]?query.get('variant'):'A',stage=Math.max(0,Math.min(12,Number(query.get('stage')??12))),hour=Number(query.get('hour')??18.5),frame=0,forcedPhone=query.get('phone')==='1',visible=true,plates=[];
if(!Number.isFinite(stage))stage=12;if(!Number.isFinite(hour)||hour<0||hour>=24)hour=18.5;
const timeText=h=>`${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round(h%1*60)).padStart(2,'0')}`;
$('stage').innerHTML=milestones.map((name,i)=>`<option value="${i}">${i} · ${name}</option>`).join('');$('stage').value=stage;$('time').value=timeText(hour);
$('motion').value=query.get('motion')==='gentle'&&!media.matches?'gentle':'still';
const descriptions={A:'A · Wide harbor. The island chain spreads across desktop, then folds into a compact triangle on phones. Larger water margins give the town breathing room.',B:'B · Island courtyard. A fixed, compact triangle puts the three homes around a central inlet. The same geography carries from phone to desktop.',C:'C · North–south islands. A taller composition keeps the rear islands above the main home, with the boat and volcano to the south. It uses more vertical page space.'};
function syncUrl(){let q=new URLSearchParams({variant,stage:String(stage),hour:String(hour),motion:$('motion').value});if(forcedPhone)q.set('phone','1');history.replaceState(null,'',`?${q}`);}
function fixture(container,s,h,label,phone=true){const f=document.createElement('figure'),canvas=document.createElement('canvas'),cap=document.createElement('figcaption');canvas.role='img';canvas.setAttribute('aria-label',`${milestones[s]} at ${timeText(h)}`);drawTown(canvas,{stage:s,hour:h,variant,phone});cap.textContent=label;f.append(canvas,cap);container.append(f);}
function update(){
 document.querySelector('.review').classList.toggle('phone',forcedPhone);const phone=forcedPhone||document.querySelector('.review').clientWidth<600;
 plates=Array.from({length:4},(_,frame)=>{const c=document.createElement('canvas');drawTown(c,{stage,hour,variant,phone,frame});return c;});
 const c=$('town');c.width=plates[0].width;c.height=plates[0].height;c.getContext('2d').drawImage(plates[0],0,0);const rgb=c.getContext('2d').getImageData(0,0,1,1).data;c.style.backgroundColor=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;c.setAttribute('aria-label',`Level ${stage}: ${milestones[stage]}. ${variants[variant]} at ${timeText(hour)}. Noninteractive overhead pixel town.`);
 $('stage-badge').textContent=stage===0?'Loading':`Level ${stage}`;$('milestone').textContent=milestones[stage];$('town-title').textContent=stage===0?'A quiet beginning':stage<=2?'Your first little home':'A place to come back to';$('variant-name').textContent=`${variant} · ${variants[variant]}`;$('variant-description').textContent=descriptions[variant];
 $('state').textContent=`${c.width} × ${c.height} logical pixels · ${phone?'phone':'desktop'} · stage ${stage} · ${timeText(hour)} local · ${media.matches?'system reduced motion':$('motion').value}`;
 $('phone').textContent=forcedPhone?'Full-width frame':'Phone frame';$('phone').setAttribute('aria-pressed',String(forcedPhone));
 $('timeline').innerHTML=Array.from({length:12},(_,i)=>`<button class="${stage===i+1?'active':''}" aria-pressed="${stage===i+1}" aria-label="Preview historical stage ${i+1}" data-stage="${i+1}">${i+1}</button>`).join('');
 $('lights').replaceChildren();for(const [h,name] of [[6,'Dawn'],[12,'Day'],[18,'Sunset begins'],[18.5,'Warm evening'],[19,'Blue hour arrives'],[22,'Night']])fixture($('lights'),stage,h,`${timeText(h)} · ${name}`);
 $('progression').replaceChildren();for(let i=0;i<=12;i++)fixture($('progression'),i,hour,`${i===0?'Loading':'Stage '+i} · ${milestones[i]}${[1,4,8,12].includes(i)?' · Intro sample':''}`);
 syncUrl();
}
$('references').innerHTML=milestones.map((name,i)=>`<figure><img loading="lazy" src="../../images/city/level%20${i}.webp" alt="Original stage ${i}"><figcaption>${i} · ${name}</figcaption></figure>`).join('');
function changeVariant(n){variant=['A','B','C'][(['A','B','C'].indexOf(variant)+n+3)%3];update();}
$('prev').onclick=()=>changeVariant(-1);$('next').onclick=()=>changeVariant(1);
addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea,button,[contenteditable]'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();changeVariant(e.key==='ArrowLeft'?-1:1);}});
$('stage').onchange=()=>{stage=Number($('stage').value);update();};$('time').onchange=()=>{if(!$('time').value)return;const [h,m]=$('time').value.split(':').map(Number);hour=h+m/60;update();};
$('now').onclick=()=>{const d=new Date();hour=d.getHours()+d.getMinutes()/60;$('time').value=timeText(hour);update();};$('motion').onchange=update;$('phone').onclick=()=>{forcedPhone=!forcedPhone;update();};
$('timeline').onclick=e=>{if(!e.target.dataset.stage)return;stage=Number(e.target.dataset.stage);$('stage').value=stage;update();};
let resize;addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(update,100);});media.addEventListener('change',update);
new IntersectionObserver(([e])=>{visible=e.isIntersecting;}).observe($('town'));
// Review only: cached full plates at 4fps. Production sparse patch measurements remain separate.
setInterval(()=>{if(document.hidden||!visible||media.matches||$('motion').value!=='gentle')return;frame=(frame+1)%4;$('town').getContext('2d').drawImage(plates[frame],0,0);},250);
// Isolated throwaway route is excluded by the production build's explicit copy list.
update();document.documentElement.dataset.ready='true';
