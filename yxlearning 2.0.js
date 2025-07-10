// ==UserScript==
// @name          大众云学继续教育脚本：yxlearning
// @namespace     无
// @version       2.0
// @description   智能续播 (强化) + 自动跳题/答题屏蔽 + 静音 + 控制台日志
// @author        根据mumu+AI 1.0 使用Gemini改进，by Yang
// @match         *://*.zyk.yxlearning.com/learning/index?*
// @match         *://*.gxk.yxlearning.com/learning/index?*
// @grant         none
// @run-at        document-start
// @license MIT
// @downloadURL   https://update.greasyfork.org/scripts/541531/yxlearning%20%E5%BE%B7%E5%B7%9E%E5%B8%82%E4%B8%93%E4%B8%9A%E6%8A%80%E6%9C%AF%E4%BA%BA%E5%91%98%E7%BB%A7%E7%BB%AD%E6%95%99%E8%82%B2%E8%84%9A%E6%9C%AC.user.js
// @updateURL     https://update.greasyfork.org/scripts/541531/yxlearning%20%E5%BE%B7%E5%B7%9E%E5%B8%82%E4%B8%93%E4%B8%9A%E6%8A%80%E6%9C%AF%E4%BA%BA%E5%91%98%E7%BB%A7%E7%BB%AD%E6%95%99%E8%82%B2%E8%84%9A%E6%9C%AC.meta.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('[yxlearning脚本] V2.0 脚本已启动 (document-start)。');

    try {
        const INTERVAL_NEXT_VIDEO = 2000;
        const INTERVAL_SKIP_QUESTION = 2000;
        const INTERVAL_RESUME = 3000; // 智能续播检查频率提高
        const INTERVAL_CLICK_SKIP = 3000;
        const INTERVAL_CHECK_PLAYBACK = 2000;
        const FALLBACK_CHECK_PLAYBACK_DELAY = 5000;
        const INITIAL_PLAY_ATTEMPT_DELAY = 1000;
        const INTERVAL_AUTO_MUTE = 1000;
        const INTERVAL_ACTIVE_SIMULATION = 5000; // 新增：模拟用户活跃度检测频率

        let autoPlayIntervalId = null;
        let activeSimulationIntervalId = null; // 新增：用户活跃度模拟定时器ID

        /***** 0. 早期 CSS 隐藏 *****/
        const domain = location.hostname;
        const hideSelectors = {
            'sddz.gxk.yxlearning.com': [
                '.bplayer-question-wrap',
                '.question-modal-container',
                '.pv-ask-modal-wrap',
                '.ad-container',
                '.popup-wrapper',
                '.pv-mask',
                '.layer-dialog' // 新增：通用弹窗类名
            ],
            'sddz.zyk.yxlearning.com': [
                '.bplayer-question-wrap',
                '.pv-ask-modal-wrap',
                '.pv-mask',
                '.ad-container',
                '.popup-wrapper',
                '.layer-dialog' // 新增：通用弹窗类名
            ]
        };

        function addCssToHideElements() {
            const selectorsToHide = hideSelectors[domain] || [];
            if (selectorsToHide.length > 0) {
                const style = document.createElement('style');
                style.type = 'text/css';
                style.textContent = `
                    ${selectorsToHide.map(s => `${s} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }`).join('\n')}
                    /* 尝试解决某些弹窗导致的背景滚动 */
                    .modal-open { overflow: hidden !important; }
                    body:has(.modal-open) { overflow: hidden !important; }
                `;
                document.head.appendChild(style);
                console.log('[早期隐藏] 注入 CSS 规则以隐藏:', selectorsToHide.join(', '));
            }
        }

        addCssToHideElements();


        /**
         * 模拟自然点击事件
         * @param {HTMLElement} el - 要点击的元素
         */
        function simulateNaturalClick(el) {
            if (!el) {
                console.log('[模拟点击] 目标元素不存在，无法模拟点击。');
                return false; // 返回 false 表示点击未成功
            }
            const rect = el.getBoundingClientRect();
            // 确保元素在视口内且有实际大小，否则点击可能无效
            if (rect.width === 0 || rect.height === 0 || rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
                console.log('[模拟点击] 目标元素不在视口内或大小为零，跳过点击。', el);
                return false;
            }

            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            ['mousedown', 'mouseup', 'click'].forEach(type => {
                el.dispatchEvent(new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y,
                    view: window
                }));
            });
            console.log('[模拟点击] 成功模拟点击事件。', el);
            return true; // 返回 true 表示点击成功
        }

        /**
         * 模拟鼠标移动，以保持用户活跃度
         */
        function simulateMouseMove() {
            // 在视频播放器区域内模拟小范围的鼠标移动
            const playerArea = document.querySelector('.bplayer-wrap') || document.querySelector('.pv-video-player') || document.querySelector('.player-container');
            if (playerArea) {
                const rect = playerArea.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const x = rect.left + rect.width * Math.random();
                    const y = rect.top + rect.height * Math.random();

                    playerArea.dispatchEvent(new MouseEvent('mousemove', {
                        bubbles: true,
                        cancelable: true,
                        clientX: x,
                        clientY: y,
                        view: window
                    }));
                    // console.log('[活跃度] 模拟鼠标移动。');
                }
            }
        }

        /**
         * 模拟点击视频播放区域以绕过自动播放限制
         */
        function simulateClickPlayArea() {
            const playerArea = document.querySelector('.bplayer-wrap') || document.querySelector('.pv-video-player') || document.querySelector('.player-container');
            if (playerArea) {
                console.log('[自动播放] 尝试模拟点击视频播放区域以绕过自动播放限制。');
                simulateNaturalClick(playerArea);
            } else {
                console.log('[自动播放] 未找到视频播放区域 (.bplayer-wrap, .pv-video-player 或 .player-container)，无法模拟点击。');
            }
        }

        /***** 1. 自动播放下一视频 *****/
        /**
         * 获取当前正在播放的视频列表项
         * @returns {HTMLElement|null} 当前视频的li元素
         */
        function getCurrentVideoLi() {
            return document.querySelector('li.videoLi.active') || document.querySelector('.course-list-item.active');
        }

        /**
         * 获取视频列表项上的进度文本
         * @param {HTMLElement} li - 视频列表项元素
         * @returns {string} 进度文本，如 "100%"
         */
        function getBadgeText(li) {
            const badge = li.querySelector('.badge') || li.querySelector('.status-tag');
            return badge ? badge.textContent.trim() : '';
        }

        /**
         * 点击播放下一集视频
         */
        function clickNextVideo() {
            const cur = getCurrentVideoLi();
            if (!cur) {
                // console.log('[下一视频] 未找到当前视频项。');
                return;
            }
            const text = getBadgeText(cur);
            if (text === '100%' || text === '100') { // 检查当前视频是否已完成
                let next = cur.nextElementSibling;
                // 查找下一个有效的视频列表项
                while (next && !(next.classList.contains('videoLi') || next.classList.contains('course-list-item'))) {
                    next = next.nextElementSibling;
                }
                if (next) {
                    const trg = next.querySelector('.video-info') || next.querySelector('.course-item-title');
                    if (trg && trg.offsetParent !== null) { // 检查元素是否可见
                        if (simulateNaturalClick(trg)) { // 使用模拟点击，并检查是否成功
                            console.log('[下一视频] 尝试点击下一集。');
                            // 点击下一集后，重置智能续播的状态，以便新视频能够被触发播放
                            hasUserPlayed = false;
                            retryCount = 0;
                            // 立即尝试点击播放区域，应对新加载视频的自动播放限制
                            setTimeout(simulateClickPlayArea, 500);
                        }
                    } else {
                        console.log('[下一视频] 找到下一集，但其目标元素不可见或不存在，跳过点击。');
                    }
                } else {
                    // console.log('[下一视频] 未找到下一集视频。');
                }
            }
        }

        /***** 2. 智能续播（自然模拟点击） *****/
        let hasUserPlayed = false;
        let retryCount = 0;
        const MAX_RETRY = 10; // 增加重试次数

        /**
         * 检查视频是否处于暂停状态
         * @returns {boolean} 如果视频暂停则返回true
         */
        function isPaused() {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                return videoElement.paused;
            }
            // 兼容旧播放器，检查其播放状态类
            const wrap = document.querySelector('.bplayer-wrap');
            if (wrap) {
                // 如果没有 'bplayer-playing' 类，则认为其暂停
                return !wrap.classList.contains('bplayer-playing');
            }
            // 如果都没有找到，保守地返回true (认为可能暂停需要点击)
            return true;
        }

        /**
         * 获取视频播放/暂停按钮或区域
         * @returns {HTMLElement|null} 播放区域或按钮元素
         */
        function getPlayArea() {
            // 新网站的播放/暂停按钮
            const newPlayButton = document.getElementById('play');
            const newStopButton = document.getElementById('stop'); // 播放状态下的暂停按钮，点击后会暂停

            // 旧网站的播放/暂停按钮
            const oldPlayPauseButton = document.querySelector('.pv-playpause.pv-icon-btn-play'); // 旧播放器的播放按钮
            const bplayerPlayPauseButton = document.querySelector('.bplayer-playpause.bplayer-btn-play'); // 另一种旧播放器的播放按钮

            // 优先返回可见的“播放”按钮
            if (newPlayButton && newPlayButton.offsetParent !== null) {
                // 如果#play可见，且#stop不可见或不存在，说明是暂停状态
                if (!newStopButton || newStopButton.offsetParent === null) {
                    return newPlayButton;
                }
            }
            if (oldPlayPauseButton && oldPlayPauseButton.offsetParent !== null) return oldPlayPauseButton;
            if (bplayerPlayPauseButton && bplayerPlayPauseButton.offsetParent !== null) return bplayerPlayPauseButton;

            // 如果已经处于播放状态（#stop可见），则尝试返回播放器容器，以便在需要时点击（例如，应对意外暂停）
            if (newStopButton && newStopButton.offsetParent !== null) {
                 return document.querySelector('.bplayer-control-full') || document.querySelector('.bplayer-wrap') || document.querySelector('.pv-video-player') || document.querySelector('.player-container');
            }

            // 否则返回播放器容器本身，作为最终的点击目标
            return document.querySelector('.bplayer-control-full') || document.querySelector('.bplayer-wrap') || document.querySelector('.pv-video-player') || document.querySelector('.player-container');
        }

        /**
         * 监听视频首次播放状态，标记用户已播放
         */
        function watchFirstPlay() {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                videoElement.addEventListener('playing', () => {
                    if (!hasUserPlayed) {
                        hasUserPlayed = true;
                        console.log('[智能续播] 检测到 <video> 元素开始播放，启动续播。');
                        // 视频开始播放后，确保清除自动播放检查，并启动活跃度模拟
                        if (autoPlayIntervalId !== null) {
                            clearInterval(autoPlayIntervalId);
                            autoPlayIntervalId = null;
                            console.log('[自动播放] 视频已在播放，停止自动播放检查。');
                        }
                        startActiveSimulation(); // 视频播放时启动活跃度模拟
                    }
                }, { once: true });
                videoElement.addEventListener('pause', () => {
                     // 如果是用户暂停或者网站强制暂停，重置hasUserPlayed以允许tryAutoResume再次介入
                    console.log('[智能续播] 检测到视频暂停，重置状态。');
                    hasUserPlayed = false; // 暂停后允许重新触发自动播放
                    retryCount = 0; // 重置重试计数
                    startAutoPlayChecks(); // 重新启动自动播放检查
                });
                // 如果页面加载时已经playing，也立即标记
                if (!videoElement.paused && videoElement.currentTime > 0) {
                    hasUserPlayed = true;
                    console.log('[智能续播] 页面加载时 <video> 元素已在播放，启动续播。');
                    startActiveSimulation();
                }
                return;
            }
            // 兼容旧的播放器监听 (使用 MutationObserver 监听类名变化)
            const wrap = document.querySelector('.bplayer-wrap');
            if (!wrap) return;
            new MutationObserver((mutationsList, observer) => {
                for (let mutation of mutationsList) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (wrap.classList.contains('bplayer-playing') && !hasUserPlayed) {
                            hasUserPlayed = true;
                            console.log('[智能续播] 检测到旧播放器手动播放，启动续播。');
                            observer.disconnect(); // 停止监听
                            startActiveSimulation();
                            return;
                        }
                    }
                }
            }).observe(wrap, {
                attributes: true,
                attributeFilter: ['class']
            });
        }

        /**
         * 尝试自动恢复播放（如果视频暂停）
         */
        function tryAutoResume() {
            // 如果用户从未播放过，并且页面上没有明确的播放按钮（可能是等待加载），则不触发自动续播
            if (!hasUserPlayed && !document.getElementById('play') && !document.querySelector('.pv-playpause.pv-icon-btn-play')) {
                // console.log('[智能续播] 用户尚未手动播放过，且无明确播放按钮，等待。');
                return;
            }

            if (isPaused()) {
                if (retryCount >= MAX_RETRY) {
                    console.log('[智能续播] 达到最大重试次数，停止续播。请手动检查或刷新页面。');
                    if (activeSimulationIntervalId) {
                        clearInterval(activeSimulationIntervalId);
                        activeSimulationIntervalId = null;
                    }
                    if (autoPlayIntervalId) {
                        clearInterval(autoPlayIntervalId);
                        autoPlayIntervalId = null;
                    }
                    return;
                }
                const area = getPlayArea();
                if (area && area.offsetParent !== null) { // 检查播放区域是否可见
                    if (simulateNaturalClick(area)) { // 模拟点击播放区域，并检查是否成功
                        retryCount++;
                        console.log(`[智能续播] 视频暂停，尝试自动播放 (重试: ${retryCount}/${MAX_RETRY})。`);
                    } else {
                        // console.log('[智能续播] 视频暂停，但播放区域点击失败，可能被遮挡。');
                        // 尝试模拟空格键作为备用
                        simulateSpacebarPress();
                    }
                } else {
                    // console.log('[智能续播] 视频暂停，但播放区域不可见，等待。');
                }
            } else {
                if (retryCount !== 0) { // 避免频繁打印
                    console.log('[智能续播] 视频正在播放，重置重试计数。');
                }
                retryCount = 0; // 视频正在播放，重置重试计数
                startActiveSimulation(); // 视频播放时确保活跃度模拟在运行
            }
        }

        /***** 3. 自动跳过视频中的答题弹窗 *****/
        /**
         * 尝试跳过视频中的答题弹窗
         */
        function trySkipQuestion() {
            // 兼容多种网站的答题弹窗
            const wrap = document.querySelector('.bplayer-question-wrap') ||
                         document.querySelector('.question-modal-container') ||
                         document.querySelector('.pv-ask-modal-wrap') ||
                         document.querySelector('.layer-dialog'); // 新增：通用弹窗类名

            if (!wrap) return;

            // 兼容多种网站的跳过/完成/提交按钮
            const skip = wrap.querySelector('.skip.bplayer-btn') ||
                         wrap.querySelector('.skip-button') ||
                         wrap.querySelector('.pv-ask-skip') ||
                         wrap.querySelector('button.btn-skip'); // 某些弹窗的跳过按钮

            const comp = wrap.querySelector('.complete.bplayer-btn') ||
                         wrap.querySelector('.confirm-button') ||
                         wrap.querySelector('.pv-ask-submit') ||
                         wrap.querySelector('button.btn-confirm'); // 某些弹窗的确认按钮

            if (skip && skip.offsetParent !== null) { // 检查按钮是否可见且存在
                console.log('[自动跳题] 点击跳过按钮。');
                if (simulateNaturalClick(skip)) {
                    // 点击成功后，立即尝试自动播放，因为跳题后视频通常会恢复
                    setTimeout(tryAutoResume, 500);
                }
                return; // 找到并点击一个就返回
            }
            if (comp && comp.offsetParent !== null) { // 检查按钮是否可见且存在
                console.log('[自动跳题] 点击完成/提交按钮。');
                if (simulateNaturalClick(comp)) {
                     // 点击成功后，立即尝试自动播放
                    setTimeout(tryAutoResume, 500);
                }
            }
        }

        /***** 4. 继续教育跳过 & 自动播放 *****/
        /**
         * 点击页面上的跳过按钮 (针对非视频内弹窗)
         */
        function clickSkipButton() {
            // 兼容旧页面的跳过按钮
            Array.from(document.getElementsByTagName('button'))
                .filter(b => (b.innerHTML === '跳过' || b.textContent.includes('跳过')) && b.offsetParent !== null) // 确保按钮可见，并增加textContent检查
                .forEach(b => {
                    console.log('[继续教育] 点击旧网站跳过按钮。');
                    if (simulateNaturalClick(b)) {
                        // 跳过成功后，立即尝试自动播放
                        setTimeout(tryAutoResume, 500);
                    }
                });

            // 兼容新页面的跳过按钮
            const newSkipBtn = document.querySelector('.skip-button');
            if (newSkipBtn && newSkipBtn.offsetParent !== null) { // 确保按钮可见
                console.log('[继续教育] 点击新网站跳过按钮。');
                if (simulateNaturalClick(newSkipBtn)) {
                    // 跳过成功后，立即尝试自动播放
                    setTimeout(tryAutoResume, 500);
                }
            }

             // 尝试点击一些通用的“进入学习”或“开始学习”按钮
            const startLearningBtn = document.querySelector('.btn-start-learning') || document.querySelector('.button-start');
            if (startLearningBtn && startLearningBtn.offsetParent !== null) {
                console.log('[继续教育] 尝试点击“开始学习”按钮。');
                simulateNaturalClick(startLearningBtn);
            }
        }

        /**
         * 模拟按下空格键，常用于控制视频播放/暂停
         */
        function simulateSpacebarPress() {
            const videoElement = document.querySelector('video');
            if (videoElement && videoElement.offsetParent !== null) {
                // 如果视频元素存在且可见，将焦点移到其上，然后模拟空格键
                videoElement.focus();
                console.log('[自动播放] 模拟空格键按下 (针对video元素)。');
            } else {
                // 否则，在文档上模拟
                console.log('[自动播放] 模拟空格键按下 (针对document)。');
            }

            const event = new KeyboardEvent('keydown', {
                key: ' ',
                code: 'Space',
                keyCode: 32,
                which: 32,
                bubbles: true,
                cancelable: true,
                composed: true
            });
            document.dispatchEvent(event);

            // 模拟 keyup 事件，完成一次按键操作
            setTimeout(() => {
                const eventUp = new KeyboardEvent('keyup', {
                    key: ' ',
                    code: 'Space',
                    keyCode: 32,
                    which: 32,
                    bubbles: true,
                    cancelable: true,
                    composed: true
                });
                document.dispatchEvent(eventUp);
            }, 50); // 短暂延迟后释放按键
        }

        /**
         * 检查视频播放状态并尝试自动播放
         * 这个函数主要用于页面加载初期或视频被强制暂停时的首次激活
         */
        function checkAndPlay() {
            // 如果视频正在播放，则停止此检查
            if (!isPaused()) {
                if (autoPlayIntervalId !== null) {
                    clearInterval(autoPlayIntervalId);
                    autoPlayIntervalId = null;
                    console.log('[自动播放] 视频已在播放，停止自动播放检查。');
                }
                startActiveSimulation(); // 视频播放时启动活跃度模拟
                return;
            }

            const playButton = document.getElementById('play');
            const stopButton = document.getElementById('stop');
            const pvPlayPause = document.querySelector('.pv-playpause.pv-icon-btn-play');
            const bplayerPlayPause = document.querySelector('.bplayer-playpause.bplayer-btn-play');

            // 优先级：新页面的播放按钮 -> 旧页面的播放按钮 -> 模拟空格
            if (playButton && playButton.offsetParent !== null) {
                console.log('[自动播放] 检测到新页面播放按钮 (#play) 存在，尝试自动播放。');
                if (simulateNaturalClick(playButton)) {
                     // 成功点击后，停止检查
                    clearInterval(autoPlayIntervalId);
                    autoPlayIntervalId = null;
                    startActiveSimulation();
                }
            } else if (pvPlayPause && pvPlayPause.offsetParent !== null) {
                console.log('[自动播放] 检测到旧页面 pv-player 暂停状态，尝试自动播放。');
                if (simulateNaturalClick(pvPlayPause)) {
                    clearInterval(autoPlayIntervalId);
                    autoPlayIntervalId = null;
                    startActiveSimulation();
                }
            } else if (bplayerPlayPause && bplayerPlayPause.offsetParent !== null) {
                console.log('[自动播放] 检测到旧页面 bplayer 暂停状态，尝试自动播放。');
                if (simulateNaturalClick(bplayerPlayPause)) {
                    clearInterval(autoPlayIntervalId);
                    autoPlayIntervalId = null;
                    startActiveSimulation();
                }
            } else {
                // 如果没有找到特定的播放按钮，但视频是暂停的，尝试模拟空格键
                // 只有在视频元素确实存在时才模拟空格，避免不必要的触发
                const videoElement = document.querySelector('video');
                if (videoElement && videoElement.paused && videoElement.offsetParent !== null) {
                    console.log('[自动播放] 未找到特定播放按钮，尝试模拟空格键。');
                    simulateSpacebarPress();
                } else {
                    // console.log('[自动播放] 未找到播放/暂停按钮或其不可见，或视频已在播放。');
                }
            }
        }

        /**
         * 启动周期性自动播放检查
         */
        function startAutoPlayChecks() {
            if (autoPlayIntervalId === null) {
                console.log('[自动播放] 启动周期性自动播放检查...');
                autoPlayIntervalId = setInterval(checkAndPlay, INTERVAL_CHECK_PLAYBACK);
            }
        }

        /**
         * 设置MutationObserver监听播放器容器的出现，然后启动自动播放检查
         */
        function setupPlayerObserver() {
            const playerContainerSelectors = ['.pv-video-player', '.player-container', '.bplayer-wrap'];
            let observer = new MutationObserver((mutations, obs) => {
                let playerContainerFound = false;
                for (const selector of playerContainerSelectors) {
                    if (document.querySelector(selector)) {
                        console.log(`[自动播放] MutationObserver 检测到播放器容器 (${selector}) 出现。`);
                        playerContainerFound = true;
                        break;
                    }
                }
                if (playerContainerFound) {
                    startAutoPlayChecks(); // 播放器容器出现后开始自动播放检查
                    watchFirstPlay(); // 播放器出现后监听首次播放
                    obs.disconnect(); // 停止监听
                }
            });

            // 监听整个文档的变化
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
            console.log(`[自动播放] 正在监听播放器容器 (${playerContainerSelectors.join(' 或 ')}) 出现...`);
        }

        /**
         * 启动周期性模拟用户活跃度
         */
        function startActiveSimulation() {
            if (activeSimulationIntervalId === null) {
                console.log('[活跃度] 启动周期性模拟用户活跃度...');
                activeSimulationIntervalId = setInterval(simulateMouseMove, INTERVAL_ACTIVE_SIMULATION);
            }
        }

        /**
         * 停止周期性模拟用户活跃度
         */
        function stopActiveSimulation() {
            if (activeSimulationIntervalId !== null) {
                clearInterval(activeSimulationIntervalId);
                activeSimulationIntervalId = null;
                console.log('[活跃度] 停止周期性模拟用户活跃度。');
            }
        }

        /***** 5. 屏蔽广告/答题区域 (作为额外保障) *****/
        /**
         * 移除页面上的广告和答题弹窗元素 (作为额外保障)
         */
        function removeAds() {
            (hideSelectors[domain] || []).forEach(sel => {
                const elementsToRemove = document.querySelectorAll(sel);
                if (elementsToRemove.length > 0) {
                    // console.log(`[屏蔽] 移除 ${sel} 元素 (额外保障)。`);
                    elementsToRemove.forEach(el => el.remove());
                }
            });
            // 确保移除遮罩层
            const masks = document.querySelectorAll('.pv-mask, .mask-layer');
            masks.forEach(mask => {
                if (mask.offsetParent !== null) { // 仅移除可见的遮罩
                    mask.remove();
                    console.log('[屏蔽] 移除可见的遮罩层。');
                }
            });
        }

        // **自动静音**
        /**
         * 自动将视频静音
         */
        function autoMuteVideo() {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                if (videoElement.volume !== 0 || !videoElement.muted) {
                    videoElement.volume = 0;
                    videoElement.muted = true;
                    // console.log('[自动静音] 直接设置视频音量为0并静音。');
                }
            }

            // 新网站静音/非静音按钮
            const unspeakerButton = document.getElementById('unspeaker'); // 静音状态的图标 (红色的叉)
            const speakerButton = document.getElementById('speaker'); // 有声音状态的图标 (白色的喇叭)

            if (speakerButton && speakerButton.offsetParent !== null) {
                // 如果当前是有声音状态 (喇叭图标可见)，则点击它进行静音
                if (simulateNaturalClick(speakerButton)) {
                    console.log('[自动静音] 模拟点击新网站音量按钮 (#speaker) 进行静音。');
                }
            } else if (unspeakerButton && unspeakerButton.offsetParent !== null) {
                // 如果已经是静音状态 (红色叉图标可见)，则不再操作
                // console.log('[自动静音] 新网站视频已静音 (#unspeaker)。');
            } else {
                // 兼容旧网站的音量按钮
                const pvVolumeBtn = document.querySelector('.pv-volume');
                const bplayerVolumeBtn = document.querySelector('.bplayer-volume');

                if (pvVolumeBtn && pvVolumeBtn.offsetParent !== null && !pvVolumeBtn.classList.contains('pv-icon-btn-volmute')) {
                    if (simulateNaturalClick(pvVolumeBtn)) {
                        console.log('[自动静音] 模拟点击旧网站 pv-player 音量按钮以静音。');
                    }
                } else if (bplayerVolumeBtn && bplayerVolumeBtn.offsetParent !== null && bplayerVolumeBtn.classList.contains('bplayer-vol-open')) {
                    if (simulateNaturalClick(bplayerVolumeBtn)) {
                        console.log('[自动静音] 模拟点击旧网站 bplayer 音量按钮以静音。');
                    }
                }
            }
        }

        console.log('[yxlearning脚本] 直接在脚本启动后安排功能。');

        // 初始尝试点击播放区域，以应对某些网站的自动播放限制
        // 注意：这里延迟执行，确保DOM基本加载
        setTimeout(simulateClickPlayArea, INITIAL_PLAY_ATTEMPT_DELAY);

        // 设置播放器容器出现时的观察者，然后启动自动播放检查和首次播放监听
        setupPlayerObserver();

        // 兜底机制：如果在一段时间后自动播放检查仍未启动，则强制启动
        setTimeout(() => {
            if (autoPlayIntervalId === null) {
                console.log('[自动播放] 兜底：在长时间后启动自动播放检查。');
                startAutoPlayChecks();
            }
        }, FALLBACK_CHECK_PLAYBACK_DELAY);

        // 定期尝试自动续播
        setInterval(tryAutoResume, INTERVAL_RESUME);

        // 定期检查并播放下一视频
        setInterval(clickNextVideo, INTERVAL_NEXT_VIDEO);

        // 定期尝试跳过答题弹窗
        setInterval(trySkipQuestion, INTERVAL_SKIP_QUESTION);

        // 定期点击跳过按钮（针对继续教育页面）
        setInterval(clickSkipButton, INTERVAL_CLICK_SKIP);

        // 定期自动静音视频
        setInterval(autoMuteVideo, INTERVAL_AUTO_MUTE);

        // 立即移除广告，并设置MutationObserver持续监听并移除新出现的广告
        new MutationObserver(removeAds)
            .observe(document.body, {
                childList: true,
                subtree: true
            });

    } catch (e) {
        console.error('[yxlearning脚本] 脚本执行过程中出现未捕获错误:', e);
    }
})();
