/* No server, album, remote library or stored token. */
(() => {
  'use strict';
  const GROUP = '236911218', VERSION = '5.199';
  const appId = Number(new URLSearchParams(location.search).get('vk_app_id')) || 0;
  let token, tokenPromise, denied = false, generation = 0, timer;
  const photos = Array.isArray(window.RELAY_PHOTOS) ? window.RELAY_PHOTOS : [];
  const byId = new Map(photos.map(p => [String(p.id), p]));
  function allowedURL(value) {
    try { const u=new URL(value); return u.protocol==='https:' && /(^|\.)(userapi\.com|vk\.com|vk\.ru|vkuserphoto\.ru)$/.test(u.hostname); }
    catch (_) { return false; }
  }
  function parse(value) {
    const text=String(value || '').trim();
    if (!text) return {type:'pause'};
    if (/^\d+$/.test(text)) return {type:'quest',id:Number(text)};
    if (/^p\d+$/.test(text)) return {type:'photo',id:text.slice(1)};
    return {type:'ignore'};
  }
  function code(e) { return Number(e?.error_data?.error_code || e?.error_code || e?.code || 0); }
  function errorText(e) {
    if(e?.auth || [5,7,15,27,28].includes(code(e))) return 'Нет доступа ВК. Закройте приложение и откройте заново.';
    if(code(e)===6) return 'ВК просит подождать. Повторите чуть позже.';
    return 'Не удалось связаться с ВК. Проверьте интернет.';
  }
  async function userToken() {
    if(denied) throw {auth:true};
    if(token) return token;
    if(!tokenPromise) tokenPromise=vkBridge.send('VKWebAppGetAuthToken',{app_id:appId,scope:''})
      .then(r=>{ if(!r.access_token) throw {auth:true}; return token=r.access_token; })
      .catch(()=>{ denied=true; throw {auth:true}; }).finally(()=>{tokenPromise=null;});
    return tokenPromise;
  }
  async function api(method,params,accessToken) {
    const r=await vkBridge.send('VKWebAppCallAPIMethod',{method,params:{...params,v:VERSION,access_token:accessToken}});
    if(r.error || r.response?.error) throw r.error || r.response.error;
    if(r.response===undefined) throw new Error('Missing response');
    return r.response;
  }
  async function read(accessToken) {
    const r=await api('groups.getById',{group_id:GROUP,fields:'description'},accessToken);
    const group=r.groups ? r.groups[0] : r[0];
    if(!group) throw new Error('Missing group');
    return String(group.description || '').trim();
  }
  function stop() { generation++; clearTimeout(timer); }
  function poll(receive,onError) {
    stop(); const ticket=generation;
    async function step() {
      if(ticket!==generation) return;
      let fatal=false;
      try { const value=await read(await userToken()); if(ticket===generation) receive(parse(value)); }
      catch(e) { fatal=!!e?.auth || [5,7,15,27,28].includes(code(e)); if(fatal) denied=true; if(ticket===generation) onError(errorText(e)); }
      if(ticket===generation && !fatal) timer=setTimeout(step,4000);
    }
    step();
  }
  function shell(id,html) {
    const el=document.createElement('section'); el.id=id; el.className='relay-shell'; el.hidden=true; el.innerHTML=html; document.body.append(el); return el;
  }
  function buildViewer() {
    const box=shell('relayViewer','<button type="button" class="relay-viewer-close">Закрыть просмотр</button><div class="relay-stage"><img alt="Фотография экскурсии" draggable="false"></div>');
    box.classList.add('relay-viewer');
    box.setAttribute('role','dialog'); box.setAttribute('aria-label','Просмотр фотографии. Короткий тап или Escape — закрыть.'); box.setAttribute('aria-modal','true');
    box.tabIndex=-1;
    const stage=box.querySelector('.relay-stage'), img=stage.querySelector('img'), points=new Map();
    const closeButton=box.querySelector('button');
    let scale=1,x=0,y=0,start,restoreFocus,tap=null;
    const render=()=>{img.style.transform=`translate(${x}px,${y}px) scale(${scale})`;};
    const basis=()=>{const a=[...points.values()]; if(!a.length) return null; const b=a[1]||a[0]; return {x:(a[0].x+b.x)/2,y:(a[0].y+b.y)/2,d:Math.hypot(a[0].x-b.x,a[0].y-b.y)||1,scale,tx:x,ty:y};};
    stage.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      e.preventDefault();
      tap=points.size===0?{id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now()}:null;
      points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      stage.setPointerCapture(e.pointerId); start=basis();
    });
    stage.addEventListener('pointermove',e=>{
      if(!points.has(e.pointerId)||!start)return;
      if(tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>10)tap=null;
      points.set(e.pointerId,{x:e.clientX,y:e.clientY}); const b=basis();
      scale=Math.max(1,Math.min(5,start.scale*(points.size>1?b.d/start.d:1)));
      x=start.tx+b.x-start.x; y=start.ty+b.y-start.y; if(scale===1)x=y=0; render();
    });
    stage.addEventListener('pointerup',e=>{
      if(!points.has(e.pointerId))return;
      const isTap=tap&&tap.id===e.pointerId&&points.size===1&&performance.now()-tap.time<300&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<=10;
      tap=null;points.delete(e.pointerId);start=basis();
      if(isTap)close();
    });
    for(const type of ['pointercancel','lostpointercapture'])stage.addEventListener(type,e=>{
      tap=null;points.delete(e.pointerId);start=basis();
    });
    stage.addEventListener('wheel',e=>{e.preventDefault();tap=null;scale=Math.max(1,Math.min(5,scale-e.deltaY/500));if(scale===1)x=y=0;render();},{passive:false});
    function close(){if(box.hidden)return;box.hidden=true;points.clear();tap=null;start=null;restoreFocus?.focus({preventScroll:true});}
    closeButton.onclick=close;
    box.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){e.preventDefault();closeButton.focus();}
    });
    return {close,open(url){if(!allowedURL(url))return;restoreFocus=document.activeElement;points.clear();tap=null;start=null;scale=1;x=y=0;render();img.src=url;box.hidden=false;box.focus({preventScroll:true});}};
  }
  window.Relay={GROUP,VERSION,appId,photos,byId,allowedURL,parse,code,errorText,api,read,poll,stop,shell,buildViewer};
})();
