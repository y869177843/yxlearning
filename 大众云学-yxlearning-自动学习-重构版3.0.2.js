// ==UserScript==
// @name         大众云学-yxlearning-自动学习-重构版
// @namespace    无
// @version      3.0.2
// @description  山东大众云学公需课/专业课自动挂机：页面识别、课程完成跳转、百分比续学、静音自动播、弹题隐藏续播、播完下一节、可拖动浮窗。
// @match        *://*.yxlearning.com/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// @downloadURL @url:`https://update.greasyfork.org/scripts/542216/%E5%A4%A7%E4%BC%97%E4%BA%91%E5%AD%A6-yxlearning-%E8%87%AA%E5%8A%A8%E5%AD%A6%E4%B9%A0-%E9%87%8D%E6%9E%84%E7%89%88.user.js`
// @updateURL @url:`https://update.greasyfork.org/scripts/542216/%E5%A4%A7%E4%BC%97%E4%BA%91%E5%AD%A6-yxlearning-%E8%87%AA%E5%8A%A8%E5%AD%A6%E4%B9%A0-%E9%87%8D%E6%9E%84%E7%89%88.meta.js`
// ==/UserScript==
/*
 * 开发于：sddz-gxk.yxlearning.com / sddz-zyk.yxlearning.com
 * 调试：F12 控制台搜 [大众云学] 看日志。
 */
