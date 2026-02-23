/**
 * Shalaby Verse - Onboarding Wizard
 * Multi-step onboarding flow
 */
(function() {
    'use strict';

    var currentStep = 1;
    var totalSteps = 4;
    var selectedMotivation = '';
    var selectedTrack = '';

    document.addEventListener('DOMContentLoaded', function() {
        showStep(1);
        initArchetypeCards();
        initTrackCards();
        initNavButtons();
        updateProgressDots();
    });

    function showStep(step) {
        for (var i = 1; i <= totalSteps; i++) {
            var el = document.getElementById('onboarding-step-' + i);
            if (el) el.style.display = i === step ? 'block' : 'none';
        }
        currentStep = step;
        updateProgressDots();
        updateNavButtons();
    }

    function updateProgressDots() {
        document.querySelectorAll('.sv-onboarding-dot').forEach(function(dot, index) {
            dot.classList.toggle('active', index + 1 === currentStep);
            dot.classList.toggle('done', index + 1 < currentStep);
        });
    }

    function updateNavButtons() {
        var backBtn = document.getElementById('onboarding-back');
        var nextBtn = document.getElementById('onboarding-next');
        var submitBtn = document.getElementById('onboarding-submit');

        if (backBtn) backBtn.style.display = currentStep > 1 ? 'inline-flex' : 'none';
        if (nextBtn) nextBtn.style.display = currentStep < totalSteps ? 'inline-flex' : 'none';
        if (submitBtn) submitBtn.style.display = currentStep === totalSteps ? 'inline-flex' : 'none';
    }

    function initArchetypeCards() {
        document.querySelectorAll('.sv-archetype-card').forEach(function(card) {
            card.addEventListener('click', function() {
                document.querySelectorAll('.sv-archetype-card').forEach(function(c) {
                    c.classList.remove('selected');
                });
                this.classList.add('selected');
                selectedMotivation = this.getAttribute('data-motivation');
                var input = document.getElementById('motivation-input');
                if (input) input.value = selectedMotivation;
            });
        });
    }

    function initTrackCards() {
        document.querySelectorAll('.sv-track-select-card').forEach(function(card) {
            card.addEventListener('click', function() {
                document.querySelectorAll('.sv-track-select-card').forEach(function(c) {
                    c.classList.remove('selected');
                });
                this.classList.add('selected');
                selectedTrack = this.getAttribute('data-track');
                var input = document.getElementById('track-input');
                if (input) input.value = selectedTrack;
            });
        });
    }

    function initNavButtons() {
        var backBtn = document.getElementById('onboarding-back');
        var nextBtn = document.getElementById('onboarding-next');

        if (backBtn) {
            backBtn.addEventListener('click', function() {
                if (currentStep > 1) showStep(currentStep - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                // Validate step 2
                if (currentStep === 2 && !selectedMotivation) {
                    var cards = document.querySelector('.sv-archetype-grid');
                    if (cards) {
                        cards.style.animation = 'shake 0.5s ease';
                        setTimeout(function() { cards.style.animation = ''; }, 500);
                    }
                    return;
                }
                if (currentStep < totalSteps) showStep(currentStep + 1);
            });
        }
    }
})();
