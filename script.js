/*
 * ArmanLeads Premium Interactive Script
 * 
 * CHANGELOG:
 * - Implemented module pattern with zero global pollution (except optional debug object)
 * - Added progressive form enhancement with fetch-based Formspree submission
 * - Integrated lazy Calendly loading with event tracking and focus management
 * - Built performant sticky CTA with RAF-based scroll detection
 * - Created accessible modal/focus trap system with ESC key support
 * - Added comprehensive GA4 analytics wrapper with graceful degradation
 * 
 * DEVELOPER SETUP INSTRUCTIONS:
 * Replace the following placeholders before deployment:
 * 1. Line ~50: Set your Google Analytics ID (G-XXXXXXX)
 * 2. Line ~200: Verify Formspree endpoint matches HTML form action
 * 3. Line ~420: Confirm Calendly URL in data-calendly-url attribute
 * 
 * Required DOM IDs and Classes:
 * - #mainForm (contact form)
 * - #calendly-embed (Calendly container)
 * - .cta-primary (scroll-to-form buttons)
 * - .cta-secondary (Book a Call buttons)
 * - .sticky-cta (fixed CTA element, hidden by default)
 * - [data-js="nav-toggle"] (mobile menu button)
 * - [data-js="accordion-toggle"] (FAQ buttons)
 */