(function(){
  'use strict';
  const TAG='[大众云学]';
  const log=(...a)=>console.log(TAG,...a);
  const IS_DONGYING=['sddy-gxk.yxlearning.com','sddy-zyk.yxlearning.com'].includes(location.hostname.toLowerCase());
  const IS_DEZHOU=['sddz-gxk.yxlearning.com','sddz-zyk.yxlearning.com'].includes(location.hostname.toLowerCase());
  let automationPaused=localStorage.getItem('yxAutoPaused')==='1';
  function dongyingPlayer(){
    const p=window.baiJiaYunPlayer;
    return IS_DONGYING && p && typeof p.paused==='boolean' ? p : null;
  }
  function dongyingHome(){
    return IS_DONGYING && (location.pathname==='/' || location.pathname==='/index');
  }
  let dongyingHomeBusy=false;
  function dongyingGoStudyCenter(){
    if(!dongyingHome() || dongyingHomeBusy) return false;
    const findLink=()=>[...document.querySelectorAll('a[href]')].find(a=>{
      try{return new URL(a.href,location.href).pathname==='/my/learning' && visible(a);}catch(e){return false;}
    });
    const menu=[...document.querySelectorAll('a,button,div,span')].find(e=>
      (e.innerText||'').trim()==='我的学习' && visible(e));
    if(menu){
      dongyingHomeBusy=true;
      clickEl(menu,'东营我的学习菜单');
      setTimeout(()=>{
        const next=findLink();
        if(next) clickEl(next,'东营学习中心');
        else dongyingHomeBusy=false;
      },500);
      setOperation('正在打开我的学习','准备：点击学习中心');
      return true;
    }
    const link=findLink();
    if(link){
      dongyingHomeBusy=true;
      clickEl(link,'东营学习中心');
      setOperation('正在进入学习中心','准备：加载学习中课程');
      return true;
    }
    return false;
  }
  function gotoStudyCenter(){
    if(location.href.indexOf('/my/learning')<0) location.href='/my/learning';
  }
  function dongyingQuestionVisible(){
    const w=document.querySelector('.bplayer-question-wrap');
    if(!w) return false;
    const r=w.getBoundingClientRect();
    return getComputedStyle(w).display!=='none' && r.width>0 && r.height>0;
  }
  function dongyingHideQuestion(){
    const w=document.querySelector('.bplayer-question-wrap');
    if(!w || !dongyingQuestionVisible()) return false;
    w.style.setProperty('display','none','important');
    w.style.visibility='hidden';
    const p=dongyingPlayer();
    if(p){ p.popuping=false; p.canPopupQues=false; }
    log('东营：隐藏答题窗');
    return true;
  }
  function dongyingClickNext(){
    const rows=[...document.querySelectorAll('.course-list .videoLi')];
    const cur=rows.findIndex(e=>e.classList.contains('active'));
    if(cur<0) return false;
    const next=rows.slice(cur+1).find(e=>{
      const b=e.querySelector('.badge');
      return !b || parseFloat(b.textContent||'0')<100;
    });
    if(next){ clickEl(next,'东营下一节'); return true; }
    return false;
  }
  function dongyingSelectUnfinished(){
    const rows=[...document.querySelectorAll('.course-list .videoLi')];
    const cur=rows.findIndex(e=>e.classList.contains('active'));
    if(cur<0) return false;
    const badge=rows[cur].querySelector('.badge');
    if(!badge || parseFloat(badge.textContent||'0')<100) return false;
    return dongyingClickNext();
  }
  let dongyingPausedSince=0;
  let dongyingLastPlay=0;
  function dongyingTick(){
    if(automationPaused) return;
    const p=dongyingPlayer();
    if(dongyingSelectUnfinished()) return;
    if(!p) return;
    if(dongyingQuestionVisible()){
      dongyingHideQuestion();
      return;
    }
    if(p.ended===true || (p.duration>0 && p.currentTime>=p.duration-1)){
      dongyingClickNext();
      return;
    }
    try{ if(p.volume!==0 && typeof p.setVolume==='function') p.setVolume(0); }catch(e){ log('东营静音失败',e.message); }
    if(p.paused===true){
      if(!dongyingPausedSince) dongyingPausedSince=Date.now();
      if(Date.now()-dongyingPausedSince<3000 || Date.now()-dongyingLastPlay<8000) return;
      const btn=document.querySelector('.bplayer-play-btn');
      if(btn && visible(btn)){
        dongyingLastPlay=Date.now();
        dongyingPausedSince=0;
        clickEl(btn,'东营播放');
      }
    }else dongyingPausedSince=0;
  }
  function visible(el){
    if(!el) return false;
    const r=el.getBoundingClientRect();
    if(r.width<=0||r.height<=0) return false;
    const s=getComputedStyle(el);
    return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
  }
  function clickEl(el,why){
    if(!el) return false;
    const r=el.getBoundingClientRect();
    if(r.width<=0||r.height<=0) return false;
    const x=r.left+r.width/2,y=r.top+r.height/2;
    const o={bubbles:true,cancelable:true,view:window,clientX:x,clientY:y};
    el.dispatchEvent(new PointerEvent('pointerdown',{...o,pointerId:1,isPrimary:true}));
    el.dispatchEvent(new MouseEvent('mousedown',{...o,button:0,buttons:1}));
    el.dispatchEvent(new MouseEvent('mouseup',{...o,button:0,buttons:0}));
    el.dispatchEvent(new MouseEvent('click',{...o,button:0,buttons:0}));
    log('点击',why);
    return true;
  }
  function findPlayBtn(){
    let b=document.querySelector('.bplayer-play-btn');
    if(visible(b)) return b;
    b=document.querySelector('.shade .play-btn');
    if(visible(b)) return b;
    b=document.getElementById('play');
    if(visible(b)) return b;
    b=document.querySelector('.play_pause');
    if(visible(b)) return b;
    return null;
  }
  function getPlayer(){
    if(IS_DONGYING) return dongyingPlayer();
    try{
      const p=document.querySelector('.video-page')?.__vue__?.$refs?.myVideo?.player||null;
      if(p&&(p.paused===true||p.paused===false)) return p;
      return null;
    }catch(e){return null;}
  }
  function isQuestionShowing(){
    const w=document.querySelector('.bplayer-question-wrap');
    if(!w) return false;
    const s=getComputedStyle(w);
    if(s.display==='none') return false;
    const r=w.getBoundingClientRect();
    return r.width>0 && r.height>0;
  }
  function hideQuestion(){
    const w=document.querySelector('.bplayer-question-wrap');
    if(!w) return false;
    const s=getComputedStyle(w);
    if(s.display==='none') return false;
    const r=w.getBoundingClientRect();
    if(r.width<=0 || r.height<=0) return false;
    w.style.setProperty('display','none','important');
    w.style.visibility='hidden';
    try{
      const p=getPlayer();
      if(p){ p.popuping=false; p.canPopupQues=false; }
      const d=document.getElementById('yx-doing'); if(d) d.textContent='隐藏答题窗';
      const n=document.getElementById('yx-next'); if(n) n.textContent='准备：8秒后续播';
    }catch(e){}
    log('隐藏答题窗');
    return true;
  }
  function isEnded(){
    try{
      const p=getPlayer();
      if(p && p.ended===true) return true;
      const v=document.querySelector('video:not(#page-capture)');
      if(v && v.ended) return true;
      const cur=document.querySelector('.video-page')?.__vue__?.$data?.currentVideoData;
      if(cur && cur.learnSpeed>=100) return true;
    }catch(e){}
    return false;
  }
  let lastNext=0;
  function tryNext(){
    if(!isEnded()) return false;
    const now=Date.now();
    if(now-lastNext<8000) return false;
    lastNext=now;
    // 优先点 #advance / 下一节按钮
    const adv=document.getElementById('advance');
    if(adv && adv.offsetParent!==null){
      const btn=[...adv.querySelectorAll('a,button,span,div')].find(b=> /下一节|下一课/.test((b.textContent||'').trim()));
      if(btn){ clickEl(btn,'下一节(advance)'); return true; }
    }
    // 兜底：点目录里下一个未完成
    const details=[...document.querySelectorAll('.course-detail')].filter(e=> e.offsetParent!==null);
    const cur=details.find(e=> e.classList.contains('childselected'))||details.find(e=> e.classList.contains('selected-color'));
    const idx=details.indexOf(cur);
    for(let i=idx+1;i<details.length;i++){
      const txt=details[i].textContent||'';
      const pct=txt.match(/(\d+(\.\d+)?)%/);
      const rate=pct? parseFloat(pct[1]):0;
      if(rate<100){ clickEl(details[i],'下一节目录'); return true; }
    }
    // 实在没找到就点紧邻下一个
    if(idx>=0 && idx+1<details.length){ clickEl(details[idx+1],'下一节紧邻'); return true; }
    return false;
  }
  let completeFlowRunning=false;
  let studyFlowRunning=false;
  let studyFlowStarted=0;
  let atStudyTab=false;
  function exactText(text){
    return [...document.querySelectorAll('a,button,p,span,div')].find(e=>
      e.children.length===0 && (e.innerText||'').trim()===text && visible(e));
  }
  function setOperation(doing,next){
    const d=document.getElementById('yx-doing');
    const n=document.getElementById('yx-next');
    if(d) d.textContent=doing;
    if(n) n.textContent=next;
  }
  function showFinished(){
    const box=document.getElementById('yx-float');
    if(!box) return;
    const old=box.querySelector('.yx-finished');
    if(old) return;
    const msg=document.createElement('div');
    msg.className='yx-finished';
    msg.style.cssText='margin-top:8px;padding:7px 8px;background:#4caf50;color:#fff;border-radius:7px;text-align:center;font-size:11px;font-weight:600';
    msg.textContent='已完成全部学习';
    box.appendChild(msg);
    log('已完成全部学习');
  }
  function isCourseCompleteTip(){
    return [...document.querySelectorAll('*')].find(e=>{
      const t=(e.innerText||'');
      return /您已完成(?:该课程的学习|该班级学习)/.test(t) && visible(e);
    }) || null;
  }
  function clickLearnCenterThenMy(){
    setOperation('正在返回学习中心','准备：点击左侧我的学习');
    const center=exactText('学习中心');
    if(center) clickEl(center,'学习中心');
    setTimeout(()=>{
      const my=exactText('我的学习');
      if(my){
        clickEl(my,'我的学习');
        setOperation('已进入我的学习','准备：选择全部年度');
      }
      else setOperation('等待学习中心加载','准备：寻找我的学习');
    },1500);
  }
  function findContinueByPercent(){
    const cards=[...document.querySelectorAll('.course-card-item')].filter(visible);
    for(const card of cards){
      const m=(card.innerText||'').match(/(?:^|\n)(\d+(?:\.\d+)?)%(?:\n|$)/);
      if(!m || parseFloat(m[1])>=100) continue;
      const text=[...card.querySelectorAll('a,button,div,span')].find(e=>
        (e.innerText||'').trim()==='继续学习');
      let go=text;
      while(go && !visible(go)) go=go.parentElement;
      if(go) return {go,pct:m[1]+'%'};
    }
    const percentNodes=[...document.querySelectorAll('*')].filter(e=>{
      if(!visible(e)) return false;
      const m=(e.innerText||'').trim().match(/^(\d+(?:\.\d+)?)%$/);
      return m && parseFloat(m[1])<100;
    });
    for(const pct of percentNodes){
      let card=pct;
      for(let i=0;i<10 && card;i++,card=card.parentElement){
        const go=[...card.querySelectorAll('a,button,div,span')].find(e=>
          (e.innerText||'').trim()==='继续学习' && visible(e));
        if(go) return {go,pct:pct.innerText.trim()};
      }
    }
    return null;
  }
  function handleMyLearningPage(){
    if(!location.pathname.includes('/my/')) return false;
    if(completeFlowRunning && !studyFlowRunning) completeFlowRunning=false;
    if(!location.pathname.includes('/my/learning')) return false;
    if(IS_DONGYING){
      // 点击“学习中”标签（专业课 sddy-zyk），确保筛选学习中
      const studyTag=[...document.querySelectorAll('a[data-toggle="tab"]')].find(a=>
        (a.innerText||'').trim()==='学习中' && visible(a));
      if(studyTag && !atStudyTab) { clickEl(studyTag,'学习中标签'); atStudyTab=true; }
      const item=findContinueByPercent();
      if(item){
        clickEl(item.go,'点继续学习 '+item.pct);
        return true;
      }
      setOperation('未检测到待学习的课程','准备：结束');
      showFinished();
      return true;
    }
    if(!IS_DEZHOU) return true;
    if(!studyFlowStarted) studyFlowStarted=Date.now();
    const all=exactText('全部年度');
    if(all && !studyFlowRunning){
      studyFlowRunning=true;
      setOperation('正在打开我的学习','准备：点击全部年度');
      clickEl(all,'全部年度');
      setTimeout(()=>{
        const item=findContinueByPercent();
        if(item){
          setOperation('找到未完成课程 '+item.pct,'准备：点击右侧继续学习');
          clickEl(item.go,'继续学习 '+item.pct);
          studyFlowRunning=false;
          studyFlowStarted=0;
        }else if(Date.now()-studyFlowStarted>5000){
          setOperation('当前年度没有未完成课程','准备：结束');
          showFinished();
          studyFlowRunning=false;
        }
      },2000);
      return true;
    }
    if(studyFlowRunning) return true;
    const item=findContinueByPercent();
    if(item){
      setOperation('找到未完成课程 '+item.pct,'准备：点击右侧继续学习');
      clickEl(item.go,'继续学习 '+item.pct);
      studyFlowStarted=0;
      return true;
    }
    return true;
  }
  function handleCourseComplete(){
    const tip=isCourseCompleteTip();
    if(!tip || completeFlowRunning) return false;
    completeFlowRunning=true;
    setOperation('检测到课程完成','准备：返回学习中心');
    log('检测到完成提示');
    if(IS_DONGYING){
      const center=exactText('学习中心');
      if(center){ clickEl(center,'东营学习中心'); return true; }
    }
    const back=document.querySelector('.back-icon');
    if(back) clickEl(back.closest('svg')||back,'返回');
    else history.back();
    setTimeout(clickLearnCenterThenMy,1800);
    return true;
  }
  let lastClick=0;
  let pausedSince=0;
  function tick(){
    if(automationPaused) return;
    if(IS_DONGYING){
      // 东营公需课/专业课：非 /my/learning 学习中心、非播放器页 → 直接跳转学习中心
      if(location.hostname==='sddy-gxk.yxlearning.com' || location.hostname==='sddy-zyk.yxlearning.com'){
        if(location.pathname!=='/my/learning' && !window.baiJiaYunPlayer && !document.querySelector('.video-page') && !handleCourseComplete()){
          gotoStudyCenter();
          return;
        }
        if(location.pathname==='/my/learning'){
          handleMyLearningPage();
          return;
        }
        if(handleCourseComplete()) return;
        dongyingTick();
        return;
      }
    }
    if(!IS_DEZHOU) return;
    try{
      if(location.pathname.includes('/my/')){
        handleMyLearningPage();
        return;
      }
      if(handleCourseComplete()) return;
      hideQuestion();
      if(tryNext()) return;
      const p=getPlayer();
      if(!p) return;
      try{ if(p.options?.autoplay) p.options.autoplay=false; }catch(e){}
      if(!p.options?.token || !p.options?.vid || !p.options?.video?.url) return;
      if(p.switching || p.isSeeking || p.popuping) return;
      // 真正可播才点：duration 已知且 video 就绪
      if(!p.duration || p.duration===0) return;
      if(p.video && p.video.readyState===0) return;
      if(p.paused===true){
        if(!pausedSince) pausedSince=Date.now();
        if(Date.now()-pausedSince<8000) return;
        const now=Date.now();
        if(now-lastClick<10000) return;
        lastClick=now;
        pausedSince=0;
        try{
          log('试播 paused='+p.paused+' dur='+p.duration+' token='+!!p.options.token+' switching='+p.switching+' seeking='+p.isSeeking);
          p.play(); log('播放');
        }catch(e){
          log('播放异常 '+e.message);
          const btn=findPlayBtn();
          if(btn) clickEl(btn,'播放(兜底)');
        }
      } else {
        pausedSince=0;
        try{ if(p.volume>0) p.setVolume(0); }catch(e){}
        const v2=document.querySelector('video:not(#page-capture)');
        if(v2&&!v2.muted){ v2.muted=true; v2.volume=0; }
      }
    }catch(e){log('tick',e)}
  }
  function boot(){
    log('boot 3.1.0',location.hostname);
    if(!IS_DONGYING && !IS_DEZHOU){
      log('未匹配东营/德州域名，不启动流程');
      return;
    }
    // 通用入口：不在/my/且不是播放页时→点我的学习跳学习中心（找不到给提示）
    window.__entryHint=function(){
      if(automationPaused) return true;
      if(location.pathname==='/my/learning') return true;
      if(location.hostname==='sddy-gxk.yxlearning.com'){
        const isPlay=!!window.baiJiaYunPlayer || !!document.querySelector('.video-page');
        if(isPlay) return true;
        if(handleCourseComplete()) return true;
        if(location.pathname.indexOf('/my/learning')<0) location.href='/my/learning';
        return true;
      }
      return true;
    };
    // 浮窗：CDP 刷新 + 拖动 + 缩图标
    try{
      const box=document.createElement('div');
      box.id='yx-float';
      box.style.cssText='position:fixed;top:16px;right:16px;z-index:999999;background:linear-gradient(135deg,#fff 0%,#f8f9ff 100%);border:1px solid #e0e4ff;border-radius:12px;padding:12px 14px;font-size:12px;box-shadow:0 4px 20px rgba(80,80,180,.15);min-width:210px;font-family:system-ui,-apple-system,sans-serif;user-select:none';
      box.innerHTML='<div id=\"yx-header\" style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;cursor:move\"><div style=\"font-weight:700;color:#2a2e6b;font-size:13px\">📚 大众云学</div><div style=\"display:flex;align-items:center;gap:6px\"><span id=\"yx-status\" style=\"font-size:11px;padding:2px 8px;border-radius:20px;background:#e8f5e9;color:#2e7d32\">就绪</span><button id=\"yx-min\" style=\"width:22px;height:22px;border:none;background:#f0f0f5;border-radius:50%;cursor:pointer;font-size:12px;line-height:1\">−</button></div></div><div id=\"yx-info\" style=\"font-size:11px;color:#444;line-height:1.5;margin-bottom:8px;background:#f8f9ff;border-radius:8px;padding:8px\"><div>📄 <span id=\"yx-cur\">检测中...</span></div><div>⚙️ <span id=\"yx-doing\">等待操作</span></div><div>➡️ <span id=\"yx-next\">准备：检测播放状态</span></div></div><div id=\"yx-body\"><div style=\"display:flex;gap:8px\"><button id=\"yx-reload\" style=\"flex:1;padding:7px 10px;cursor:pointer;background:#4f46e5;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;transition:all .15s\">🔄 CDP刷新</button><button id=\"yx-play\" style=\"flex:1;padding:7px 10px;cursor:pointer;background:#fff;color:#4f46e5;border:1px solid #e0e4ff;border-radius:8px;font-size:12px;font-weight:600;transition:all .15s\">⏸ 脚本暂停</button></div><div style=\"font-size:11px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:7px 8px;margin-top:10px;line-height:1.4;text-align:center;font-weight:600\">⚠️ 浏览器刷新后若报错，请点 CDP刷新</div></div>';
      document.body.appendChild(box);
      // 小图标
      const mini=document.createElement('div');
      mini.id='yx-mini';
      mini.style.cssText='position:fixed;top:16px;right:16px;z-index:999999;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;display:none;align-items:center;justify-content:center;font-size:18px;cursor:pointer;box-shadow:0 4px 16px rgba(80,80,180,.3);user-select:none';
      mini.textContent='📚';
      mini.title='点击展开';
      document.body.appendChild(mini);
      const header=box.querySelector('#yx-header');
      const minBtn=box.querySelector('#yx-min');
      // 拖动
      let isDragging=false, startX, startY, startLeft, startTop;
      const getPos=()=>{ const r=box.getBoundingClientRect(); return {left:r.left, top:r.top}; };
      header.addEventListener('mousedown', e=>{
        isDragging=true;
        startX=e.clientX; startY=e.clientY;
        const pos=getPos();
        startLeft=pos.left; startTop=pos.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', e=>{
        if(!isDragging) return;
        const dx=e.clientX-startX, dy=e.clientY-startY;
        box.style.left=(startLeft+dx)+'px';
        box.style.top=(startTop+dy)+'px';
        box.style.right='auto';
        box.style.bottom='auto';
      });
      document.addEventListener('mouseup', ()=>{ isDragging=false; });
      // mini 也可拖
      let miniDrag=false, mx, my, ml, mt;
      mini.addEventListener('mousedown', e=>{
        miniDrag=true; mx=e.clientX; my=e.clientY;
        const r=mini.getBoundingClientRect(); ml=r.left; mt=r.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', e=>{
        if(!miniDrag) return;
        mini.style.left=(ml+e.clientX-mx)+'px';
        mini.style.top=(mt+e.clientY-my)+'px';
        mini.style.right='auto';
      });
      document.addEventListener('mouseup', ()=>{ miniDrag=false; });
      // 最小化/展开
      minBtn.onclick=()=>{
        box.style.display='none';
        const r=box.getBoundingClientRect();
        mini.style.left=r.left+'px';
        mini.style.top=r.top+'px';
        mini.style.display='flex';
      };
      mini.onclick=()=>{
        mini.style.display='none';
        box.style.display='block';
      };
      const reloadBtn=box.querySelector('#yx-reload');
      const playBtn=box.querySelector('#yx-play');
      playBtn.textContent=automationPaused?'▶ 脚本继续':'⏸ 脚本暂停';
      reloadBtn.onmouseenter=()=> reloadBtn.style.background='#4338ca';
      reloadBtn.onmouseleave=()=> reloadBtn.style.background='#4f46e5';
      playBtn.onmouseenter=()=> playBtn.style.background='#f5f7ff';
      playBtn.onmouseleave=()=> playBtn.style.background='#fff';
      document.getElementById('yx-reload').onclick=()=> location.reload();
      document.getElementById('yx-play').onclick=()=>{
        automationPaused=!automationPaused;
        localStorage.setItem('yxAutoPaused',automationPaused?'1':'0');
        playBtn.textContent=automationPaused?'▶ 脚本继续':'⏸ 脚本暂停';
        setOperation(automationPaused?'脚本已暂停':'脚本运行中',automationPaused?'等待点击脚本继续':'准备：监控播放状态');
        log(automationPaused?'脚本暂停':'脚本继续');
      };
      window.__entryHint();
      // 状态更新
      setInterval(()=>{
        const p=getPlayer();
        const s=document.getElementById('yx-status');
        const cur=document.getElementById('yx-cur');
        const doing=document.getElementById('yx-doing');
        const next=document.getElementById('yx-next');
        if(!s) return;
        if(automationPaused){
          s.textContent='脚本暂停'; s.style.background='#fff3e0'; s.style.color='#ef6c00';
          if(doing) doing.textContent='自动化已暂停';
          if(next) next.textContent='等待点击脚本继续';
        }else{
        // 当前页面
        try{
          const v=document.querySelector('.video-page')?.__vue__?.$data?.currentVideoData;
          const selected=document.querySelector('.course-detail.childselected, .course-detail.selected-color');
          const dongying=document.querySelector('.course-list .videoLi.active .video-info');
          const selectedText=selected?.textContent||'';
          const domPct=selectedText.match(/(\d+(?:\.\d+)?)%/);
          const name=(dongyingHome()?'入口页':(dongying?.textContent||'').trim().replace(/\s+/g,' ').slice(0,24)||v?.videoName?.slice(0,24)||selectedText.match(/\d+-\d+[^\n]*/)?.[0]?.slice(0,24)||'当前页面');
          const pct=dongyingHome()?'':(dongying?.parentElement?.querySelector('.badge')?.textContent?.trim()||(domPct?domPct[1]+'%':(v?.learnSpeed!=null?v.learnSpeed+'%':'')));
          if(cur) cur.textContent=name+' '+pct;
        }catch(e){ if(cur) cur.textContent='检测中...'; }
        if(!p){ s.textContent='未就绪'; s.style.background='#fce4ec'; s.style.color='#c62828'; if(doing) doing.textContent='等待播放器'; if(next) next.textContent='准备：初始化'; }
        else if(p.paused===true){ s.textContent='已暂停'; s.style.background='#fff3e0'; s.style.color='#ef6c00'; if(doing) doing.textContent='已暂停，8秒后重试'; if(next) next.textContent='准备：静音后播放'; }
        else if(p.paused===false){ s.textContent='▶ '+Math.round(p.currentTime)+'s'; s.style.background='#e8f5e9'; s.style.color='#2e7d32'; if(doing) doing.textContent='播放中'; if(next) next.textContent=isEnded()?'准备：下一节':'准备：监控暂停/弹题'; }
        else{ s.textContent='加载中'; s.style.background='#e3f2fd'; s.style.color='#1565c0'; if(doing) doing.textContent='加载中'; if(next) next.textContent='准备：等待就绪'; }
        }
      },1000);
    }catch(e){}
    // 关掉页面的自动播，token 回来再由脚本控
    try{
      const mv=document.querySelector('.video-page')?.__vue__?.$refs?.myVideo;
      if(mv){
        if(mv.defaultPlayerOption) mv.defaultPlayerOption.autoplay=false;
        if(mv.player?.options) mv.player.options.autoplay=false;
        // 也关全局
        const v=document.querySelector('.video-page')?.__vue__;
        if(v?.$globalConfig) v.$globalConfig.isAutoPlay=0;
      }
    }catch(e){}
    // 抓“播放失败”弹窗
    try{
      const obs=new MutationObserver(muts=>{
        for(const m of muts) for(const n of m.addedNodes) if(n.nodeType===1 && (n.textContent||'').includes('播放失败')){
          const p=getPlayer();
          log('抓到失败弹窗 paused='+p?.paused+' hasToken='+!!p?.options?.token+' vid='+p?.options?.vid);
        }
      });
      obs.observe(document.body,{childList:true, subtree:true});
    }catch(e){}
    setInterval(tick,2000);
    setTimeout(tick,1500);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
