/**
 * ArmanLeads Main Interactive JavaScript
 * Modern ES6+, accessibility-first, vanilla JS implementation
 * Compatible with HTML/CSS hooks and fully production-ready
 */
(function() {
    'use strict';

    // Global namespace for external integrations
    window.prusha = window.prusha || {};

    // Utility functions
    const utils = {
        qs: (selector, context = document) => context.querySelector(selector),
        qsa: (selector, context = document) => Array.from(context.querySelectorAll(selector)),
        
        on: (element, event, handler, options = {}) => {
            if (element) element.addEventListener(event, handler, options);
        },
        
        off: (element, event, handler) => {
            if (element) element.removeEventListener(event, handler);
        },
        
        debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },
        
        throttle: (func, limit) => {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        prefersReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        
        trapFocus: (element) => {
            const focusableElements = element.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            const handleTabKey = (e) => {
                if (e.key !== 'Tab') return;
                
                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        lastElement.focus();
                        e.preventDefault();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        e.preventDefault();
                    }
                }
            };

            utils.on(element, 'keydown', handleTabKey);
            if (firstElement) firstElement.focus();
            
            return () => utils.off(element, 'keydown', handleTabKey);
        },

        ensureFocusable: (element) => {
            if (!element.hasAttribute('tabindex')) {
                element.setAttribute('tabindex', '-1');
            }
        },

        dispatchAnalytics: (eventType, detail = {}) => {
            const event = new CustomEvent(`prusha:${eventType}`, {
                detail: { ...detail, timestamp: Date.now() }
            });
            document.dispatchEvent(event);
        }
    };

    // Mobile Navigation Controller
    class MobileNavController {
        constructor() {
            this.navToggle = utils.qs('[data-js="nav-toggle"]');
            this.nav = utils.qs('#site-nav') || utils.qs('.site-nav');
            this.isOpen = false;
            this.focusTrap = null;

            if (this.navToggle && this.nav) {
                this.init();
            }
        }

        init() {
            utils.on(this.navToggle, 'click', () => this.toggle());
            utils.on(document, 'keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            });
        }

        toggle() {
            this.isOpen ? this.close() : this.open();
        }

        open() {
            this.isOpen = true;
            this.nav.classList.add('nav--open');
            this.navToggle.setAttribute('aria-expanded', 'true');
            this.focusTrap = utils.trapFocus(this.nav);
        }

        close() {
            this.isOpen = false;
            this.nav.classList.remove('nav--open');
            this.navToggle.setAttribute('aria-expanded', 'false');
            if (this.focusTrap) {
                this.focusTrap();
                this.focusTrap = null;
            }
            this.navToggle.focus();
        }
    }

    // Smooth Scrolling Controller
    class SmoothScrollController {
        constructor() {
            this.init();
        }

        init() {
            utils.on(document, 'click', (e) => {
                const link = e.target.closest('a[href^="#"]');
                if (!link) return;

                const href = link.getAttribute('href');
                if (href === '#') return;

                const target = utils.qs(href);
                if (!target) return;

                e.preventDefault();
                this.scrollToTarget(target);
            });
        }

        scrollToTarget(target) {
            const navHeight = (utils.qs('.site-nav') || { offsetHeight: 0 }).offsetHeight;
            const offsetTop = target.offsetTop - navHeight - 20;

            if (!utils.prefersReducedMotion()) {
                window.scrollTo({
                    top: Math.max(0, offsetTop),
                    behavior: 'smooth'
                });
            } else {
                window.scrollTo(0, Math.max(0, offsetTop));
            }

            // Focus management
            setTimeout(() => {
                utils.ensureFocusable(target);
                target.focus({ preventScroll: true });
            }, utils.prefersReducedMotion() ? 0 : 500);
        }
    }

    // Form Controller with Validation
    class FormController {
        constructor() {
            this.form = utils.qs('#contact-form') || utils.qs('.contact-form');
            this.liveRegion = this.ensureLiveRegion();
            this.isSubmitting = false;

            if (this.form) {
                this.init();
            }
        }

        init() {
            this.setupValidation();
            utils.on(this.form, 'submit', (e) => this.handleSubmit(e));
        }

        ensureLiveRegion() {
            let region = utils.qs('#live-region');
            if (!region) {
                region = document.createElement('div');
                region.id = 'live-region';
                region.setAttribute('aria-live', 'polite');
                region.setAttribute('aria-atomic', 'true');
                region.className = 'sr-only';
                document.body.appendChild(region);
            }
            return region;
        }

        setupValidation() {
            const inputs = utils.qsa('input, textarea', this.form);
            inputs.forEach(input => {
                utils.on(input, 'blur', () => this.validateField(input));
                utils.on(input, 'input', utils.debounce(() => this.clearError(input), 300));
            });
        }

        validateField(input) {
            const value = input.value.trim();
            const isRequired = input.hasAttribute('required') || input.hasAttribute('aria-required');
            let isValid = true;
            let errorMessage = '';

            if (isRequired && !value) {
                isValid = false;
                errorMessage = 'This field is required';
            } else if (input.type === 'email' && value && !this.isValidEmail(value)) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            } else if (input.type === 'url' && value && !this.isValidUrl(value)) {
                isValid = false;
                errorMessage = 'Please enter a valid URL';
            }

            this.setFieldState(input, isValid, errorMessage);
            return isValid;
        }

        isValidEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }

        isValidUrl(url) {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        }

        setFieldState(input, isValid, errorMessage) {
            const errorId = `${input.name || input.id}-error`;
            let errorElement = utils.qs(`#${errorId}`);

            if (!errorElement) {
                errorElement = document.createElement('span');
                errorElement.id = errorId;
                errorElement.className = 'error-message';
                errorElement.setAttribute('role', 'alert');
                input.parentNode.appendChild(errorElement);
            }

            if (isValid) {
                input.setAttribute('aria-invalid', 'false');
                errorElement.textContent = '';
                errorElement.style.display = 'none';
            } else {
                input.setAttribute('aria-invalid', 'true');
                errorElement.textContent = errorMessage;
                errorElement.style.display = 'block';
            }
        }

        clearError(input) {
            if (input.value.trim()) {
                this.validateField(input);
            }
        }

        async handleSubmit(e) {
            e.preventDefault();
            
            if (this.isSubmitting) return;

            // Validate all fields
            const inputs = utils.qsa('input[required], input[aria-required="true"], textarea[required], textarea[aria-required="true"]', this.form);
            const isFormValid = inputs.every(input => this.validateField(input));

            if (!isFormValid) {
                this.announceToScreenReader('Please correct the errors in the form');
                return;
            }

            this.isSubmitting = true;
            const submitButton = utils.qs('button[type="submit"]', this.form);
            this.setLoadingState(submitButton, true);

            try {
                const formData = new FormData(this.form);
                const action = this.form.getAttribute('action') || '#';

                if (window.fetch && action !== '#') {
                    const response = await fetch(action, {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        this.handleSuccess();
                        utils.dispatchAnalytics('form-submit', {
                            form: this.form.id || 'contact-form',
                            action: action
                        });
                    } else {
                        throw new Error(`Server responded with ${response.status}`);
                    }
                } else {
                    // Fallback or demo mode
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    this.handleSuccess();
                    utils.dispatchAnalytics('form-submit', {
                        form: this.form.id || 'contact-form',
                        action: 'demo'
                    });
                }
            } catch (error) {
                console.warn('Form submission failed:', error.message);
                this.handleError();
            } finally {
                this.isSubmitting = false;
                this.setLoadingState(submitButton, false);
            }
        }

        handleSuccess() {
            this.form.reset();
            this.clearAllErrors();
            this.announceToScreenReader('Form submitted successfully! Check your email for the audit.');
        }

        handleError() {
            this.announceToScreenReader('There was an error submitting the form. Please try again.');
        }

        clearAllErrors() {
            const errorElements = utils.qsa('.error-message', this.form);
            errorElements.forEach(error => {
                error.textContent = '';
                error.style.display = 'none';
            });

            const inputs = utils.qsa('input, textarea', this.form);
            inputs.forEach(input => input.setAttribute('aria-invalid', 'false'));
        }

        setLoadingState(button, loading) {
            if (!button) return;

            if (loading) {
                button.disabled = true;
                button.dataset.originalText = button.textContent;
                button.textContent = 'Sending...';
                button.classList.add('is-loading');
            } else {
                button.disabled = false;
                button.textContent = button.dataset.originalText || 'Submit';
                button.classList.remove('is-loading');
                delete button.dataset.originalText;
            }
        }

        announceToScreenReader(message) {
            if (this.liveRegion) {
                this.liveRegion.textContent = message;
                setTimeout(() => {
                    this.liveRegion.textContent = '';
                }, 5000);
            }
        }
    }

    // Lazy Loading Controller
    class LazyLoadController {
        constructor() {
            this.images = utils.qsa('img[data-src], img[data-srcset]');
            this.observer = null;

            if (this.images.length > 0) {
                this.init();
            }
        }

        init() {
            if ('IntersectionObserver' in window) {
                this.observer = new IntersectionObserver(
                    (entries) => this.handleIntersection(entries),
                    { rootMargin: '50px 0px' }
                );

                this.images.forEach(img => this.observer.observe(img));
            } else {
                // Fallback: load all images immediately
                this.images.forEach(img => this.loadImage(img));
            }
        }

        handleIntersection(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadImage(entry.target);
                    this.observer.unobserve(entry.target);
                }
            });
        }

        loadImage(img) {
            if (img.dataset.src) {
                img.src = img.dataset.src;
                delete img.dataset.src;
            }

            if (img.dataset.srcset) {
                img.srcset = img.dataset.srcset;
                delete img.dataset.srcset;
            }

            utils.on(img, 'load', () => {
                img.style.opacity = '1';
                img.classList.add('loaded');
            }, { once: true });

            utils.on(img, 'error', () => {
                console.warn('Failed to load image:', img.src);
            }, { once: true });
        }
    }

    // Accordion/FAQ Controller
    class AccordionController {
        constructor() {
            this.accordions = utils.qsa('[data-js="accordion-toggle"]');
            this.init();
        }

        init() {
            this.accordions.forEach((toggle, index) => {
                this.setupAccordion(toggle, index);
            });
        }

        setupAccordion(toggle, index) {
            const content = toggle.nextElementSibling;
            if (!content) return;

            // Set up ARIA attributes
            const contentId = `accordion-content-${index}`;
            content.id = contentId;
            toggle.setAttribute('aria-controls', contentId);
            toggle.setAttribute('aria-expanded', 'false');

            // Event listeners
            utils.on(toggle, 'click', () => this.toggleAccordion(toggle, content));
            utils.on(toggle, 'keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggleAccordion(toggle, content);
                }
            });
        }

        toggleAccordion(toggle, content) {
            const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
            
            if (isExpanded) {
                this.closeAccordion(toggle, content);
            } else {
                this.openAccordion(toggle, content);
            }
        }

        openAccordion(toggle, content) {
            toggle.setAttribute('aria-expanded', 'true');
            content.classList.add('accordion--open');
            content.removeAttribute('hidden');
            
            // Focus management
            const firstFocusable = utils.qs('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', content);
            if (firstFocusable) {
                setTimeout(() => firstFocusable.focus(), 300);
            }
        }

        closeAccordion(toggle, content) {
            toggle.setAttribute('aria-expanded', 'false');
            content.classList.remove('accordion--open');
            content.setAttribute('hidden', '');
        }
    }

    // Modal Controller
    class ModalController {
        constructor() {
            this.modals = utils.qsa('[data-js="modal"]');
            this.openTriggers = utils.qsa('[data-js="modal-open"]');
            this.activeTrap = null;

            if (this.modals.length > 0) {
                this.init();
            }
        }

        init() {
            this.openTriggers.forEach(trigger => {
                utils.on(trigger, 'click', (e) => {
                    e.preventDefault();
                    const modalId = trigger.getAttribute('aria-controls') || trigger.getAttribute('href')?.slice(1);
                    const modal = modalId ? utils.qs(`#${modalId}`) : null;
                    if (modal) this.openModal(modal);
                });
            });

            this.modals.forEach(modal => {
                const closeButtons = utils.qsa('[data-js="modal-close"]', modal);
                closeButtons.forEach(button => {
                    utils.on(button, 'click', () => this.closeModal(modal));
                });

                // Close on backdrop click
                utils.on(modal, 'click', (e) => {
                    if (e.target === modal) this.closeModal(modal);
                });
            });

            // Global escape key handler
            utils.on(document, 'keydown', (e) => {
                if (e.key === 'Escape') {
                    const openModal = utils.qs('.modal--open');
                    if (openModal) this.closeModal(openModal);
                }
            });
        }

        openModal(modal) {
            modal.classList.add('modal--open');
            modal.removeAttribute('hidden');
            modal.setAttribute('aria-hidden', 'false');
            
            // Hide page content from screen readers
            const pageContent = utils.qs('main, #main-content');
            if (pageContent) pageContent.setAttribute('aria-hidden', 'true');
            
            // Trap focus
            this.activeTrap = utils.trapFocus(modal);
        }

        closeModal(modal) {
            modal.classList.remove('modal--open');
            modal.setAttribute('hidden', '');
            modal.setAttribute('aria-hidden', 'true');
            
            // Restore page content to screen readers
            const pageContent = utils.qs('main, #main-content');
            if (pageContent) pageContent.setAttribute('aria-hidden', 'false');
            
            // Release focus trap
            if (this.activeTrap) {
                this.activeTrap();
                this.activeTrap = null;
            }
        }
    }

    // CTA Analytics Controller
    class CTAController {
        constructor() {
            this.init();
        }

        init() {
            // Track CTA clicks
            utils.on(document, 'click', (e) => {
                const cta = e.target.closest('[data-analytics="cta"], .btn-primary');
                if (cta) {
                    const label = cta.textContent?.trim() || cta.getAttribute('aria-label') || 'CTA';
                    utils.dispatchAnalytics('cta-click', {
                        label,
                        href: cta.href || null,
                        element: cta.tagName.toLowerCase()
                    });
                }
            });
        }
    }

    // Scroll Animations Controller (Optional Enhancement)
    class ScrollAnimationsController {
        constructor() {
            this.elements = utils.qsa('.fade-in, .reveal-on-scroll');
            
            if (this.elements.length > 0 && !utils.prefersReducedMotion()) {
                this.init();
            }
        }

        init() {
            if ('IntersectionObserver' in window) {
                this.observer = new IntersectionObserver(
                    (entries) => this.handleIntersection(entries),
                    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
                );

                this.elements.forEach(el => this.observer.observe(el));
            }
        }

        handleIntersection(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    this.observer.unobserve(entry.target);
                }
            });
        }
    }

    // Main Application Controller
    class ArmanLeadsApp {
        constructor() {
            this.controllers = {};
            this.init();
        }

        init() {
            if (document.readyState === 'loading') {
                utils.on(document, 'DOMContentLoaded', () => this.initializeControllers());
            } else {
                this.initializeControllers();
            }
        }

        initializeControllers() {
            try {
                this.controllers.mobileNav = new MobileNavController();
                this.controllers.smoothScroll = new SmoothScrollController();
                this.controllers.form = new FormController();
                this.controllers.lazyLoad = new LazyLoadController();
                this.controllers.accordion = new AccordionController();
                this.controllers.modal = new ModalController();
                this.controllers.cta = new CTAController();
                this.controllers.scrollAnimations = new ScrollAnimationsController();

                // Performance optimization
                const debouncedResize = utils.debounce(() => {
                    // Trigger recalculations if needed
                    this.handleResize();
                }, 250);

                utils.on(window, 'resize', debouncedResize, { passive: true });

                console.log('ArmanLeads app initialized successfully');
            } catch (error) {
                console.error('Error initializing ArmanLeads app:', error);
            }
        }

        handleResize() {
            // Handle any resize-specific logic here
        }

        // Public API
        getController(name) {
            return this.controllers[name];
        }

        // Cleanup for SPA navigation
        destroy() {
            Object.values(this.controllers).forEach(controller => {
                if (controller.destroy) controller.destroy();
            });
        }
    }

    // Initialize the application
    const app = new ArmanLeadsApp();

    // Expose to global namespace for external integrations
    window.prusha.app = app;
    window.prusha.utils = {
        dispatchAnalytics: utils.dispatchAnalytics,
        announce: (message) => {
            const liveRegion = utils.qs('#live-region');
            if (liveRegion) {
                liveRegion.textContent = message;
                setTimeout(() => liveRegion.textContent = '', 3000);
            }
        }
    };

    // Export for potential module use
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ArmanLeadsApp;
    }

})();