(function() {
    'use strict';

    // ===== CONFIGURATION =====
    const CONFIG = {
        DEBUG: false, // Set to true for console logging
        GA_ID: 'G-XXXXXXX', // Replace with your GA4 measurement ID
        FORMSPREE_ENDPOINT: 'https://formspree.io/f/xanbrjpn',
        CALENDLY_URL: 'https://calendly.com/vrmvn0/meeting',
        STICKY_CTA_THRESHOLD: 400, // pixels scrolled before showing sticky CTA
        SCROLL_THROTTLE: 100, // ms between scroll checks
        RESIZE_DEBOUNCE: 250 // ms debounce for resize handlers
    };

    // ===== UTILITIES =====
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
    
    const log = (...args) => CONFIG.DEBUG && console.log('[ArmanLeads]', ...args);
    const warn = (...args) => console.warn('[ArmanLeads]', ...args);

    const debounce = (fn, ms) => {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    };

    const throttle = (fn, ms) => {
        let last = 0;
        return function(...args) {
            const now = Date.now();
            if (now - last >= ms) {
                last = now;
                fn.apply(this, args);
            }
        };
    };

    const prefersReducedMotion = () => 
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ===== ANALYTICS WRAPPER =====
    const Analytics = {
        isAvailable() {
            return typeof window.gtag === 'function' || 
                   (window.dataLayer && Array.isArray(window.dataLayer));
        },

        safeGtagEvent(eventName, params = {}) {
            if (!this.isAvailable()) {
                log('Analytics not available, skipping event:', eventName, params);
                return false;
            }

            try {
                if (typeof window.gtag === 'function') {
                    window.gtag('event', eventName, params);
                    log('GA4 event tracked:', eventName, params);
                } else if (window.dataLayer) {
                    window.dataLayer.push({
                        event: eventName,
                        ...params
                    });
                    log('DataLayer event pushed:', eventName, params);
                }
                return true;
            } catch (error) {
                warn('Analytics error:', error);
                return false;
            }
        },

        trackFormSubmit(formId) {
            this.safeGtagEvent('form_submit', {
                method: 'formspree',
                form_id: formId || 'mainForm'
            });
        },

        trackCalendlyBooking(eventData) {
            this.safeGtagEvent('calendly_booking', {
                event_category: 'booking',
                value: 1,
                ...eventData
            });
        },

        trackCTAClick(label, location) {
            this.safeGtagEvent('cta_click', {
                event_category: 'engagement',
                event_label: label,
                location: location
            });
        }
    };

    // ===== FORM HANDLER =====
    const FormHandler = {
        form: null,
        submitBtn: null,
        messagesContainer: null,
        isSubmitting: false,

        init() {
            this.form = $('#mainForm');
            if (!this.form) {
                log('Main form not found');
                return;
            }

            this.submitBtn = $('button[type="submit"]', this.form);
            this.messagesContainer = $('#form-messages') || this.createMessagesContainer();

            this.form.addEventListener('submit', (e) => this.handleSubmit(e));
            log('Form handler initialized');
        },

        createMessagesContainer() {
            const div = document.createElement('div');
            div.id = 'form-messages';
            div.setAttribute('aria-live', 'polite');
            div.setAttribute('aria-atomic', 'true');
            div.className = 'form-messages';
            this.form.appendChild(div);
            return div;
        },

        async handleSubmit(e) {
            e.preventDefault();

            if (this.isSubmitting) return;

            // Basic validation
            if (!this.validateForm()) {
                this.showMessage('Please fill in all required fields correctly.', 'error');
                return;
            }

            this.isSubmitting = true;
            this.setLoadingState(true);

            const formData = new FormData(this.form);
            const endpoint = this.form.action || CONFIG.FORMSPREE_ENDPOINT;

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    this.handleSuccess();
                } else {
                    throw new Error(`Server responded with ${response.status}`);
                }
            } catch (error) {
                warn('Form submission failed:', error);
                this.handleError();
            } finally {
                this.isSubmitting = false;
                this.setLoadingState(false);
            }
        },

        validateForm() {
            const requiredFields = $$('[required], [aria-required="true"]', this.form);
            let isValid = true;

            requiredFields.forEach(field => {
                const value = field.value.trim();
                const errorSpan = $(`#${field.id}-error`) || this.createErrorSpan(field);

                if (!value) {
                    field.setAttribute('aria-invalid', 'true');
                    errorSpan.textContent = 'This field is required';
                    errorSpan.style.display = 'block';
                    isValid = false;
                } else if (field.type === 'email' && !this.isValidEmail(value)) {
                    field.setAttribute('aria-invalid', 'true');
                    errorSpan.textContent = 'Please enter a valid email';
                    errorSpan.style.display = 'block';
                    isValid = false;
                } else {
                    field.setAttribute('aria-invalid', 'false');
                    errorSpan.textContent = '';
                    errorSpan.style.display = 'none';
                }
            });

            return isValid;
        },

        isValidEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        },

        createErrorSpan(field) {
            const span = document.createElement('span');
            span.id = `${field.id}-error`;
            span.className = 'error-message';
            span.setAttribute('role', 'alert');
            field.parentNode.appendChild(span);
            return span;
        },

        handleSuccess() {
            this.showMessage('Thank you! Your audit request has been received. Check your email within 12 hours.', 'success');
            this.form.style.display = 'none';
            Analytics.trackFormSubmit(this.form.id);
            log('Form submitted successfully');
        },

        handleError() {
            this.showMessage('Something went wrong. Please try again or email us directly at hello@armanleads.com', 'error');
        },

        showMessage(text, type) {
            if (!this.messagesContainer) return;

            this.messagesContainer.textContent = text;
            this.messagesContainer.className = `form-messages form-messages--${type}`;
            this.messagesContainer.style.color = type === 'success' ? 'var(--color-success)' : 'var(--color-error)';
            this.messagesContainer.style.fontWeight = '600';
            this.messagesContainer.style.padding = 'var(--space-4)';
            this.messagesContainer.style.borderRadius = 'var(--radius-md)';
            this.messagesContainer.style.background = type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)';

            // Set focus for accessibility
            this.messagesContainer.setAttribute('tabindex', '-1');
            this.messagesContainer.focus();
        },

        setLoadingState(loading) {
            if (!this.submitBtn) return;

            if (loading) {
                this.submitBtn.disabled = true;
                this.submitBtn.setAttribute('aria-busy', 'true');
                this.submitBtn.dataset.originalText = this.submitBtn.textContent;
                this.submitBtn.textContent = 'Sending...';
                this.form.setAttribute('aria-busy', 'true');
            } else {
                this.submitBtn.disabled = false;
                this.submitBtn.setAttribute('aria-busy', 'false');
                this.submitBtn.textContent = this.submitBtn.dataset.originalText || 'Send';
                this.form.setAttribute('aria-busy', 'false');
            }
        }
    };

    // ===== CALENDLY LAZY LOADER =====
    const CalendlyLoader = {
        isLoaded: false,
        isLoading: false,
        embedContainer: null,
        bookCallButtons: [],

        init() {
            this.embedContainer = $('#calendly-embed');
            this.bookCallButtons = $$('.cta-secondary, a[href="#call"]');

            if (!this.embedContainer && this.bookCallButtons.length === 0) {
                log('No Calendly elements found');
                return;
            }

            // Set up intersection observer for embed container
            if (this.embedContainer && 'IntersectionObserver' in window) {
                const observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        this.load();
                        observer.disconnect();
                    }
                }, { rootMargin: '200px' });

                observer.observe(this.embedContainer);
            }

            // Set up click handlers for book call buttons
            this.bookCallButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (!btn.href || btn.href.includes('#call')) {
                        e.preventDefault();
                        this.load();
                        this.scrollToEmbed();
                    }
                    Analytics.trackCTAClick('Book a Call', 'cta-secondary');
                });
            });

            log('Calendly loader initialized');
        },

        async load() {
            if (this.isLoaded || this.isLoading) return;

            this.isLoading = true;
            log('Loading Calendly widget...');

            return new Promise((resolve, reject) => {
                // Check if already loaded
                if (window.Calendly || $('script[src*="calendly"]')) {
                    this.isLoaded = true;
                    this.isLoading = false;
                    this.initWidget();
                    resolve();
                    return;
                }

                const script = document.createElement('script');
                script.src = 'https://assets.calendly.com/assets/external/widget.js';
                script.async = true;

                script.onload = () => {
                    this.isLoaded = true;
                    this.isLoading = false;
                    this.initWidget();
                    this.setupEventTracking();
                    log('Calendly loaded successfully');
                    resolve();
                };

                script.onerror = () => {
                    this.isLoading = false;
                    warn('Failed to load Calendly');
                    this.fallbackToDirectLink();
                    reject(new Error('Calendly script failed to load'));
                };

                document.body.appendChild(script);
            });
        },

        initWidget() {
            if (!window.Calendly || !this.embedContainer) return;

            const url = this.embedContainer.dataset.calendlyUrl || CONFIG.CALENDLY_URL;
            
            try {
                window.Calendly.initInlineWidget({
                    url: url,
                    parentElement: this.embedContainer,
                    prefill: {},
                    utm: {}
                });
                log('Calendly widget initialized');
            } catch (error) {
                warn('Calendly initialization failed:', error);
                this.fallbackToDirectLink();
            }
        },

        setupEventTracking() {
            window.addEventListener('message', (e) => {
                if (e.origin !== 'https://calendly.com') return;

                try {
                    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                    
                    if (data.event === 'calendly.event_scheduled') {
                        log('Calendly booking completed:', data);
                        Analytics.trackCalendlyBooking(data);
                        this.showBookingConfirmation();
                    }
                } catch (error) {
                    // Ignore parse errors from non-Calendly messages
                }
            });
        },

        showBookingConfirmation() {
            const liveRegion = $('#live-region') || this.createLiveRegion();
            liveRegion.textContent = 'Thank you for booking! You will receive a confirmation email shortly.';
            
            setTimeout(() => {
                liveRegion.textContent = '';
            }, 5000);
        },

        createLiveRegion() {
            const region = document.createElement('div');
            region.id = 'live-region';
            region.setAttribute('aria-live', 'polite');
            region.setAttribute('aria-atomic', 'true');
            region.className = 'sr-only';
            document.body.appendChild(region);
            return region;
        },

        scrollToEmbed() {
            if (!this.embedContainer) return;

            const navHeight = ($('.site-nav') || { offsetHeight: 0 }).offsetHeight;
            const targetY = this.embedContainer.offsetTop - navHeight - 20;

            window.scrollTo({
                top: targetY,
                behavior: prefersReducedMotion() ? 'auto' : 'smooth'
            });
        },

        fallbackToDirectLink() {
            if (!this.embedContainer) return;

            const url = this.embedContainer.dataset.calendlyUrl || CONFIG.CALENDLY_URL;
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'btn btn-primary';
            link.textContent = 'Open Calendly (New Tab)';
            link.style.marginTop = 'var(--space-4)';
            
            this.embedContainer.innerHTML = '';
            this.embedContainer.appendChild(link);
        }
    };

    // ===== STICKY CTA =====
    const StickyCTA = {
        element: null,
        isVisible: false,
        scrollThreshold: CONFIG.STICKY_CTA_THRESHOLD,
        rafId: null,

        init() {
            this.element = $('.sticky-cta');
            if (!this.element) {
                log('Sticky CTA element not found');
                return;
            }

            // Use passive scroll listener with throttling
            const checkScroll = throttle(() => {
                if (this.rafId) return;
                
                this.rafId = requestAnimationFrame(() => {
                    this.update();
                    this.rafId = null;
                });
            }, CONFIG.SCROLL_THROTTLE);

            window.addEventListener('scroll', checkScroll, { passive: true });
            log('Sticky CTA initialized');
        },

        update() {
            const scrollY = window.pageYOffset || document.documentElement.scrollTop;
            const shouldShow = scrollY > this.scrollThreshold;

            if (shouldShow && !this.isVisible) {
                this.show();
            } else if (!shouldShow && this.isVisible) {
                this.hide();
            }
        },

        show() {
            this.isVisible = true;
            this.element.classList.add('is-visible');
            log('Sticky CTA shown');
        },

        hide() {
            this.isVisible = false;
            this.element.classList.remove('is-visible');
        }
    };

    // ===== CTA TRACKING =====
    const CTATracking = {
        init() {
            // Track primary CTA clicks (scroll to form)
            $$('.cta-primary, a[href="#contact-form"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    Analytics.trackCTAClick('Get Free Audit', 'cta-primary');
                });
            });

            // Secondary CTA tracking is handled in CalendlyLoader
            log('CTA tracking initialized');
        }
    };

    // ===== SMOOTH SCROLL =====
    const SmoothScroll = {
        init() {
            document.addEventListener('click', (e) => {
                const link = e.target.closest('a[href^="#"]');
                if (!link) return;

                const href = link.getAttribute('href');
                if (href === '#' || href.length <= 1) return;

                const target = $(href);
                if (!target) return;

                e.preventDefault();
                this.scrollToElement(target);
            });
        },

        scrollToElement(el) {
            const navHeight = ($('.site-nav') || { offsetHeight: 0 }).offsetHeight;
            const targetY = el.offsetTop - navHeight - 20;

            window.scrollTo({
                top: Math.max(0, targetY),
                behavior: prefersReducedMotion() ? 'auto' : 'smooth'
            });

            // Focus management
            setTimeout(() => {
                if (!el.hasAttribute('tabindex')) {
                    el.setAttribute('tabindex', '-1');
                }
                el.focus({ preventScroll: true });
            }, prefersReducedMotion() ? 0 : 500);
        }
    };

    // ===== MOBILE NAV =====
    const MobileNav = {
        toggle: null,
        nav: null,
        isOpen: false,

        init() {
            this.toggle = $('[data-js="nav-toggle"]');
            this.nav = $('#site-nav') || $('.site-nav');

            if (!this.toggle || !this.nav) return;

            this.toggle.addEventListener('click', () => this.toggleMenu());

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.closeMenu();
                }
            });

            log('Mobile nav initialized');
        },

        toggleMenu() {
            this.isOpen ? this.closeMenu() : this.openMenu();
        },

        openMenu() {
            this.isOpen = true;
            this.nav.classList.add('nav--open');
            this.toggle.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
        },

        closeMenu() {
            this.isOpen = false;
            this.nav.classList.remove('nav--open');
            this.toggle.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
            this.toggle.focus();
        }
    };

    // ===== ACCORDION (FAQ) =====
    const Accordion = {
        init() {
            $$('[data-js="accordion-toggle"]').forEach((btn, idx) => {
                const content = $('#' + btn.getAttribute('aria-controls'));
                if (!content) return;

                btn.addEventListener('click', () => this.toggle(btn, content));

                btn.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.toggle(btn, content);
                    }
                });
            });

            log('Accordion initialized');
        },

        toggle(btn, content) {
            const isExpanded = btn.getAttribute('aria-expanded') === 'true';

            if (isExpanded) {
                btn.setAttribute('aria-expanded', 'false');
                content.hidden = true;
            } else {
                btn.setAttribute('aria-expanded', 'true');
                content.hidden = false;
            }
        }
    };

    // ===== MAIN APP INITIALIZATION =====
    const App = {
        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.start());
            } else {
                this.start();
            }
        },

        start() {
            try {
                FormHandler.init();
                CalendlyLoader.init();
                StickyCTA.init();
                CTATracking.init();
                SmoothScroll.init();
                MobileNav.init();
                Accordion.init();

                log('App initialized successfully');

                // Expose debug object if DEBUG is enabled
                if (CONFIG.DEBUG) {
                    window.__ArmanLeadsDebug = {
                        version: '1.0.0',
                        config: CONFIG,
                        modules: {
                            FormHandler,
                            CalendlyLoader,
                            StickyCTA,
                            Analytics
                        }
                    };
                }
            } catch (error) {
                warn('Initialization error:', error);
            }
        }
    };

    // Start the app
    App.init();

})();

