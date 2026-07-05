/**
 * IA BUILDER™ - Interactive Storyboard Engine
 * Real-time Cinematic Rendering & Ambient Audio Synthesis
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const app = document.getElementById('app');
    const slides = Array.from(document.querySelectorAll('.slide'));
    const btnStart = document.getElementById('btn-start');
    const navPrevBtn = document.getElementById('nav-prev-btn');
    const navNextBtn = document.getElementById('nav-next-btn');
    const soundToggleBtn = document.getElementById('sound-toggle');
    const autoplayToggleBtn = document.getElementById('autoplay-toggle');
    const fullscreenToggleBtn = document.getElementById('fullscreen-toggle');
    const progressBarContainer = document.querySelector('.progress-bar-container');
    const hotspotLeft = document.getElementById('hotspot-left');
    const hotspotRight = document.getElementById('hotspot-right');

    // State Variables
    let currentSlideIndex = 0; // 0 is Intro/Cover, 1-11 are Storyboard pages
    const bookSlidesCount = slides.length - 1; // Number of storyboard slides (excludes cover)
    
    // Autoplay Settings
    let autoplayActive = false;
    let autoplayInterval = null;
    let autoplayProgressInterval = null;
    const slideDuration = 7000; // 7 seconds per slide
    let slideStartTime = 0;
    let slideElapsedPaused = 0;

    // Swipe Gestures State
    let touchstartX = 0;
    let touchstartY = 0;
    let touchendX = 0;
    let touchendY = 0;

    // Audio State (Web Audio API Synthesizer)
    let audioCtx = null;
    let isPlayingAudio = false;
    let masterGain = null;
    let osc1 = null, osc2 = null, oscSub = null;
    let lfo = null, filter = null;

    // Initialize App
    app.classList.add('intro-active'); // Ensure intro class is present on load
    initProgressIndicators();
    updateNavigationState();

    // Mobile Web Audio API Unlock Helper
    const unlockAudio = () => {
        if (!audioCtx) {
            initAudioSynth();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                window.removeEventListener('click', unlockAudio);
                window.removeEventListener('touchstart', unlockAudio);
                window.removeEventListener('touchend', unlockAudio);
            }).catch(err => console.log('Audio resume failed:', err));
        }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('touchend', unlockAudio);

    // Event Listeners
    btnStart.addEventListener('click', startExperience);
    navPrevBtn.addEventListener('click', prevSlide);
    navNextBtn.addEventListener('click', nextSlide);
    hotspotLeft.addEventListener('click', prevSlide);
    hotspotRight.addEventListener('click', nextSlide);
    soundToggleBtn.addEventListener('click', toggleAudio);
    autoplayToggleBtn.addEventListener('click', toggleAutoplay);
    fullscreenToggleBtn.addEventListener('click', toggleFullscreen);
    
    // Touch Swipe detection
    app.addEventListener('touchstart', (e) => {
        touchstartX = e.changedTouches[0].screenX;
        touchstartY = e.changedTouches[0].screenY;
    }, {passive: true});

    app.addEventListener('touchend', (e) => {
        touchendX = e.changedTouches[0].screenX;
        touchendY = e.changedTouches[0].screenY;
        handleGesture();
    }, {passive: true});

    function handleGesture() {
        const deltaX = touchendX - touchstartX;
        const deltaY = touchendY - touchstartY;
        
        // Prevent gestures on cover page
        if (currentSlideIndex === 0) return;

        // If swipe is primarily horizontal and meets threshold
        if (Math.abs(deltaX) > 40 && Math.abs(deltaY) < 80) {
            if (deltaX < 0) {
                nextSlide();
            } else {
                prevSlide();
            }
        }
    }

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (currentSlideIndex === 0 && e.key === 'Enter') {
            startExperience();
        } else if (currentSlideIndex > 0) {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                nextSlide();
            } else if (e.key === 'ArrowLeft') {
                prevSlide();
            }
        }
    });

    // Auto-hide navigation arrows on idle
    let mouseMoveTimeout;
    document.addEventListener('mousemove', () => {
        app.classList.remove('mouse-idle');
        clearTimeout(mouseMoveTimeout);
        mouseMoveTimeout = setTimeout(() => {
            app.classList.add('mouse-idle');
        }, 3000);
    });

    /* ==========================================================================
       Navigation Logic
       ========================================================================== */

    function initProgressIndicators() {
        progressBarContainer.innerHTML = '';
        for (let i = 0; i < bookSlidesCount; i++) {
            const indicator = document.createElement('div');
            indicator.className = 'progress-indicator';
            indicator.dataset.index = i + 1; // Slide indices 1 to 11
            
            const fill = document.createElement('div');
            fill.className = 'progress-indicator-fill';
            
            indicator.appendChild(fill);
            progressBarContainer.appendChild(indicator);
            
            // Allow jumping directly to pages
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                goToSlide(parseInt(indicator.dataset.index));
            });
        }
    }

    function startExperience() {
        // Automatically start audio if user clicks start, standard browser policies require user interaction
        if (!audioCtx) {
            initAudioSynth();
        }
        if (!isPlayingAudio) {
            startAudioSynth();
        }
        goToSlide(1);
    }

    function goToSlide(index) {
        if (index < 0 || index >= slides.length) return;

        // Clear active classes
        slides[currentSlideIndex].classList.remove('active');
        
        // Update index
        currentSlideIndex = index;
        
        // Add active to new slide
        slides[currentSlideIndex].classList.add('active');
        
        // Update App Classes
        if (currentSlideIndex === 0) {
            app.classList.add('intro-active');
        } else {
            app.classList.remove('intro-active');
        }

        // Fire paid traffic analytics tracking events (GA4, Facebook Pixel, Clarity)
        trackSlideView(currentSlideIndex);

        updateNavigationState();
        resetAutoplayTimer();
    }

    function nextSlide() {
        if (currentSlideIndex < slides.length - 1) {
            goToSlide(currentSlideIndex + 1);
        } else {
            // Loop back to first content page (page 1) when finished
            goToSlide(1);
        }
    }

    function prevSlide() {
        if (currentSlideIndex > 1) {
            goToSlide(currentSlideIndex - 1);
        }
    }

    function updateNavigationState() {
        // Show/hide prev button
        if (currentSlideIndex <= 1) {
            navPrevBtn.style.opacity = '0';
            navPrevBtn.style.pointerEvents = 'none';
        } else {
            navPrevBtn.style.opacity = '';
            navPrevBtn.style.pointerEvents = 'auto';
        }

        // Update top progress indicators visual representation
        const indicators = Array.from(document.querySelectorAll('.progress-indicator'));
        indicators.forEach((indicator, idx) => {
            const indicatorIndex = idx + 1;
            const fill = indicator.querySelector('.progress-indicator-fill');
            
            // Clear animations/widths
            fill.style.transition = 'none';
            fill.style.width = '0%';
            indicator.classList.remove('active', 'filled');
            
            if (indicatorIndex < currentSlideIndex) {
                // Completed slides
                indicator.classList.add('filled');
                fill.style.width = '100%';
            } else if (indicatorIndex === currentSlideIndex) {
                // Current slide
                indicator.classList.add('active');
                if (autoplayActive) {
                    // Trigger the visual growth fill
                    setTimeout(() => {
                        fill.style.transition = `width ${slideDuration}ms linear`;
                        fill.style.width = '100%';
                    }, 50);
                } else {
                    fill.style.width = '100%';
                }
            }
        });

        // Toggle white page background UI colors
        const currentSlideType = slides[currentSlideIndex].dataset.type;
        if (currentSlideType === 'white-text-only') {
            app.classList.add('light-theme-active');
        } else {
            app.classList.remove('light-theme-active');
        }

        // Update page counter badge
        const pageCounter = document.getElementById('page-counter');
        if (pageCounter) {
            if (currentSlideIndex === 0) {
                pageCounter.textContent = 'Capa';
            } else {
                const pageNum = String(currentSlideIndex).padStart(2, '0');
                const totalPages = String(bookSlidesCount).padStart(2, '0');
                pageCounter.textContent = `Página ${pageNum} / ${totalPages}`;
            }
        }
    }

    /* ==========================================================================
       Autoplay System (Netflix style)
       ========================================================================== */

    function toggleAutoplay() {
        autoplayActive = !autoplayActive;
        if (autoplayActive) {
            autoplayToggleBtn.textContent = 'Auto-Play: ON';
            autoplayToggleBtn.classList.add('active');
            if (currentSlideIndex === 0) {
                startExperience();
            } else {
                resetAutoplayTimer();
            }
        } else {
            autoplayToggleBtn.textContent = 'Auto-Play: OFF';
            autoplayToggleBtn.classList.remove('active');
            stopAutoplayTimer();
            
            // Freeze visual fill of current slide
            const activeIndicator = document.querySelector('.progress-indicator.active .progress-indicator-fill');
            if (activeIndicator) {
                activeIndicator.style.transition = 'none';
                activeIndicator.style.width = '100%';
            }
        }
    }

    function resetAutoplayTimer() {
        stopAutoplayTimer();
        if (!autoplayActive || currentSlideIndex === 0) return;

        slideStartTime = Date.now();
        
        // Trigger next slide after duration
        autoplayInterval = setTimeout(() => {
            nextSlide();
        }, slideDuration);

        // Visual growth trigger for progress indicator
        const activeIndicator = document.querySelector('.progress-indicator.active .progress-indicator-fill');
        if (activeIndicator) {
            activeIndicator.style.transition = 'none';
            activeIndicator.style.width = '0%';
            // Small offset for CSS engine repaint
            setTimeout(() => {
                if (autoplayActive) {
                    activeIndicator.style.transition = `width ${slideDuration}ms linear`;
                    activeIndicator.style.width = '100%';
                }
            }, 50);
        }
    }

    function stopAutoplayTimer() {
        if (autoplayInterval) {
            clearTimeout(autoplayInterval);
            autoplayInterval = null;
        }
    }

    /* ==========================================================================
       Cinematic Sound Synthesizer (Web Audio API)
       ========================================================================== */

    function initAudioSynth() {
        // Create audio context
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        
        // Master Volume Gain
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0, audioCtx.currentTime); // Start silent
        masterGain.connect(audioCtx.destination);

        // Lowpass Filter to create a deep warmth
        filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(140, audioCtx.currentTime); // Warm cutoff
        filter.Q.setValueAtTime(1.5, audioCtx.currentTime);
        filter.connect(masterGain);

        // OSC 1: Deep low frequency (55Hz - A1 Note)
        osc1 = audioCtx.createOscillator();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(55, audioCtx.currentTime);
        
        const osc1Gain = audioCtx.createGain();
        osc1Gain.gain.setValueAtTime(0.9, audioCtx.currentTime);
        osc1.connect(osc1Gain);
        osc1Gain.connect(filter);

        // OSC 2: Detuned slightly for a rich beating chorusing effect (55.5Hz)
        osc2 = audioCtx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(55.6, audioCtx.currentTime);

        const osc2Gain = audioCtx.createGain();
        osc2Gain.gain.setValueAtTime(0.9, audioCtx.currentTime);
        osc2.connect(osc2Gain);
        osc2Gain.connect(filter);

        // Sub OSC: Very low warm sine wave (27.5Hz - A0)
        oscSub = audioCtx.createOscillator();
        oscSub.type = 'sine';
        oscSub.frequency.setValueAtTime(27.5, audioCtx.currentTime);

        const subGain = audioCtx.createGain();
        subGain.gain.setValueAtTime(0.95, audioCtx.currentTime);
        oscSub.connect(subGain);
        subGain.connect(filter);

        // LFO: Slow modulation of the Lowpass Filter frequency (0.04Hz, ~25 second cycles)
        lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.04, audioCtx.currentTime);

        const lfoGain = audioCtx.createGain();
        lfoGain.gain.setValueAtTime(45, audioCtx.currentTime); // Modulate filter cutoff between 95Hz and 185Hz
        
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        // Start Oscillators
        osc1.start();
        osc2.start();
        oscSub.start();
        lfo.start();
    }

    function startAudioSynth() {
        if (!audioCtx) initAudioSynth();
        
        // Resume if suspended (browser security)
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        // Fade in volume smoothly to avoid pops (2 seconds fade)
        masterGain.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + 2);
        
        isPlayingAudio = true;
        soundToggleBtn.classList.add('playing');
        soundToggleBtn.querySelector('.btn-text').textContent = 'Desativar Som';
    }

    function stopAudioSynth() {
        if (!audioCtx) return;

        // Fade out volume smoothly (1.5 seconds fade)
        masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5);
        
        setTimeout(() => {
            if (!isPlayingAudio && audioCtx) {
                // If still off after fade, suspend context to save CPU
                audioCtx.suspend();
            }
        }, 1600);

        isPlayingAudio = false;
        soundToggleBtn.classList.remove('playing');
        soundToggleBtn.querySelector('.btn-text').textContent = 'Ativar Som de Fundo';
    }

    function toggleAudio() {
        if (isPlayingAudio) {
            stopAudioSynth();
        } else {
            startAudioSynth();
        }
    }

    /* ==========================================================================
       Fullscreen Management
       ========================================================================== */

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Erro ao ativar tela cheia: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    /* ==========================================================================
       TRAFFIC & FUNNEL ANALYTICS TELEMETRY (Paid Traffic Funnel Optimization)
       ========================================================================== */

    // Analytics Bucket ID (Public key-value store on kvdb.io)
    const BUCKET_ID = 'ia_builder_analytics_eb00d9d';

    // Initialize session telemetry on user entry
    function getOrCreateSession() {
        let sessionId = localStorage.getItem('iabuilder_session_id');
        let sessionStart = localStorage.getItem('iabuilder_session_start');
        
        // Capture campaign parameters (UTMs and Ad Click IDs)
        const urlParams = new URLSearchParams(window.location.search);
        const utmSource = urlParams.get('utm_source') || 'Direct';
        const utmMedium = urlParams.get('utm_medium') || '';
        const utmCampaign = urlParams.get('utm_campaign') || '';
        const adId = urlParams.get('gclid') || urlParams.get('fbclid') || '';

        if (!sessionId) {
            sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStart = Date.now();
            localStorage.setItem('iabuilder_session_id', sessionId);
            localStorage.setItem('iabuilder_session_start', sessionStart);
            localStorage.setItem('iabuilder_utm_source', utmSource);
            localStorage.setItem('iabuilder_utm_medium', utmMedium);
            localStorage.setItem('iabuilder_utm_campaign', utmCampaign);
            localStorage.setItem('iabuilder_ad_id', adId);
            localStorage.setItem('iabuilder_referrer', document.referrer || 'None');
        }

        return {
            id: sessionId,
            start: parseInt(sessionStart),
            utmSource: localStorage.getItem('iabuilder_utm_source'),
            utmMedium: localStorage.getItem('iabuilder_utm_medium'),
            utmCampaign: localStorage.getItem('iabuilder_utm_campaign'),
            adId: localStorage.getItem('iabuilder_ad_id'),
            referrer: localStorage.getItem('iabuilder_referrer')
        };
    }

    function trackSlideView(index) {
        const virtualUrl = index === 0 ? '/' : `/card-${index}`;
        const pageName = index === 0 ? 'Capa do Livro' : `Card ${String(index).padStart(2, '0')}`;
        
        console.log(`[Analytics] Tracked view: ${pageName} (${virtualUrl})`);

        // Send telemetry payload to database (kvdb.io)
        const session = getOrCreateSession();
        const telemetryPayload = {
            id: session.id,
            startTime: session.start,
            lastActive: Date.now(),
            maxPage: index,
            currentPage: index,
            utmSource: session.utmSource,
            utmMedium: session.utmMedium,
            utmCampaign: session.utmCampaign,
            adId: session.adId,
            referrer: session.referrer,
            device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop'
        };

        // Fire background fetch to write logs (fails silently, no UI lock)
        fetch(`https://kvdb.io/${BUCKET_ID}/session:${session.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(telemetryPayload)
        }).catch(err => console.warn('Telemetry sync offline'));

        // 1. Google Analytics 4 (GA4) Page View Sinc
        if (typeof gtag === 'function' && window.ANALYTICS_CONFIG.googleAnalyticsId && window.ANALYTICS_CONFIG.googleAnalyticsId !== 'G-SEU-ID-GA4') {
            gtag('event', 'page_view', {
                page_title: pageName,
                page_path: virtualUrl,
                page_location: window.location.origin + window.location.pathname + `?slide=${index}`
            });
            
            // Dispara evento de conversão específico ao atingir o último slide (fim da jornada)
            if (index === bookSlidesCount) {
                gtag('event', 'completed_book_reading', {
                    event_category: 'engagement',
                    event_label: 'Leitor leu todos os 60 cards'
                });
            }
        }

        // 2. Meta (Facebook) Pixel Page View Sinc
        if (typeof fbq === 'function' && window.ANALYTICS_CONFIG.metaPixelId && window.ANALYTICS_CONFIG.metaPixelId !== 'SEU-ID-META-PIXEL') {
            fbq('track', 'PageView', {}, { eventID: 'view_' + index });
            fbq('trackCustom', 'CardView', {
                cardIndex: index,
                cardTitle: pageName
            });

            if (index === Math.round(bookSlidesCount / 2)) {
                fbq('trackCustom', 'MidBookReached', { content_name: 'Chegou na metade do Capítulo 1' });
            }
            if (index === bookSlidesCount) {
                fbq('track', 'Lead', { content_name: 'Concluiu a leitura de 60 cards' });
            }
        }

        // 3. Microsoft Clarity Page / Event Sinc
        if (typeof clarity === 'function' && window.ANALYTICS_CONFIG.clarityId && window.ANALYTICS_CONFIG.clarityId !== 'SEU-ID-CLARITY') {
            clarity("set", "active_card", String(index));
            if (index === bookSlidesCount) {
                clarity("set", "reading_finished", "true");
            }
        }
    }
});
