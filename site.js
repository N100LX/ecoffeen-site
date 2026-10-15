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
if('IntersectionObserver' in window&&!rm){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});R.forEach(function(el){io.observe(el)})}else R.forEach(function(el){el.classList.add('in')});
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
var S=['equine-1','equine-2','equine-14','equine-18'],E=[],k=0;
function mk(n){var e=d.createElement('i');e.style.backgroundImage='url(img/'+n+'-2000.webp)';h.appendChild(e);return e}
E.push(mk(S[0]));E[0].classList.add('on');if(rm)return;
addEventListener('load',function(){setTimeout(function(){var ok=1;S.slice(1).forEach(function(n){var im=new Image();im.src='img/'+n+'-2000.webp';E.push(mk(n))});
setInterval(function(){var p=E[k];k=(k+1)%E.length;E[k].classList.remove('out');void E[k].offsetWidth;E[k].classList.add('on');p.classList.remove('on');p.classList.add('out')},6000)},300)});
var st=d.querySelector('.strip'),t=0;function u(){t=0;var y=scrollY;if(st){var r=st.getBoundingClientRect();if(r.bottom>-100&&r.top<innerHeight+100)st.style.setProperty('--sy',((r.top+r.height/2-innerHeight/2)*-.15).toFixed(1)+'px')}}
addEventListener('scroll',function(){if(!t)t=requestAnimationFrame(u)},{passive:true});u()})();
