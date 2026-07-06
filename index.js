/**
 * IA BUILDER™ - Interactive Storyboard Engine
 * Real-time Cinematic Rendering & Ambient Audio Synthesis
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const app = document.getElementById('app');
    const slides = Array.from(document.querySelectorAll('.slide'));
    const btnStart = document.getElementById('btn-start');
    const leadCtaButtons = Array.from(document.querySelectorAll('[data-open-lead]'));
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
    const bookSlidesCount = slides.length - 2; // Number of storyboard slides (excludes cover and final screen)
    
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
    trackSlideView(0);

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
    leadCtaButtons.forEach(button => {
        button.addEventListener('click', () => openLeadModal(button.dataset.openLead || 'unknown'));
    });
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

        // Show/hide next button on the final screen
        if (currentSlideIndex === slides.length - 1) {
            navNextBtn.style.opacity = '0';
            navNextBtn.style.pointerEvents = 'none';
            // Disable autoplay system when reaching the form to let user type
            if (autoplayActive) {
                toggleAutoplay();
            }
        } else {
            navNextBtn.style.opacity = '';
            navNextBtn.style.pointerEvents = 'auto';
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
            } else if (currentSlideIndex === slides.length - 1) {
                pageCounter.textContent = 'Convite';
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
    const BUCKET_ID = 'NbpUd2gxH9Ss93y3hCGeFV';

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

        // Send telemetry payload to Firebase Realtime Database
        fetch(`https://iabuilder-8a7e7-default-rtdb.firebaseio.com/sessions/${session.id}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(telemetryPayload)
        }).catch(err => console.warn('Telemetry sync offline', err));

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
                    event_label: 'Leitor leu todos os todos os cards'
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
                fbq('track', 'Lead', { content_name: 'Concluiu a leitura de todos os cards' });
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

    // ==========================================================================
    // WORKSHOP MODAL & REGISTRATION FORM HANDLER
    // ==========================================================================
    const leadModal = document.getElementById('lead-modal');
    const btnOpenModal = document.getElementById('btn-open-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const leadForm = document.getElementById('lead-form');
    const leadFormError = document.getElementById('lead-form-error');

    function updateLeadCtasAsRegistered() {
        leadCtaButtons.forEach(button => {
            button.textContent = 'Sua Vaga está Reservada!';
            button.style.borderColor = '#10b981';
            button.style.color = '#10b981';
        });
    }

    function showFormError(message) {
        if (!leadFormError) return;
        leadFormError.textContent = message;
        leadFormError.classList.add('active');
    }

    function clearFormError() {
        if (!leadFormError) return;
        leadFormError.textContent = '';
        leadFormError.classList.remove('active');
    }

    function openLeadModal(source = 'unknown') {
        if (!leadModal) return;

        leadModal.dataset.source = source;
        leadModal.style.display = 'flex';
        leadModal.offsetHeight;
        leadModal.classList.add('active');
        clearFormError();

        if (typeof gtag === 'function' && window.ANALYTICS_CONFIG.googleAnalyticsId && window.ANALYTICS_CONFIG.googleAnalyticsId !== 'G-SEU-ID-GA4') {
            gtag('event', 'open_lead_modal', {
                event_category: 'conversion_intent',
                event_label: source
            });
        }

        if (typeof fbq === 'function' && window.ANALYTICS_CONFIG.metaPixelId && window.ANALYTICS_CONFIG.metaPixelId !== 'SEU-ID-META-PIXEL') {
            fbq('trackCustom', 'OpenLeadModal', {
                source
            });
        }

        // If already registered, skip form and display success view
        if (localStorage.getItem('iabuilder_lead_registered') === 'true') {
            const formView = document.getElementById('final-form-view');
            const successView = document.getElementById('final-success-view');
            if (formView && successView) {
                formView.style.display = 'none';
                successView.style.display = 'flex';
            }
        }
    }

    // Open Modal
    if (leadModal) {
        // If already registered, update CTA button text
        if (localStorage.getItem('iabuilder_lead_registered') === 'true') {
            updateLeadCtasAsRegistered();
        }
    }

    // Close Modal
    const closeModal = () => {
        if (leadModal) {
            leadModal.classList.remove('active');
            setTimeout(() => {
                leadModal.style.display = 'none';
            }, 300); // Wait for transition animation
        }
    };

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', closeModal);
    }

    // Close on clicking backdrop outside content card
    if (leadModal) {
        leadModal.addEventListener('click', (e) => {
            if (e.target === leadModal) {
                closeModal();
            }
        });
    }

    if (leadForm) {
        leadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFormError();
            
            const btnSubmit = document.getElementById('btn-submit-lead');
            const nameInput = document.getElementById('lead-name');
            const emailInput = document.getElementById('lead-email');
            const phoneInput = document.getElementById('lead-phone');

            // Disable form and show loading
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Reservando...';

            const leadData = {
                name: nameInput.value.trim(),
                email: emailInput.value.trim(),
                whatsapp: phoneInput.value.trim(),
                source: leadModal?.dataset.source || 'unknown',
                registeredAt: Date.now()
            };

            // Retrieve current session to append lead details
            const session = getOrCreateSession();
            const telemetryPayload = {
                id: session.id,
                startTime: session.start,
                lastActive: Date.now(),
                maxPage: currentSlideIndex,
                currentPage: currentSlideIndex,
                utmSource: session.utmSource,
                utmMedium: session.utmMedium,
                utmCampaign: session.utmCampaign,
                adId: session.adId,
                referrer: session.referrer,
                device: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                lead: leadData // Embed lead data directly inside the session object
            };

            try {
                // Post updated session telemetry with lead data to Firebase
                const response = await fetch(`https://iabuilder-8a7e7-default-rtdb.firebaseio.com/sessions/${session.id}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(telemetryPayload)
                });

                if (!response.ok) {
                    throw new Error(`Lead registration failed with status ${response.status}`);
                }
            } catch (err) {
                console.warn('Telemetry sync error on lead registration:', err);
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Confirmar Minha Vaga';
                showFormError('Nao conseguimos confirmar sua vaga agora. Verifique sua conexao e tente novamente.');
                return;
            }

            // Save to localStorage for quick client-side reference
            localStorage.setItem('iabuilder_lead_registered', 'true');
            localStorage.setItem('iabuilder_lead_name', leadData.name);

            // Update CTA button on slide
            updateLeadCtasAsRegistered();

            // 1. Fire Google Analytics 4 Sign Up event
            if (typeof gtag === 'function' && window.ANALYTICS_CONFIG.googleAnalyticsId && window.ANALYTICS_CONFIG.googleAnalyticsId !== 'G-SEU-ID-GA4') {
                gtag('event', 'sign_up', {
                    method: 'Formulario Workshop',
                    source: leadData.source
                });
            }

            // 2. Fire Meta (Facebook) Pixel CompleteRegistration event
            if (typeof fbq === 'function' && window.ANALYTICS_CONFIG.metaPixelId && window.ANALYTICS_CONFIG.metaPixelId !== 'SEU-ID-META-PIXEL') {
                fbq('track', 'CompleteRegistration', {
                    content_name: 'Workshop Prático ao Vivo',
                    status: 'Success',
                    source: leadData.source
                });
            }

            // 3. Fire Clarity Lead Event
            if (typeof clarity === 'function' && window.ANALYTICS_CONFIG.clarityId && window.ANALYTICS_CONFIG.clarityId !== 'SEU-ID-CLARITY') {
                clarity("set", "lead_registered", "true");
            }

            // Animate transition to success state view
            const formView = document.getElementById('final-form-view');
            const successView = document.getElementById('final-success-view');

            if (formView && successView) {
                formView.style.display = 'none';
                successView.style.display = 'flex';
            }
        });
    }
});
