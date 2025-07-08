// ==UserScript==
// @name          yxlearning 德州市专业技术人员继续教育脚本
// @namespace     无
// @version       1.8.1
// @description   下一集自动播放 + 智能续播 + 自动跳题 + 继续教育跳题 + 广告/答题屏蔽 + 自动静音+ 控制台日志
// @author        根据mumu+AI 1.0 改进版本，by Yang
// @match         *://sddz.zyk.yxlearning.com/learning/index?*
// @match         *://sddz.gxk.yxlearning.com/learning/index?*
// @grant         none
// @run-at        document-start
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/541531/yxlearning%20%E5%BE%B7%E5%B7%9E%E5%B8%82%E4%B8%93%E4%B8%9A%E6%8A%80%E6%9C%AF%E4%BA%BA%E5%91%98%E7%BB%A7%E7%BB%AD%E6%95%99%E8%82%B2%E8%84%9A%E6%9C%AC.user.js
// @updateURL https://update.greasyfork.org/scripts/541531/yxlearning%20%E5%BE%B7%E5%B7%9E%E5%B8%82%E4%B8%93%E4%B8%9A%E6%8A%80%E6%9C%AF%E4%BA%BA%E5%91%98%E7%BB%A7%E7%BB%AD%E6%95%99%E8%82%B2%E8%84%9A%E6%9C%AC.meta.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('[yxlearning脚本] V1.8.1 脚本已启动 (document-start)。');

    try {
        const INTERVAL_NEXT_VIDEO = 2000;
        const INTERVAL_SKIP_QUESTION = 2000;
        const INTERVAL_RESUME = 5000;
        const INTERVAL_CLICK_SKIP = 3000;
        const INTERVAL_CHECK_PLAYBACK = 2000;
        const FALLBACK_CHECK_PLAYBACK_DELAY = 5000;
        const INITIAL_PLAY_ATTEMPT_DELAY = 1000;
        const INTERVAL_AUTO_MUTE = 1000;
        const INTERVAL_REMOVE_ADS = 500; // 调高移除广告的频率

        let autoPlayIntervalId = null;

        /***** 0. 早期 CSS 隐藏 *****/
        const domain = location.hostname;
        const hideSelectors = {
            'sddz.gxk.yxlearning.com': [
                '.bplayer-question-wrap',
                '.question-modal-container',
                '.ad-container',
                '.popup-wrapper',
                '.pv-mask' // 新增：可能覆盖全屏的遮罩层
            ],
            'sddz.zyk.yxlearning.com': [
                '.bplayer-question-wrap',
                '.question-modal-container',
                '.ad-container',
                '.popup-wrapper',
                '.pv-mask' // 新增：可能覆盖全屏的遮罩层
            ]
        };

        function addCssToHideElements() {
            const selectorsToHide = hideSelectors[domain] || [];
            if (selectorsToHide.length > 0) {
                const style = document.createElement('style');
                style.type = 'text/css';
                style.textContent = selectorsToHide.map(s => `${s} { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }`).join('\n');
                document.head.appendChild(style);
                console.log('[早期隐藏] 注入 CSS 规则以隐藏:', selectorsToHide.join(', '));
            }
        }

        // 在DOM解析开始时就注入CSS，争取最早时间隐藏
        addCssToHideElements();


        /**
         * 模拟自然点击事件
         * @param {HTMLElement} el - 要点击的元素
         */
        function simulateNaturalClick(el) {
            if (!el) {
                console.log('[模拟点击] 目标元素不存在，无法模拟点击。');
                return;
            }
            const rect = el.getBoundingClientRect();
            // 确保元素在视口内，否则点击可能无效
            if (rect.width === 0 || rect.height === 0 || rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
                console.log('[模拟点击] 目标元素不在视口内或大小为零，跳过点击。', el);
                return;
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
            console.log('[模拟点击] 成功模拟点击事件。');
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
                        simulateNaturalClick(trg); // 使用模拟点击
                        console.log('[下一视频] 尝试点击下一集。');
                    } else {
                        console.log('[下一视频] 找到下一集，但其目标元素不可见或不存在，跳过点击。');
                    }
                } else {
                    // console.log('[下一视频] 未找到下一集视频。');
                }
            }
        }

        /***** 2. 智能续播（自然模拟点击） *****/
        let hasUserPlayed = false,
            retryCount = 0,
            MAX_RETRY = 5;

        /**
         * 检查视频是否处于暂停状态
         * @returns {boolean} 如果视频暂停则返回true
         */
        function isPaused() {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                return videoElement.paused;
            }
            // 兼容旧播放器
            const wrap = document.querySelector('.bplayer-wrap');
            return wrap && !wrap.classList.contains('bplayer-playing');
        }

        /**
         * 获取视频播放/暂停按钮或区域
         * @returns {HTMLElement|null} 播放区域或按钮元素
         */
        function getPlayArea() {
            const newPlayButton = document.getElementById('play');
            const oldPlayPauseButton = document.querySelector('.pv-playpause.pv-icon-btn-play');
            const bplayerPlayPauseButton = document.querySelector('.bplayer-playpause.bplayer-btn-play');

            // 优先返回可见的播放按钮
            if (newPlayButton && newPlayButton.offsetParent !== null) return newPlayButton;
            if (oldPlayPauseButton && oldPlayPauseButton.offsetParent !== null) return oldPlayPauseButton;
            if (bplayerPlayPauseButton && bplayerPlayPauseButton.offsetParent !== null) return bplayerPlayPauseButton;

            // 否则返回播放器容器
            return document.querySelector('.bplayer-control-full') || document.querySelector('.bplayer-wrap') || document.querySelector('.pv-video-player') || document.querySelector('.player-container');
        }

        /**
         * 监听视频首次播放状态，标记用户已播放
         */
        function watchFirstPlay() {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                // 监听 video 元素是否开始播放
                videoElement.addEventListener('playing', () => {
                    if (!hasUserPlayed) {
                        hasUserPlayed = true;
                        console.log('[智能续播] 检测到 <video> 元素开始播放，启动续播。');
                    }
                }, { once: true }); // 只监听一次
                // 如果页面加载时已经playing，也立即标记
                if (!videoElement.paused && videoElement.currentTime > 0) {
                    hasUserPlayed = true;
                    console.log('[智能续播] 页面加载时 <video> 元素已在播放，启动续播。');
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
            if (!hasUserPlayed) {
                // console.log('[智能续播] 用户尚未手动播放过，不尝试自动续播。');
                return; // 只有在用户手动播放过一次后才尝试自动续播
            }
            if (isPaused()) {
                if (retryCount >= MAX_RETRY) {
                    console.log('[智能续播] 达到最大重试次数，停止续播。');
                    return;
                }
                const area = getPlayArea();
                if (area && area.offsetParent !== null) { // 检查播放区域是否可见
                     simulateNaturalClick(area); // 模拟点击播放区域
                     retryCount++;
                     console.log(`[智能续播] 视频暂停，尝试自动播放 (重试: ${retryCount}/${MAX_RETRY})。`);
                } else {
                    // console.log('[智能续播] 视频暂停，但播放区域不可见，等待。');
                }
            } else {
                if (retryCount !== 0) { // 避免频繁打印
                    console.log('[智能续播] 视频正在播放，重置重试计数。');
                }
                retryCount = 0; // 视频正在播放，重置重试计数
            }
        }

        /***** 3. 自动跳过视频中的答题弹窗 *****/
        /**
         * 尝试跳过视频中的答题弹窗
         */
        function trySkipQuestion() {
            // 兼容两种网站的答题弹窗
            const wrap = document.querySelector('.bplayer-question-wrap') || document.querySelector('.question-modal-container');
            // 注意：因为我们用 CSS 隐藏了，这里 wrap 可能会一直存在但不可见
            // 所以我们只关注可以点击的按钮
            if (!wrap) return;

            // 兼容两种网站的跳过/完成按钮
            const skip = wrap.querySelector('.skip.bplayer-btn') || wrap.querySelector('.skip-button');
            const comp = wrap.querySelector('.complete.bplayer-btn') || wrap.querySelector('.confirm-button');

            if (skip && skip.offsetParent !== null) { // 检查按钮是否可见且存在
                console.log('[自动跳题] 点击跳过按钮。');
                simulateNaturalClick(skip);
                return; // 找到并点击一个就返回
            }
            if (comp && comp.offsetParent !== null) { // 检查按钮是否可见且存在
                console.log('[自动跳题] 点击完成按钮。');
                simulateNaturalClick(comp);
            }
        }

        /***** 4. 继续教育跳过 & 自动播放 *****/
        /**
         * 点击页面上的跳过按钮
         */
        function clickSkipButton() {
            // 兼容旧页面的跳过按钮
            Array.from(document.getElementsByTagName('button'))
                .filter(b => b.innerHTML === '跳过' && b.offsetParent !== null) // 确保按钮可见
                .forEach(b => {
                    console.log('[继续教育] 点击旧网站跳过按钮。');
                    simulateNaturalClick(b);
                });

            // 兼容新页面的跳过按钮
            const newSkipBtn = document.querySelector('.skip-button');
            if (newSkipBtn && newSkipBtn.offsetParent !== null) { // 确保按钮可见
                console.log('[继续教育] 点击新网站跳过按钮。');
                simulateNaturalClick(newSkipBtn);
            }
        }

        /**
         * 模拟按下空格键，常用于控制视频播放/暂停
         */
        function simulateSpacebarPress() {
            console.log('[自动播放] 模拟空格键按下...');
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
        }

        /**
         * 检查视频播放状态并尝试自动播放
         */
        function checkAndPlay() {
            // 优先查找新页面的播放/暂停按钮
            const playButton = document.getElementById('play');
            const stopButton = document.getElementById('stop');

            if (playButton && playButton.offsetParent !== null) {
                console.log('[自动播放] 检测到新页面播放按钮 (#play) 存在，尝试自动播放。');
                simulateNaturalClick(playButton);
            } else if (stopButton && stopButton.offsetParent !== null) {
                // console.log('[自动播放] 检测到新页面暂停按钮 (#stop) 存在，视频已在播放状态。');
                if (autoPlayIntervalId !== null) {
                    clearInterval(autoPlayIntervalId);
                    autoPlayIntervalId = null;
                    console.log('[自动播放] 视频已在播放，停止自动播放检查。');
                }
            } else {
                // 兼容旧页面的播放/暂停按钮
                const pp = document.querySelector('.pv-playpause');
                if (pp && pp.classList.contains('pv-icon-btn-play') && pp.offsetParent !== null) {
                    console.log('[继续教育] 检测到旧页面暂停状态，尝试自动播放。');
                    simulateNaturalClick(pp);
                    // 延迟后再次检查并尝试点击，以应对首次点击无效的情况
                    setTimeout(() => {
                        const stillPaused = document.querySelector('.pv-playpause.pv-icon-btn-play');
                        if (stillPaused && stillPaused.offsetParent !== null) {
                            console.log('[继续教育] 第一次播放尝试失败，再次尝试点击播放按钮。');
                            simulateNaturalClick(stillPaused);
                        }
                    }, 1000);
                    // 再次延迟后，如果仍未播放，则尝试模拟空格键
                    setTimeout(() => {
                        const stillPausedAfterClick = document.querySelector('.pv-playpause.pv-icon-btn-play');
                        if (stillPausedAfterClick && stillPausedAfterClick.offsetParent !== null) {
                            console.log('[继续教育] 旧页面点击尝试无效，尝试模拟空格键。');
                            simulateSpacebarPress();
                        }
                    }, 2000);
                } else if (pp && pp.classList.contains('pv-icon-btn-pause') && pp.offsetParent !== null) {
                    // console.log('[继续教育] 旧页面视频已在播放状态。');
                    if (autoPlayIntervalId !== null) {
                        clearInterval(autoPlayIntervalId);
                        autoPlayIntervalId = null;
                        console.log('[自动播放] 视频已在播放，停止自动播放检查。');
                    }
                } else {
                    // console.log('[继续教育] 未找到播放/暂停按钮或其不可见。');
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
            const playerContainerSelectors = ['.pv-video-player', '.player-container', '.bplayer-wrap']; // 包含bplayer-wrap
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

        /***** 5. 屏蔽广告/答题区域 (作为额外保障) *****/
        // hideSelectors 已经在顶部定义
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
                simulateNaturalClick(speakerButton);
                console.log('[自动静音] 模拟点击新网站音量按钮 (#speaker) 进行静音。');
            } else if (unspeakerButton && unspeakerButton.offsetParent !== null) {
                // 如果已经是静音状态 (红色叉图标可见)，则不再操作
                // console.log('[自动静音] 新网站视频已静音 (#unspeaker)。');
            } else {
                // 兼容旧网站的音量按钮
                const pvVolumeBtn = document.querySelector('.pv-volume');
                const bplayerVolumeBtn = document.querySelector('.bplayer-volume');

                if (pvVolumeBtn && pvVolumeBtn.offsetParent !== null && !pvVolumeBtn.classList.contains('pv-icon-btn-volmute')) {
                    simulateNaturalClick(pvVolumeBtn);
                    console.log('[自动静音] 模拟点击旧网站 pv-player 音量按钮以静音。');
                } else if (bplayerVolumeBtn && bplayerVolumeBtn.offsetParent !== null && bplayerVolumeBtn.classList.contains('bplayer-vol-open')) { // 注意这里，如果已经静音，则不点击
                    simulateNaturalClick(bplayerVolumeBtn);
                    console.log('[自动静音] 模拟点击旧网站 bplayer 音量按钮以静音。');
                }
            }
        }

        console.log('[yxlearning脚本] 直接在脚本启动后安排功能。');

        // 初始尝试点击播放区域，以应对某些网站的自动播放限制
        setTimeout(simulateClickPlayArea, INITIAL_PLAY_ATTEMPT_DELAY);

        // 监听视频首次播放，以便智能续播
        // 直接在文档加载后调用 watchFirstPlay
        watchFirstPlay();
        // 定期尝试自动续播
        setInterval(tryAutoResume, INTERVAL_RESUME);

        // 定期检查并播放下一视频
        setInterval(clickNextVideo, INTERVAL_NEXT_VIDEO);

        // 定期尝试跳过答题弹窗
        setInterval(trySkipQuestion, INTERVAL_SKIP_QUESTION);

        // 定期点击跳过按钮（针对继续教育页面）
        setInterval(clickSkipButton, INTERVAL_CLICK_SKIP);

        // 设置播放器容器出现时的观察者，然后启动自动播放检查
        setupPlayerObserver();

        // 兜底机制：如果在一段时间后自动播放检查仍未启动，则强制启动
        setTimeout(() => {
            if (autoPlayIntervalId === null) {
                console.log('[自动播放] 兜底：在长时间后启动自动播放检查。');
                startAutoPlayChecks();
            }
        }, FALLBACK_CHECK_PLAYBACK_DELAY);

        // 定期自动静音视频
        setInterval(autoMuteVideo, INTERVAL_AUTO_MUTE);

        // 立即移除广告，并设置MutationObserver持续监听并移除新出现的广告
        // 移除 removeAds() 的立即调用，因为它会在 addCssToHideElements 之前执行
        // removeAds(); // 移除这一行
        new MutationObserver(removeAds) // 仍然保留这个 MutationObserver 作为额外保障
            .observe(document.body, {
                childList: true,
                subtree: true
            });

    } catch (e) {
        console.error('[yxlearning脚本] 脚本执行过程中出现未捕获错误:', e);
    }
})();
