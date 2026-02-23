/**
 * Shalaby Verse - Adventure Map
 * Renders animated adventure map nodes with progress tracking
 */
(function() {
    'use strict';

    // Animate nodes on load
    document.addEventListener('DOMContentLoaded', function() {
        const nodes = document.querySelectorAll('.sv-adventure-node');
        if (!nodes.length) return;

        // Staggered entrance animation
        nodes.forEach(function(node, index) {
            node.style.opacity = '0';
            node.style.transform = 'scale(0.5)';
            node.style.transition = 'opacity 0.4s ease, transform 0.4s ease';

            setTimeout(function() {
                node.style.opacity = '1';
                node.style.transform = 'scale(1)';
            }, index * 80);
        });

        // Animate progress bar fill
        const progressFill = document.querySelector('.sv-adventure-progress-fill');
        if (progressFill) {
            const targetWidth = progressFill.style.width;
            progressFill.style.width = '0%';
            setTimeout(function() {
                progressFill.style.width = targetWidth;
            }, nodes.length * 80 + 200);
        }

        // Scroll to current node
        const currentNode = document.querySelector('.sv-adventure-node--current');
        if (currentNode) {
            const mapContainer = document.querySelector('.sv-adventure-map');
            if (mapContainer) {
                setTimeout(function() {
                    const nodeRect = currentNode.getBoundingClientRect();
                    const containerRect = mapContainer.getBoundingClientRect();
                    const scrollLeft = nodeRect.left - containerRect.left - containerRect.width / 2 + nodeRect.width / 2;
                    mapContainer.scrollLeft += scrollLeft;
                }, nodes.length * 80 + 400);
            }
        }

        // Click handler for completed/current nodes
        nodes.forEach(function(node) {
            if (node.classList.contains('sv-adventure-node--locked')) return;

            node.style.cursor = 'pointer';
            node.addEventListener('click', function() {
                // Could navigate to lesson viewer in the future
                const circle = node.querySelector('.sv-adventure-node-circle');
                if (circle) {
                    circle.style.transform = 'scale(1.2)';
                    setTimeout(function() {
                        circle.style.transform = 'scale(1)';
                    }, 200);
                }
            });
        });
    });
})();
