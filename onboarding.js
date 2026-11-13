/* Loaded after app.js and vk-patch.js; app.js stays byte-for-byte unchanged. */
(() => {
  'use strict';
  const R=window.Relay;
  let mode='choose', currentPhoto=null, pendingPhoto=null, photoTicket=0, lastNotified=null;
  const cache=window.MediaPreload;
  const menu=R.shell('modeChoice','<div class="relay-card relay-welcome"><div class="relay-compass" aria-hidden="true"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"> <circle cx="24" cy="24" r="23" stroke="#E8C97A" stroke-width="1.2" stroke-dasharray="6 3"/> <path d="M24 8 L26 18 L24 16 L22 18 Z" fill="#E8C97A"/> <path d="M24 40 L26 30 L24 32 L22 30 Z" fill="#E8C97A"/> <path d="M8 24 L18 22 L16 24 L18 26 Z" fill="#E8C97A"/> <path d="M40 24 L30 22 L32 24 L30 26 Z" fill="#E8C97A"/> <circle cx="24" cy="24" r="6" stroke="#E8C97A" stroke-width="1"/> <circle cx="24" cy="24" r="2" fill="#E8C97A"/> </svg></div><h1>Казань с Артуром</h1><p>Выберите режим экскурсии</p><button class="relay-choice" data-mode="quest"><strong>Квест</strong>Загадки и карта маршрута</button><button class="relay-choice" data-mode="relay"><strong>Ретранслятор фото</strong>Смотрите фотографии от гида</button></div>');
  const page=R.shell('relayTourist','<div class="relay-card"><button class="relay-back">← Выбор режима</button><form id="relayLogin"><div class="relay-compass" aria-hidden="true"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"> <circle cx="24" cy="24" r="23" stroke="#E8C97A" stroke-width="1.2" stroke-dasharray="6 3"/> <path d="M24 8 L26 18 L24 16 L22 18 Z" fill="#E8C97A"/> <path d="M24 40 L26 30 L24 32 L22 30 Z" fill="#E8C97A"/> <path d="M8 24 L18 22 L16 24 L18 26 Z" fill="#E8C97A"/> <path d="M40 24 L30 22 L32 24 L30 26 Z" fill="#E8C97A"/> <circle cx="24" cy="24" r="6" stroke="#E8C97A" stroke-width="1"/> <circle cx="24" cy="24" r="2" fill="#E8C97A"/> </svg></div><h1>Ретранслятор фото</h1><label for="relayCode">Код доступа</label><input id="relayCode" type="password" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="XXXX" aria-describedby="relayCodeHint"><button class="relay-primary">Войти →</button><p id="relayCodeHint" class="relay-hint">Код выдаётся гидом перед началом экскурсии</p></form><div class="relay-status" role="status" aria-live="polite"></div><div class="relay-wait" hidden><div class="relay-wait-icon"><div class="relay-compass" aria-hidden="true"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"> <circle cx="24" cy="24" r="23" stroke="#E8C97A" stroke-width="1.2" stroke-dasharray="6 3"/> <path d="M24 8 L26 18 L24 16 L22 18 Z" fill="#E8C97A"/> <path d="M24 40 L26 30 L24 32 L22 30 Z" fill="#E8C97A"/> <path d="M8 24 L18 22 L16 24 L18 26 Z" fill="#E8C97A"/> <path d="M40 24 L30 22 L32 24 L30 26 Z" fill="#E8C97A"/> <circle cx="24" cy="24" r="6" stroke="#E8C97A" stroke-width="1"/> <circle cx="24" cy="24" r="2" fill="#E8C97A"/> </svg></div></div><p>Ожидание фото от гида</p><div class="relay-dots" aria-hidden="true"><span></span><span></span><span></span></div></div><button id="relayPhotoButton" hidden aria-label="Увеличить фотографию"><img class="relay-main-photo" alt="Фотография от гида"></button></div>');
  const form=page.querySelector('form'), waiting=page.querySelector('.relay-wait'), photoButton=page.querySelector('#relayPhotoButton'), img=photoButton.querySelector('img'), status=page.querySelector('.relay-status');
  const viewer=R.buildViewer();
  let vibration=true;
  try{vibration=localStorage.getItem('relay-vibration-v1')!=='off';}catch(_){}
  const vibrationButton=document.createElement('button');vibrationButton.type='button';vibrationButton.className='relay-vibration';
  function vibrationLabel(){vibrationButton.textContent='Виброотклик: '+(vibration?'вкл.':'выкл.');vibrationButton.setAttribute('aria-pressed',String(vibration));}
  async function notifyPhoto(){
    if(!vibration||document.hidden)return;
    try{
      if(window.vkBridge?.supports?.('VKWebAppTapticNotificationOccurred')){
        const result=await vkBridge.send('VKWebAppTapticNotificationOccurred',{type:'success'});
        if(result?.result!==false)return;
      }
    }catch(_){}
    try{navigator.vibrate?.(120);}catch(_){}
  }
  vibrationButton.onclick=()=>{vibration=!vibration;try{localStorage.setItem('relay-vibration-v1',vibration?'on':'off');}catch(_){}vibrationLabel();if(vibration)notifyPhoto();};
  vibrationLabel();page.querySelector('.relay-back').after(vibrationButton);

  const seen=new Map();
  const gallery=document.createElement('div');gallery.hidden=true;
  const heading=document.createElement('h2');heading.textContent='Предыдущие фотографии';gallery.append(heading);
  const thumbnails=document.createElement('div');thumbnails.className='relay-grid';gallery.append(thumbnails);
  photoButton.after(gallery);
  function clearGallery(){photoTicket++;pendingPhoto=null;lastNotified=null;seen.clear();thumbnails.replaceChildren();gallery.hidden=true;currentPhoto=null;img.removeAttribute('src');photoButton.hidden=true;viewer.close();}
  function remember(p){
    if(seen.has(p.id))return;seen.set(p.id,p);
    const tile=document.createElement('button');tile.type='button';tile.className='relay-tile';tile.setAttribute('aria-label',p.title);
    const preview=document.createElement('img');preview.src=p.url;preview.alt=p.title;preview.loading='lazy';tile.append(preview);
    tile.onclick=()=>viewer.open(p.url);thumbnails.append(tile);gallery.hidden=false;
  }

  const back=document.createElement('button');back.textContent='← Режимы';back.className='relay-quest-back';back.hidden=true;document.body.append(back);
  function choose(){photoTicket++;pendingPhoto=null;cache.stop();mode='choose';R.stop();clearInterval(pollingTimer);pollingTimer=null;menu.hidden=false;page.hidden=true;back.hidden=true;viewer.close();closeCipherOverlay();document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));}
  back.onclick=choose;page.querySelector('.relay-back').onclick=choose;
  menu.querySelector('[data-mode="quest"]').onclick=()=>{mode='quest';cache.start('quest');menu.hidden=true;back.hidden=false;showScreen('passwordScreen');};
  menu.querySelector('[data-mode="relay"]').onclick=()=>{mode='relay';cache.start('relay');menu.hidden=true;page.hidden=false;form.hidden=false;gallery.hidden=true;waiting.hidden=true;photoButton.hidden=true;status.textContent='';page.querySelector('input').value='';};
  function receive(state){
    gallery.hidden=seen.size===0;
    if(state.type==='pause') {clearGallery();currentPhoto=null;photoButton.hidden=true;waiting.hidden=false;status.textContent='Галерея очищена гидом.';viewer.close();return;}
    if(state.type!=='photo') return;
    const p=R.byId.get(state.id);
    if(!p || !R.allowedURL(p.url)){photoTicket++;pendingPhoto=null;currentPhoto=null;photoButton.hidden=true;waiting.hidden=false;status.textContent='Это фото пока не подготовлено. Сообщите гиду.';viewer.close();return;}
    if(currentPhoto===p.id){status.textContent='Нажмите на фото, чтобы увеличить';return;}
    if(pendingPhoto===p.id)return;
    remember(p);
    pendingPhoto=p.id;currentPhoto=null;const ticket=++photoTicket;
    viewer.close();photoButton.hidden=true;waiting.hidden=false;
    status.textContent='Новое фото от гида. Загружаем…';
    if(lastNotified!==p.id){lastNotified=p.id;notifyPhoto();}
    cache.ensure(p.url).then(()=>{
      if(ticket!==photoTicket||mode!=='relay')return;
      pendingPhoto=null;currentPhoto=p.id;img.src=p.url;img.alt=p.title;
      remember(p);waiting.hidden=true;photoButton.hidden=false;
      status.textContent='Нажмите на фото, чтобы увеличить';
    }).catch(()=>{
      if(ticket!==photoTicket||mode!=='relay')return;
      pendingPhoto=null;currentPhoto=null;
      status.textContent='Фото пока не загрузилось. Повторим автоматически.';
    });
  }

  img.onerror=()=>{status.textContent='Фото не загрузилось. Проверьте интернет или сообщите гиду.';currentPhoto=null;};
  photoButton.onclick=()=>{const p=R.byId.get(currentPhoto);if(p)viewer.open(p.url);};
  form.onsubmit=e=>{e.preventDefault();if(page.querySelector('input').value!=='4444'){status.textContent='Неверный код';return;}form.hidden=true;waiting.hidden=false;status.textContent='';currentPhoto=null;R.poll(receive,text=>{status.textContent=text;});};
  // One cancellable polling chain for both modes. An old response cannot affect a new mode.
  window.startPolling=function(){
    if(mode!=='quest')return;
    clearInterval(pollingTimer);lastPolledId=null;
    R.poll(state=>{
      if(mode!=='quest'||!['pause','quest'].includes(state.type))return;
      const n=state.type==='pause'?0:state.id;
      if(n!==lastPolledId){lastPolledId=n;if(n===0)showWaiting();else loadQuest(n);}
    },text=>{const el=document.querySelector('#riddleWaiting .waiting-text');if(el)el.textContent=text;});
  };
  const submit=window.submitPassword;
  window.submitPassword=function(){if(mode==='quest')return submit.apply(this,arguments);};
  choose();
})();
