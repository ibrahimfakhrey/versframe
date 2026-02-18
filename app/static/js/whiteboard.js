/* === Whiteboard (Excalidraw Integration) === */

function initWhiteboard() {
    const frame = document.getElementById('whiteboardFrame');
    if (!frame) return;

    // Excalidraw is embedded via iframe
    // Communication happens via postMessage
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'excalidraw') {
            // Handle whiteboard state sync
            console.log('Whiteboard update received');
        }
    });
}
