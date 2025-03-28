/**
 * Navigation module for handling media viewer navigation
 */

// Reference to media viewer element
let mediaViewer;

/**
 * Initialize navigation module
 * 
 * @param {HTMLElement} viewerElement - The media viewer element
 */
export function init(viewerElement) {
    mediaViewer = viewerElement;
}

/**
 * Navigate to the previous media item
 * 
 * @param {Function} openViewerFn - Function to open the media viewer with a new item
 * @param {Event} e - Event object (optional)
 */
export function navigateToPrevMedia(openViewerFn, e) {
    if (e) e.stopPropagation();
    
    const items = mediaViewer.mediaItems;
    if (!items || items.length === 0) {
        console.log("No media items available for navigation");
        return;
    }
    
    const currentId = mediaViewer.dataset.currentItemId;
    const currentIndex = items.findIndex(item => item.id === currentId);
    
    console.log(`Navigation: Current index: ${currentIndex}, Total items: ${items.length}`);
    
    if (currentIndex > 0) {
        const prevItem = items[currentIndex - 1];
        console.log("Navigating to previous item:", prevItem);
        openViewerFn(prevItem, items);
        
        // Show navigation action indicator
        showNavigationIndicator('Previous');
    } else {
        // At the first item, show a bounce effect
        const prevBtn = document.getElementById('prev-media');
        prevBtn.classList.add('nav-btn-bounce');
        setTimeout(() => prevBtn.classList.remove('nav-btn-bounce'), 300);
    }
}

/**
 * Navigate to the next media item
 * 
 * @param {Function} openViewerFn - Function to open the media viewer with a new item
 * @param {Event} e - Event object (optional)
 */
export function navigateToNextMedia(openViewerFn, e) {
    if (e) e.stopPropagation();
    
    const items = mediaViewer.mediaItems;
    if (!items || items.length === 0) {
        console.log("No media items available for navigation");
        return;
    }
    
    const currentId = mediaViewer.dataset.currentItemId;
    const currentIndex = items.findIndex(item => item.id === currentId);
    
    console.log(`Navigation: Current index: ${currentIndex}, Total items: ${items.length}`);
    
    if (currentIndex < items.length - 1) {
        const nextItem = items[currentIndex + 1];
        console.log("Navigating to next item:", nextItem);
        openViewerFn(nextItem, items);
        
        // Show navigation action indicator
        showNavigationIndicator('Next');
    } else {
        // At the last item, show a bounce effect
        const nextBtn = document.getElementById('next-media');
        nextBtn.classList.add('nav-btn-bounce');
        setTimeout(() => nextBtn.classList.remove('nav-btn-bounce'), 300);
    }
}

/**
 * Show navigation indicator
 * 
 * @param {string} direction - Navigation direction ('Next' or 'Previous')
 */
function showNavigationIndicator(direction) {
    let indicator = document.getElementById('navigation-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'navigation-indicator';
        mediaViewer.appendChild(indicator);
    }
    
    indicator.textContent = direction;
    indicator.className = direction.toLowerCase() === 'next' ? 'nav-next' : 'nav-prev';
    indicator.classList.add('active');
    
    clearTimeout(indicator.timeout);
    indicator.timeout = setTimeout(() => {
        indicator.classList.remove('active');
    }, 800);
}

/**
 * Update navigation button states based on current position
 */
export function updateNavigationButtons() {
    const items = mediaViewer.mediaItems;
    if (!items || items.length === 0) {
        // If no items array is available, hide navigation buttons
        const prevBtn = document.getElementById('prev-media');
        const nextBtn = document.getElementById('next-media');
        if (prevBtn) prevBtn.classList.add('hidden');
        if (nextBtn) nextBtn.classList.add('hidden');
        return;
    }
    
    const currentId = mediaViewer.dataset.currentItemId;
    const currentIndex = items.findIndex(item => item.id === currentId);
    
    console.log(`Updating navigation buttons: at position ${currentIndex+1}/${items.length}`);
    
    // Update previous button state
    const prevBtn = document.getElementById('prev-media');
    if (currentIndex <= 0) {
        prevBtn.classList.add('nav-disabled');
    } else {
        prevBtn.classList.remove('nav-disabled');
    }
    
    // Update next button state
    const nextBtn = document.getElementById('next-media');
    if (currentIndex >= items.length - 1) {
        nextBtn.classList.add('nav-disabled');
    } else {
        nextBtn.classList.remove('nav-disabled');
    }
}

/**
 * Set up keyboard navigation
 * 
 * @param {Function} openViewerFn - Function to open the viewer with a new item
 */
export function setupKeyboardNavigation(openViewerFn) {
    document.addEventListener('keydown', (e) => {
        if (mediaViewer.classList.contains('hidden')) return;
        
        if (!e.target.matches('input, textarea')) {
            // Only use left and right arrow keys for navigation between files
            if (e.key === 'ArrowLeft') {
                navigateToPrevMedia(openViewerFn, e);
                e.preventDefault();
            } else if (e.key === 'ArrowRight') {
                navigateToNextMedia(openViewerFn, e);
                e.preventDefault();
            }
        }
    });
}
