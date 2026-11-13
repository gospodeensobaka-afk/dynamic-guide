/* Session image cache. No tokens, external dependencies or background worker. */
(() => {
  'use strict';
  const entries=new Map();
  let queue=[], mode='', background=null, hiddenByVK=false, urgentCount=0;
  const progress=document.createElement('div');
  progress.className='media-preload-progress';progress.hidden=true;
  const questProgress=progress.cloneNode();questProgress.classList.add('media-preload-quest');
  document.body.append(questProgress);
  let activeURLs=[];
  function key(src){try{const u=new URL(src,document.baseURI);return u.origin===location.origin||window.Relay.allowedURL(u.href)?u.href:null;}catch(_){return null;}}
  function entry(src){const url=key(src);if(!url)return null;if(!entries.has(url))entries.set(url,{url,state:'idle',attempts:0,image:null,promise:null});return entries.get(url);}
  function update(){
    const ready=activeURLs.filter(url=>entries.get(url)?.state==='ready').length;
    const failed=activeURLs.filter(url=>entries.get(url)?.state==='failed').length;
    const text=ready===activeURLs.length?'Изображения подготовлены: '+ready:('Подготовка изображений: '+ready+' из '+activeURLs.length+(failed?' · часть пока недоступна':''));
    progress.textContent=questProgress.textContent=text;
    progress.hidden=mode!=='relay';questProgress.hidden=mode!=='quest';
  }
  function load(item,priority){
    if(item.state==='ready')return Promise.resolve(item.image);
    if(item.promise){if(priority==='high')item.image.fetchPriority='high';return item.promise;}
    item.state='loading';item.attempts++;
    const image=new Image();item.image=image;image.decoding='async';image.fetchPriority=priority;
    item.promise=new Promise((resolve,reject)=>{
      let done=false;
      const finish=(ok)=>{if(done)return;done=true;clearTimeout(timeout);image.onload=image.onerror=null;item.promise=null;item.state=ok?'ready':'failed';if(!ok){image.removeAttribute('src');item.image=null;}update();ok?resolve(image):reject(new Error('Image unavailable'));};
      const timeout=setTimeout(()=>finish(false),45000);
      image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=item.url;
    });
    return item.promise;
  }
  function pump(){
    if(background||urgentCount||!mode||document.hidden||hiddenByVK)return;
    const item=queue.shift();if(!item)return;
    if(item.state==='ready'||item.attempts>=3){pump();return;}
    background=item;
    load(item,'low').catch(()=>{if(activeURLs.includes(item.url)&&item.attempts<3)queue.push(item);}).finally(()=>{
      background=null;setTimeout(pump,200);
    });
  }
  async function ensure(src){
    const item=entry(src);if(!item)throw new Error('Unsupported image');
    urgentCount++;
    try{const image=await load(item,'high');if(image.decode)await image.decode();return image;}
    finally{urgentCount--;pump();}
  }
  function start(next){
    mode=next;
    let urls=[];
    if(mode==='relay')urls=[...Relay.photos].sort((a,b)=>Number(a.id)-Number(b.id)).map(p=>p.url);
    if(mode==='quest'){
      const media=src=>window.vkMediaUrl('dynamic-guide',src);
      // First riddle, map, then remaining riddles and reusable cipher sheets.
      urls=[media(QUESTS[0].riddleImage),...(window.VK_MAP?.layers||[]).map(l=>l.url),...QUESTS.map(q=>media(q.riddleImage)),...ALL_CIPHERS.map(c=>media(c.image))];
    }
    activeURLs=[...new Set(urls.map(key).filter(Boolean))];
    queue=activeURLs.map(url=>entry(url)).filter(e=>e.state!=='ready');
    queue.forEach(e=>{if(e.state==='failed')e.attempts=0;});
    const card=document.querySelector('#relayTourist .relay-card');if(card&&!progress.isConnected)card.querySelector('.relay-status').before(progress);
    update();pump();
  }
  function stop(){mode='';queue=[];invalidate();update();}
  document.addEventListener('visibilitychange',pump);
  window.addEventListener('online',()=>{if(mode)start(mode);});
  if(window.vkBridge?.subscribe)vkBridge.subscribe(e=>{
    if(e.detail?.type==='VKWebAppViewHide')hiddenByVK=true;
    if(e.detail?.type==='VKWebAppViewRestore'){hiddenByVK=false;pump();}
  });
  // Override the original unbounded preload without editing app.js.
  window.preloadAllImages=()=>{if(mode!=='quest')start('quest');};
  let questTicket=0,cipherTicket=0;
  function invalidate(){questTicket++;cipherTicket++;}
  const originalQuest=window.loadQuest,originalWait=window.showWaiting;
  window.showWaiting=function(){invalidate();document.querySelector('#riddleWaiting .waiting-text').textContent='Ожидание следующей загадки…';return originalWait.apply(this,arguments);};
  window.loadQuest=function(id){
    const q=QUESTS.find(q=>q.id===id);if(!q)return window.showWaiting();
    const ticket=++questTicket;cipherTicket++;
    originalWait();
    const label=document.querySelector('#riddleWaiting .waiting-text');label.textContent='Загружаем загадку…';
    ensure(window.vkMediaUrl('dynamic-guide',q.riddleImage)).then(()=>{
      if(ticket===questTicket&&mode==='quest'){label.textContent='Ожидание следующей загадки…';originalQuest(id);}
    }).catch(()=>{if(ticket===questTicket&&mode==='quest'){label.textContent='Не удалось загрузить загадку. Повторяем…';setTimeout(()=>{if(ticket===questTicket&&mode==='quest')window.loadQuest(id);},5000);}});
  };
  const originalCipher=window.selectCipher;
  window.selectCipher=function(cipher,button,preview){
    if(mode!=='quest'||!button.isConnected)return;
    const ticket=++cipherTicket;preview.textContent='Загружаем дешифровщик…';
    ensure(window.vkMediaUrl('dynamic-guide',cipher.image)).then(()=>{
      if(ticket===cipherTicket&&mode==='quest'&&button.isConnected)originalCipher(cipher,button,preview);
    }).catch(()=>{if(ticket===cipherTicket&&mode==='quest')preview.textContent='Не удалось загрузить. Нажмите на дешифровщик ещё раз.';});
  };
  window.MediaPreload={start,stop,ensure};
})();
