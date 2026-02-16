// Scroll animation observer
document.addEventListener('DOMContentLoaded', function () {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        },
        {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px',
        }
    );

    document.querySelectorAll('.animate-on-scroll').forEach((el) => {
        observer.observe(el);
    });

    // Add stagger delay to grid items
    document.querySelectorAll('.tracks-grid .track-card, .units-grid .unit-card').forEach((card, index) => {
        card.style.transitionDelay = index * 0.1 + 's';
    });

    document.querySelectorAll('.levels-timeline .level-card').forEach((card, index) => {
        card.style.transitionDelay = index * 0.15 + 's';
    });

    document.querySelectorAll('.objectives-list .objective-card').forEach((card, index) => {
        card.style.transitionDelay = index * 0.1 + 's';
    });
});
