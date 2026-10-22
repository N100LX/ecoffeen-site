(function(){
var d=document,de=d.documentElement,H=d.querySelector('header');
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
function sh(){if(H)de.style.setProperty('--hh',H.offsetHeight+'px')}
/* header shrink on scroll; keep --hh at the shrunk height for anchor offsets */
var shr=false;function onS(){var s=scrollY>40;if(s!==shr){shr=s;H.classList.toggle('shrink',s)}}
if(H){addEventListener('scroll',onS,{passive:true});onS();}
/* anchor offset: compute target with the shrunk header height */
function hh(){if(!H)return 0;var was=H.classList.contains('shrink');H.classList.add('shrink');var h=H.offsetHeight;if(!was)H.classList.remove('shrink');return h}
var pend=null;addEventListener('scrollend',function(){if(pend){var t=pend;pend=null;var dy=t.getBoundingClientRect().top-hh();if(Math.abs(dy)>2)scrollTo({top:scrollY+dy,behavior:'instant'})}});
function goHash(smooth){if(location.hash.length>1){var t=d.getElementById(decodeURIComponent(location.hash.slice(1)));if(t){if(smooth&&!rm)pend=t;scrollTo({top:t.getBoundingClientRect().top+scrollY-hh(),behavior:smooth&&!rm?'smooth':'instant'})}}}
d.addEventListener('click',function(e){var a=e.target.closest('a[href^="#"]');if(!a||a.getAttribute('href').length<2)return;var t=d.getElementById(a.getAttribute('href').slice(1));if(!t)return;e.preventDefault();history.pushState(null,'',a.getAttribute('href'));goHash(true);t.setAttribute('tabindex','-1');t.focus({preventScroll:true})});
addEventListener('load',function(){sh();goHash();setTimeout(function(){goHash();de.classList.add('sm')},150)});
addEventListener('hashchange',function(){goHash(true)});addEventListener('resize',sh);sh();
/* reveal on scroll */
var R=d.querySelectorAll('.rv');
if('IntersectionObserver' in window&&!rm){var io=new IntersectionObserver(function(es){var n=0;es.forEach(function(e){if(e.isIntersecting){if(e.target.classList.contains('g'))e.target.style.transitionDelay=Math.min(n++,5)*90+'ms';e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});R.forEach(function(el){io.observe(el)})}else R.forEach(function(el){el.classList.add('in')});
/* soft image load */
d.querySelectorAll('.g img').forEach(function(im){var g=im.closest('.g');function ok(){g.classList.add('ld')}if(im.complete&&im.naturalWidth)ok();else{im.addEventListener('load',ok);im.addEventListener('error',ok)}});
/* back to top */
var T=d.querySelector('.totop');if(T){var tv=false;function tt(){var v=scrollY>innerHeight*.9;if(v!==tv){tv=v;T.classList.toggle('on',v)}}addEventListener('scroll',tt,{passive:true});tt();T.addEventListener('click',function(e){e.preventDefault();scrollTo({top:0,behavior:rm?'instant':'smooth'});history.replaceState(null,'',location.pathname);var b=d.querySelector('.brand');if(b)b.focus({preventScroll:true})})}
/* active section in nav */
var NL=[].slice.call(d.querySelectorAll('nav a[href^="#"]'));if(NL.length&&'IntersectionObserver' in window){var SE=NL.map(function(a){return d.getElementById(a.getAttribute('href').slice(1))}).filter(Boolean);
var at=0;function ac(){at=0;var cur=null,mid=innerHeight*.4;SE.forEach(function(s){var r=s.getBoundingClientRect();if(r.top<=mid&&r.bottom>mid)cur=s.id});NL.forEach(function(a){a.classList.toggle('act',!!cur&&a.getAttribute('href')==='#'+cur)})}addEventListener('scroll',function(){if(!at)at=requestAnimationFrame(ac)},{passive:true});ac()}
/* shows filter + live list from /api/shows (ShootProof via Pages Function); static cards stay as no-JS/offline fallback */
var Q=d.getElementById('q');if(Q){var CS,CC=d.querySelector('.cards'),NO=d.querySelector('.none'),QC=d.getElementById('qc');
function fl(){var v=Q.value.trim().toLowerCase(),c=0;CS.forEach(function(el){var m=!v||el.textContent.toLowerCase().indexOf(v)>-1;el.hidden=!m;if(m)c++});CC.classList.toggle('f',!!v);NO.hidden=c>0;QC.textContent=v?c+' of '+CS.length+' shows':CS.length+' shows'}
function grab(){CS=[].slice.call(CC.querySelectorAll('.card'))}grab();
 var QX=d.getElementById('qx');function qx(){if(QX)QX.hidden=!Q.value}
 Q.addEventListener('input',function(){fl();qx()});if(QX)QX.addEventListener('click',function(){Q.value='';fl();qx();Q.focus()});
 Q.addEventListener('keydown',function(e){if(e.key==='Escape'&&Q.value){Q.value='';fl();qx()}});fl();qx();
function th(u){return '/api/thumb?u='+encodeURIComponent(u)}
function key(a){return a.map(function(x){return x.name+'\n'+x.url}).join('\n')}
function card(x,i){var a=d.createElement('a'),p=d.createElement('picture'),im=d.createElement('img'),dv=d.createElement('div'),h=d.createElement('h3'),sp=d.createElement('span');
 a.className='card';a.href=x.url;a.target='_blank';a.rel='noopener';im.src=th(x.cover);im.alt='Gallery cover for '+x.name;im.width=x.w;im.height=x.h;
 if(i===0)im.setAttribute('fetchpriority','high');if(i>3)im.loading='lazy';im.decoding='async';h.textContent=x.name;sp.textContent='View & order photos \u2197';
 p.appendChild(im);dv.appendChild(h);dv.appendChild(sp);a.appendChild(p);a.appendChild(dv);return a}
if(window.fetch&&CC)fetch('/api/shows').then(function(r){return r.ok?r.json():null}).then(function(j){
 if(!j||!Array.isArray(j.shows))return;var L=j.shows.filter(function(x){return x&&typeof x.name==='string'&&/^https:\/\/ecoffeenphoto\.shootproof\.com\//.test(x.url)&&/^https:\/\/d2rxqglyhdohqf\.cloudfront\.net\//.test(x.cover)});
 if(!L.length)return;var cur=CS.map(function(el){return{name:el.querySelector('h3').textContent,url:el.href}});
 if(key(cur)===key(L))return;var f=d.createDocumentFragment();L.forEach(function(x,i){f.appendChild(card(x,i))});
 CS.forEach(function(el){el.remove()});CC.appendChild(f);grab();fl()}).catch(function(){})}
/* Instagram live row from /api/instagram (Pages Function scrapes public profile; hide section on failure) */
var IG=d.getElementById('instagram'),IR=d.getElementById('ig-row');
if(IG&&IR&&window.fetch){for(var s=0;s<7;s++){var sk=d.createElement('span');sk.className='ig-tile sk';sk.setAttribute('aria-hidden','true');IR.appendChild(sk)}IG.hidden=false;IG.setAttribute('aria-busy','true')}
function igOff(){IR.querySelectorAll('.sk').forEach(function(e){e.remove()});IG.removeAttribute('aria-busy');if(!IR.children.length)IG.hidden=true}
if(IG&&IR&&window.fetch)fetch('/api/instagram').then(function(r){return r.ok?r.json():null}).then(function(j){
 if(!j||!Array.isArray(j.posts)){igOff();return}
 /* thumbs are same-origin only: self-hosted /assets/ig/<code>.jpg or the cached /api/igthumb proxy (never expiring IG CDN links) */
 var L=j.posts.filter(function(x){return x&&typeof x.code==='string'&&/^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\//.test(x.url)&&typeof x.thumb==='string'&&/^\/(assets\/ig\/[A-Za-z0-9_-]+\.jpg(\?v=\w+)?|api\/igthumb\?[^"'<>\s]+)$/.test(x.thumb)}).slice(0,9);
 if(!L.length){igOff();return}
 var f=d.createDocumentFragment();
 L.forEach(function(x,i){
  var a=d.createElement('a'),im=d.createElement('img');
  a.className='ig-tile';a.href=x.url;a.target='_blank';a.rel='noopener';a.setAttribute('aria-label','Instagram post');
  im.src=x.thumb;im.alt='';im.width=320;im.height=320;im.decoding='async';
  if(i>2)im.loading='lazy';
  im.addEventListener('load',function(){a.classList.add('ld')});
  /* a thumb that fails to load is dropped (no blank/broken tiles); if none are left, hide the whole section */
  im.addEventListener('error',function(){a.remove();if(!IR.querySelector('.ig-tile'))igOff()});
  if(im.complete&&im.naturalWidth)a.classList.add('ld');
  a.appendChild(im);f.appendChild(a);
 });
 IR.querySelectorAll('.sk').forEach(function(e){e.remove()});IR.appendChild(f);IG.hidden=false;IG.removeAttribute('aria-busy');IG.querySelectorAll('.rv').forEach(function(el){el.classList.add('in')});
 var tiles=[].slice.call(IR.querySelectorAll('.ig-tile'));
 if('IntersectionObserver' in window&&!rm){var io2=new IntersectionObserver(function(es){var n=0;es.forEach(function(e){if(e.isIntersecting){e.target.style.transitionDelay=Math.min(n++,6)*70+'ms';e.target.classList.add('in');io2.unobserve(e.target)}})},{rootMargin:'0px 0px -6% 0px'});tiles.forEach(function(el){io2.observe(el)})}
 else tiles.forEach(function(el){el.classList.add('in')});
}).catch(function(){if(IG&&IR)igOff()});
/* lightbox */
var L=d.getElementById('lb');if(!L)return;
var I=L.querySelector('img'),C=d.getElementById('lbc'),X=d.getElementById('x'),P=d.getElementById('p'),N=d.getElementById('n'),A=[],k=0,last=null;
var WP=d.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp')===0;
function show(){var a=A[k];I.src=(WP&&a.dataset.webp)||a.href;I.alt=a.querySelector('img').alt;C.textContent=(k+1)+' / '+A.length;
 var nx=A[(k+1)%A.length];(new Image()).src=(WP&&nx.dataset.webp)||nx.href}
function open(g,a){A=[].slice.call(g.querySelectorAll('a'));k=A.indexOf(a);last=a;show();L.classList.add('on');L.setAttribute('aria-hidden','false');d.body.style.overflow='hidden';X.focus()}
function close(){L.classList.remove('on');L.setAttribute('aria-hidden','true');d.body.style.overflow='';if(last)last.focus()}
function mv(s){k=(k+s+A.length)%A.length;if(rm){show();return}I.style.setProperty('--dx',(s>0?-40:40)+'px');I.classList.add('sw');setTimeout(function(){show();I.style.setProperty('--dx',(s>0?40:-40)+'px');requestAnimationFrame(function(){requestAnimationFrame(function(){I.classList.remove('sw')})})},180)}
d.querySelectorAll('.grid').forEach(function(g){g.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;e.preventDefault();open(g,a)})});
X.onclick=close;P.onclick=function(){mv(-1)};N.onclick=function(){mv(1)};
L.addEventListener('click',function(e){if(e.target===L)close()});
d.addEventListener('keydown',function(e){if(!L.classList.contains('on'))return;
 if(e.key==='Escape')close();else if(e.key==='ArrowLeft')mv(-1);else if(e.key==='ArrowRight')mv(1);
 else if(e.key==='Tab'){var f=[X,P,N],i=f.indexOf(d.activeElement);e.preventDefault();f[(i+(e.shiftKey?2:1))%3].focus()}});
var sx=0,sy=0;L.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
L.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))mv(dx<0?1:-1);else if(dy>70&&dy>Math.abs(dx))close()},{passive:true});
})();
(function(){var h=document.querySelector('.hero');if(!h||matchMedia('(prefers-reduced-motion: reduce)').matches)return;var t=0;function u(){t=0;var y=scrollY;if(y<h.offsetHeight+200)h.style.setProperty('--py',(y*.25).toFixed(1)+'px')}addEventListener('scroll',function(){if(!t)t=requestAnimationFrame(u)},{passive:true});u()})();

(function(){var d=document,h=d.querySelector('.hs');if(!h)return;var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var S=['/img/equine-1-2000.webp','/img/equine-2-2000.webp','/img/equine-14-2000.webp','/img/equine-18-2000.webp'],E=[],k=0;
function mk(n){var e=d.createElement('i');e.style.backgroundImage='url('+n+')';h.appendChild(e);return e}
E.push(mk(S[0]));E[0].classList.add('on');if(rm)return;
addEventListener('load',function(){setTimeout(function(){var ok=1;S.slice(1).forEach(function(n){var im=new Image();im.src=n;E.push(mk(n))});
setInterval(function(){var p=E[k];k=(k+1)%E.length;E[k].classList.remove('out');void E[k].offsetWidth;E[k].classList.add('on');p.classList.remove('on');p.classList.add('out')},6000)},300)});
var st=d.querySelector('.strip'),t=0;function u(){t=0;var y=scrollY;if(st){var r=st.getBoundingClientRect();if(r.bottom>-100&&r.top<innerHeight+100)st.style.setProperty('--sy',((r.top+r.height/2-innerHeight/2)*-.15).toFixed(1)+'px')}}
addEventListener('scroll',function(){if(!t)t=requestAnimationFrame(u)},{passive:true});u()})();
(function(){var d=document,rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var b=d.createElement('div');b.className='sp';b.setAttribute('aria-hidden','true');d.body.appendChild(b);var t=0;
function u(){t=0;var m=d.documentElement.scrollHeight-innerHeight;b.style.setProperty('--sp',m>0?Math.min(1,scrollY/m).toFixed(4):0)}
addEventListener('scroll',function(){if(!t)t=requestAnimationFrame(u)},{passive:true});addEventListener('resize',u);u();
var h=d.querySelector('.hs');if(!h||rm)return;var hero=h.parentNode,ind=d.createElement('div');ind.className='hsd';ind.setAttribute('aria-hidden','true');
for(var i=0;i<4;i++)ind.appendChild(d.createElement('b'));hero.appendChild(ind);var B=ind.children;
function sync(){var I=h.querySelectorAll('i'),k=0;for(var j=0;j<I.length;j++)if(I[j].classList.contains('on'))k=j;for(j=0;j<B.length;j++){var on=j===k;if(on&&!B[j].classList.contains('on')){B[j].classList.add('on')}else if(!on)B[j].classList.remove('on')}}
new MutationObserver(sync).observe(h,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});sync()})();
