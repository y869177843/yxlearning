// ==UserScript==
// @name         大众云学-yxlearning-自动学习-重构版
// @namespace    无
// @version      3.0.4
// @description  山东大众云学公需课/专业课自动挂机：页面识别、课程完成跳转、百分比续学、静音自动播、弹题隐藏续播、播完下一节、可拖动浮窗。
// @match        *://*.yxlearning.com/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/542216/%E5%A4%A7%E4%BC%97%E4%BA%91%E5%AD%A6-yxlearning-%E8%87%AA%E5%8A%A8%E5%AD%A6%E4%B9%A0-%E9%87%8D%E6%9E%84%E7%89%88.user.js
// @updateURL https://update.greasyfork.org/scripts/542216/%E5%A4%A7%E4%BC%97%E4%BA%91%E5%AD%A6-yxlearning-%E8%87%AA%E5%8A%A8%E5%AD%A6%E4%B9%A0-%E9%87%8D%E6%9E%84%E7%89%88.meta.js
// ==/UserScript==
/*
 * 开发于：sddz-gxk.yxlearning.com / sddz-zyk.yxlearning.com
 * 调试：F12 控制台搜 [大众云学] 看日志。
 */
(function(){
  'use strict';
  const TAG='[大众云学]';
  const VERSION='3.0.4'; // 必须与头部 @version 保持一致，避免日志版本号与脚本版本打架
  // 日志同时镜像进 localStorage.__yxlog（保留最近 300 条），刷新不丢，便于事后排障
  const log=(...a)=>{
    console.log(TAG,...a);
    try{
      const arr=JSON.parse(localStorage.getItem('__yxlog')||'[]');
      const line=new Date().toLocaleTimeString()+' '+a.map(x=>{
        if(typeof x==='string') return x;
        try{ return JSON.stringify(x); }catch(e){ return String(x); }
      }).join(' ');
      arr.push(line);
      localStorage.setItem('__yxlog',JSON.stringify(arr.slice(-300)));
    }catch(e){}
  };
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
  // 单个小节的完成判定：无徽章或进度 <100% 视为未完成
  function isUnfinishedRow(row){
    const b=row.querySelector('.badge');
    return !b || parseFloat(b.textContent||'0')<100;
  }
  function dongyingClickNext(){
    const rows=[...document.querySelectorAll('.course-list .videoLi')];
    const cur=rows.findIndex(e=>e.classList.contains('active'));
    if(cur<0) return false;
    const next=rows.slice(cur+1).find(isUnfinishedRow);
    if(next){ clickEl(next,'东营下一节'); return true; }
    return false;
  }
  function dongyingSelectUnfinished(){
    const rows=[...document.querySelectorAll('.course-list .videoLi')];
    const target=rows.find(isUnfinishedRow);
    if(!target) return false;
    const cur=rows.findIndex(e=>e.classList.contains('active'));
    if(cur>=0 && rows[cur]===target) return false;
    clickEl(target,'东营选择未完成课程');
    return true;
  }
  let dongyingPausedSince=0;
  let dongyingLastPlay=0;
  let dongyingSeekDone=false;
  let dongyingSeenTime=0;
  let dongyingQHandled=false;
  // 假死自愈 / 定时循环 / 进度校验 状态
  let dyLastT=-1;          // 上一帧 currentTime，用于识别时钟停滞
  let dyFreezeSince=0;     // 时钟开始停滞的时刻
  let dyLastHeal=0;        // 上次自愈时刻（45 秒限频）
  let dyLastCycle=0;       // 上次「暂停+播放」循环时刻（5 分钟周期）
  let dyLastCheck=0;       // 上次进度校验时刻（30 秒周期）
  // 点播放键自愈：假死时播放器状态仍是 paused=false，单次点击只会「暂停」，
  // 因此点击后 1.5 秒复查，若变成暂停、或时钟依然不走，补第二次点击。
  function dyHealByButton(reason){
    const btn=document.querySelector('.bplayer-play-btn');
    if(!btn || !visible(btn)) return false;
    const before=dyLastT;
    clickEl(btn,reason);
    setTimeout(()=>{
      const p=dongyingPlayer();
      if(!p) return;
      const stillStuck=p.paused===false && before>0 && Math.abs(p.currentTime-before)<0.3;
      if(p.paused===true || stillStuck){
        const b2=document.querySelector('.bplayer-play-btn');
        if(b2 && visible(b2)) clickEl(b2,reason+'·补播');
      }
    },1500);
    // 二级兜底：点播放键若救不活（播放器时钟仍不走），20 秒后切走再切回，
    // 强制站方重新挂载播放器实例（实测该手段可救活坏源/假死）。
    setTimeout(()=>{
      if(automationPaused) return;
      const p=dongyingPlayer();
      if(!p || p.paused!==false) return;
      if(before<=0 || Math.abs(p.currentTime-before)>=1) return;
      dyHealByCourse();
    },20000);
    return true;
  }
  // 切到相邻课时再切回，强制播放器重新挂载
  function dyHealByCourse(){
    const rows=[...document.querySelectorAll('.course-list .videoLi')];
    if(rows.length<2) return false;
    const cur=rows.findIndex(e=>e.classList.contains('active'));
    if(cur<0) return false;
    const other=rows[cur+1]||rows[cur-1];
    if(!other) return false;
    log('点播放键救不活，改用切走切回');
    clickEl(other,'假死自愈·切走');
    setTimeout(()=>{
      if(automationPaused) return;
      const back=[...document.querySelectorAll('.course-list .videoLi')][cur];
      if(back) clickEl(back,'假死自愈·切回');
    },2500);
    return true;
  }
  let dyAllDoneAt=0;
  // 右上角「总学时进度（xx%）」——判定本课程是否学完的权威依据
  function dyTotalProgress(){
    const el=document.querySelector('.learnhour');
    if(!el) return null;
    const m=(el.innerText||'').match(/总学时进度[（(]\s*([\d.]+)\s*%/);
    return m? parseFloat(m[1]) : null;
  }
  // 目录内所有小节是否都已完成（badge ≥ 100%）——总学时元素取不到时的兜底
  function dyAllDone(){
    const rows=[...document.querySelectorAll('.course-list .videoLi')];
    if(!rows.length) return false;
    return rows.every(e=>{
      const b=e.querySelector('.badge');
      return b && parseFloat(b.textContent||'0')>=100;
    });
  }
  // 本课程是否已学完：以总学时进度为准（达 100%），取不到时退回小节徽章判定
  function dyCourseFinished(){
    const total=dyTotalProgress();
    if(total!==null) return total>=100;
    return dyAllDone();
  }
  function yxMemKey(){
    const active=document.querySelector('.course-list .videoLi.active');
    return 'yxpos_'+(active?.id||location.href.split('?')[1]||'cur');
  }
  function dongyingTick(){
    if(automationPaused) return;
    const p=dongyingPlayer();
    if(dongyingSelectUnfinished()) return;
    if(!p) return;
    // 总学时进度达 100% → 本课程已学完，不再重复播放，返回学习中心（3 秒去抖防误判）
    if(dyCourseFinished()){
      if(!dyAllDoneAt) dyAllDoneAt=Date.now();
      if(Date.now()-dyAllDoneAt>3000){
        dyAllDoneAt=0;
        log('总学时进度 '+dyTotalProgress()+'%，本课程已学完，返回学习中心');
        setOperation('本课程已完成','准备：返回学习中心');
        gotoStudyCenter();
      }
      return;
    }
    dyAllDoneAt=0;
    if(dongyingQuestionVisible()){
      // V4 直接关窗模式：跳过可点则点，否则强制隐藏；关窗后立即拉进度 + 续播
      const qWrap=document.querySelector('.bplayer-question-wrap');
      const skip=qWrap?.querySelector('.skip');
      if(skip && getComputedStyle(skip).display!=='none' && skip.offsetParent){
        clickEl(skip,'东营弹题跳过');
      }else{
        dongyingHideQuestion();
      }
      if(!dongyingQHandled){
        dongyingQHandled=true;
        const target=Math.max(p.currentTime, parseInt(localStorage.getItem(yxMemKey())||'0',10));
        if(target>p.currentTime){
          try{ p.seek(target); }catch(e){}
        }
        setTimeout(()=>{
          const btn=document.querySelector('.bplayer-play-btn');
          if(btn && visible(btn)){ clickEl(btn,'东营弹题关窗后播放'); }
        },400);
      }
      return;
    }
    dongyingQHandled=false;
    // 每 30 秒校验一次进度：若被站方回拉超过 30 秒，seek 拉回记忆位置
    if(p.paused===false && p.currentTime>0 && dongyingSeekDone){
      const now=Date.now();
      if(!dyLastCheck) dyLastCheck=now;
      if(now-dyLastCheck>=30000){
        dyLastCheck=now;
        if(dongyingSeenTime-p.currentTime>30){
          try{ p.seek(dongyingSeenTime); log('进度校验：回拉',Math.round(p.currentTime),'→',Math.round(dongyingSeenTime)); }catch(e){ log('进度校验 seek 失败',e.message); }
          return;
        }
      }
    }
    // 假死检测：播放中但时钟连续 ≥15 秒不推进 → 点播放键自愈（45 秒限频）
    if(p.paused===false){
      const now=Date.now();
      if(dyLastT>=0 && p.currentTime>0 && Math.abs(p.currentTime-dyLastT)<0.3){
        if(!dyFreezeSince) dyFreezeSince=now;
        const frozen=now-dyFreezeSince;
        if(frozen>=15000 && now-dyLastHeal>45000){
          dyLastHeal=now; dyFreezeSince=0;
          log('检测到假死：时钟停滞 '+frozen+'ms，点播放键自愈');
          dyHealByButton('东营假死自愈');
        }
      }else{
        dyFreezeSince=0;
      }
      dyLastT=p.currentTime;
    }else{
      dyFreezeSince=0; dyLastT=-1;
    }
    // 每 5 分钟「暂停+播放」循环，兜底防假死
    if(p.paused===false){
      const now=Date.now();
      if(!dyLastCycle) dyLastCycle=now;
      if(now-dyLastCycle>=300000){
        dyLastCycle=now;
        log('5 分钟定时循环：暂停→播放');
        dyHealByButton('东营定时循环');
      }
    }
    if(p.ended===true || (p.duration>0 && p.currentTime>=p.duration-1)){
      dongyingClickNext();
      return;
    }
    try{ if(p.volume!==0 && typeof p.setVolume==='function') p.setVolume(0); }catch(e){ log('东营静音失败',e.message); }
    // 记忆观看位置：持续记录本节已看过的最大进度
    if(p.currentTime>0 && p.currentTime< (p.duration||1e9)-2){
      dongyingSeenTime=Math.max(dongyingSeenTime,p.currentTime);
      try{ localStorage.setItem(yxMemKey(),String(Math.round(dongyingSeenTime))); }catch(e){}
    }
    // 进入本节后一次性快进到上次记忆位置（跳过片头重复段）
    if(!dongyingSeekDone && p.duration>0 && p.currentTime>0){
      dongyingSeekDone=true;
      const saved=parseInt(localStorage.getItem(yxMemKey())||'0',10);
      if(saved>p.currentTime+90 && saved<p.duration-60){
        try{ p.seek(saved-30); log('东营记忆快进',p.currentTime,'→',saved-30); }catch(e){}
      }
    }
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
  // 暂停状态变化后同步浮窗按钮与状态条
  function syncPauseUI(){
    const b=document.getElementById('yx-play');
    if(b) b.textContent=automationPaused?'▶ 脚本继续':'⏸ 脚本暂停';
    const s=document.getElementById('yx-status');
    if(automationPaused){
      if(s){ s.textContent='脚本暂停'; s.style.background='#fff3e0'; s.style.color='#ef6c00'; }
      setOperation('自动化已暂停','等待点击脚本继续');
    }
  }
  // 把内存里的暂停状态与 localStorage 对齐；不一致时同步变量并刷新 UI。
  // 两处调用：① bfcache 恢复（页面不重新 boot，内存值可能是旧的）；
  //           ② 每次 tick（兜底，避免任何路径下状态漂移）。
  function syncPausedFromStorage(tag){
    const persisted=localStorage.getItem('yxAutoPaused')==='1';
    if(persisted===automationPaused) return;
    automationPaused=persisted;
    syncPauseUI();
    log(tag+'暂停状态同步为 '+automationPaused);
  }
  window.addEventListener('pageshow',e=>{
    if(e.persisted) syncPausedFromStorage('bfcache 恢复，');
  });
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
  // 明确的完成弹窗（modal）：「完成学习」标题 / 「学习进度已达到100%」正文。
  // 与页面残留文字不同，弹窗是即时出现的强信号，在播放页判定也安全。
  function isCompleteModal(){
    const title=[...document.querySelectorAll('.modal-title')].find(e=>
      /完成学习/.test((e.innerText||'').trim()) && visible(e));
    if(title) return title;
    const body=[...document.querySelectorAll('.modal-body')].find(e=>
      /学习进度已达到\s*100%/.test((e.innerText||'').trim()) && visible(e));
    return body || null;
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
    if(automationPaused) return true;
    if(IS_DONGYING){
      // 点击“学习中”标签（专业课 sddy-zyk），确保筛选学习中
      const studyTag=[...document.querySelectorAll('a[data-toggle="tab"]')].find(a=>
        (a.innerText||'').trim()==='学习中' && visible(a));
      if(studyTag && !atStudyTab) { studyTag.click(); atStudyTab=true; return true; }
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
    const modal=isCompleteModal();
    // 播放页只认弹窗；页面残留文字（「您已完成该班级学习」）仅在非播放页判定，
    // 否则会把播放到一半的课程误判为完成并跳走。
    const onPlayer=!!window.baiJiaYunPlayer || !!document.querySelector('.video-page');
    const tip=modal || (onPlayer? null : isCourseCompleteTip());
    if(!tip || completeFlowRunning) return false;
    completeFlowRunning=true;
    setOperation('检测到课程完成','准备：返回学习中心');
    log('检测到完成提示'+(modal?'（弹窗）':'（页面文字）'));
    if(IS_DONGYING){
      // 新完成弹窗：优先点「返回课程列表」
      const backList=exactText('返回课程列表');
      if(backList){ clickEl(backList,'返回课程列表'); return true; }
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
  const pageStart=Date.now();
  function tick(){
    // 每次 tick 都与持久化值对齐（bfcache 恢复的页面不会重新 boot，内存变量可能是旧值，
    // 否则已暂停的历史页会继续自动化，把人弹回视频页）。
    syncPausedFromStorage('tick ');
    if(automationPaused) return;
    if(IS_DONGYING){
      // 东营公需课/专业课：非 /my/learning 学习中心、非播放器页 → 直接跳转学习中心
      // （域名已在 IS_DONGYING 中判定，此处不再重复比对 hostname）
      if(location.pathname.indexOf('/login')>=0 || location.pathname.indexOf('/register')>=0){
        return;
      }
      if(location.pathname!=='/my/learning' && !window.baiJiaYunPlayer && !document.querySelector('.video-page, .bplayer-wrap, #bplayer-ffplayer, .course-list .videoLi') && !handleCourseComplete() && Date.now()-pageStart>5000){
        gotoStudyCenter();
        return;
      }
      if(location.pathname==='/my/learning'){
        handleMyLearningPage();
        return;
      }
      // 完成检测在播放页也要跑：新弹窗（modal「完成学习」）是明确信号，
      // 不会像页面残留文字那样误触发，因此不受播放页限制。
      if(handleCourseComplete()) return;
      dongyingTick();
      return;
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
    const navType=(function(){try{const n=performance.getEntriesByType('navigation')[0];return n?n.type:'?'}catch(e){return '?'}})();
    log('boot '+VERSION,location.hostname,'nav='+navType);
    if(!IS_DONGYING && !IS_DEZHOU){
      log('未匹配东营/德州域名，不启动流程');
      return;
    }
    // 通用入口：不在/my/且不是播放页时→点我的学习跳学习中心（找不到给提示）
    window.__entryHint=function(){
      if(automationPaused) return true;
      if(location.pathname==='/my/learning') return true;
      if(location.hostname==='sddy-gxk.yxlearning.com'){
        const isPlay=!!window.baiJiaYunPlayer || !!document.querySelector('.video-page, .bplayer-wrap, #bplayer-ffplayer, .course-list .videoLi');
        if(isPlay) return true;
        if(handleCourseComplete()) return true;
        if(Date.now()-pageStart<6000) return true;
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