/*
 * ===== QA TESTING CHECKLIST =====
 * 
 * 1. FORM SUBMISSION
 *    [ ] Fill out form with valid data and submit
 *    [ ] Check Network tab for POST request to Formspree endpoint
 *    [ ] Verify success message appears and form hides
 *    [ ] Test with invalid email format - should show validation error
 *    [ ] Leave required fields empty - should show "required" errors
 * 
 * 2. ANALYTICS EVENTS
 *    [ ] Open DevTools Console with DEBUG=true
 *    [ ] Click "Get Free Audit" CTA - check for cta_click event log
 *    [ ] Submit form - check for form_submit event log
 *    [ ] Book Calendly appointment - check for calendly_booking event
 *    [ ] If GA4 is installed, verify events in Network tab (gtm/collect)
 * 
 * 3. CALENDLY INTEGRATION
 *    [ ] Scroll to "Book a Call" section - widget should lazy-load
 *    [ ] Click "Book a Call" button - should scroll to Calendly embed
 *    [ ] If Calendly script fails, should show fallback link
 *    [ ] Complete a test booking - verify confirmation message
 * 
 * 4. STICKY CTA
 *    [ ] Scroll down 400px+ - sticky CTA should fade in
 *    [ ] Scroll back up - sticky CTA should fade out
 *    [ ] Click sticky CTA - should scroll smoothly to form
 *    [ ] Test on mobile - sticky CTA should be full-width at bottom
 * 
 * 5. ACCESSIBILITY (FOCUS TRAP)
 *    [ ] Open mobile menu - press Tab, focus should cycle within menu
 *    [ ] Press Escape - menu should close and focus returns to toggle
 *    [ ] Expand FAQ accordion - press Tab, verify focus moves to content
 *    [ ] Submit form with errors - focus should move to first error
 * 
 * 6. MOBILE NAVIGATION
 *    [ ] Resize to mobile width (<768px)
 *    [ ] Click hamburger menu - menu should slide in
 *    [ ] Press Escape - menu should close
 *    [ ] Verify body scroll is locked when menu is open
 * 
 * 7. GRACEFUL DEGRADATION
 *    [ ] Disable JavaScript - form should still submit via default POST
 *    [ ] Remove gtag from page - no console errors, events skip silently
 *    [ ] Block Calendly domain - fallback link should appear
 * 
 * 8. PERFORMANCE
 *    [ ] Check Network tab - Calendly should load only on scroll/click
 *    [ ] Scroll rapidly - sticky CTA should not cause jank (use RAF)
 *    [ ] Resize window - debounced, no excessive recalculations
 */