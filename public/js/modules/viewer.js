import { insertSvg } from '../utils/svg-loader.js';
import { formatFileSize } from '../utils/helpers.js';
import { renderMetadata } from './metadata.js';
import * as navigationModule from './navigation.js';
import { loadAndFillTemplate } from '../utils/template-loader.js';

/**
 * Media viewer module for displaying and navigating media files
 */

// Module-level variables
let mediaViewer;
let mediaContainer;
let closeViewer;
let mediaMetadataPanel;
let viewerContent;

// Initialize the viewer module
export function init() {
    // Get DOM elements
    mediaViewer = document.getElementById('media-viewer');
    mediaContainer = document.getElementById('media-container');
    closeViewer = document.getElementById('close-viewer');
    mediaMetadataPanel = document.getElementById('media-metadata-panel');
    viewerContent = document.querySelector('.viewer-content');
    
    // Initialize the navigation module with the media viewer
    navigationModule.init(mediaViewer);
    
    // Set up event listeners
    closeViewer.addEventListener('click', () => {
        closeViewerFunction();
    });
    
    // Set up keyboard navigation
    navigationModule.setupKeyboardNavigation(openMediaViewer);
}

// Function to properly close the viewer
export function closeViewerFunction() {
    // Stop video playback if there's a video playing
    const videoElem = mediaContainer.querySelector('video');
    if (videoElem) {
        videoElem.pause();
    }
    
    // Remove zoom indicator if it exists
    const zoomIndicator = document.getElementById('zoom-indicator');
    if (zoomIndicator) {
        zoomIndicator.remove();
    }
    
    // Hide the viewer
    mediaViewer.classList.add('hidden');
}

// Open media viewer with a specific item
export async function openMediaViewer(item, mediaItems = null, navigationContext = null) {
    mediaContainer.innerHTML = '';
    mediaMetadataPanel.innerHTML = '';
    
    console.log("Opening media viewer with item:", item);
    if (mediaItems) {
        console.log(`With navigation: ${mediaItems.length} items available`);
    }
    
    // Store current item and all items for navigation
    mediaViewer.dataset.currentItemId = item.id;
    
    // Store navigation context for cross-day navigation
    if (navigationContext) {
        mediaViewer.navigationContext = navigationContext;
    }
    
    // If mediaItems is provided, store it for navigation
    if (mediaItems) {
        // Store the items array as a property on the viewer
        mediaViewer.mediaItems = mediaItems;
    }
    
    // Create metadata header container - simplified without media type icon
    const metadataHeader = document.createElement('div');
    metadataHeader.className = 'metadata-header-container';
    
    // Add the header container to the metadata panel
    mediaMetadataPanel.appendChild(metadataHeader);
    
    // Create a header highlight element in the metadata panel
    const headerHighlight = document.createElement('div');
    headerHighlight.className = 'metadata-header-highlight';
    mediaMetadataPanel.appendChild(headerHighlight);
    
    // Render metadata in the side panel - this will include the item name
    await renderMetadata(item, mediaMetadataPanel);
    
    // Load navigation buttons from template
    const navButtons = await loadAndFillTemplate('/public/templates/navigation-buttons.html');
    mediaContainer.appendChild(navButtons);
    
    // Insert SVGs
    insertSvg('/public/img/icons/chevron-left.svg', document.querySelector('.chevron-left-icon'));
    insertSvg('/public/img/icons/chevron-right.svg', document.querySelector('.chevron-right-icon'));
    
    // Update navigation button states
    navigationModule.updateNavigationButtons();
    
    // Add event listeners to navigation buttons
    document.getElementById('prev-media').addEventListener('click', 
        (e) => navigationModule.navigateToPrevMedia(openMediaViewer, e));
    document.getElementById('next-media').addEventListener('click', 
        (e) => navigationModule.navigateToNextMedia(openMediaViewer, e));
    
    if (item.type === 'image') {
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'image-zoom-wrapper';
        
        const img = document.createElement('img');
        img.src = `/media${item.path}`;
        img.alt = item.name;
        img.className = 'zoomable-image';
        
        // Add event listener to update resolution once the image loads
        img.addEventListener('load', () => {
            const resolutionEl = mediaMetadataPanel.querySelector('.resolution-value');
            if (resolutionEl && resolutionEl.textContent === 'Unknown') {
                resolutionEl.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
            }
        });
        
        imgWrapper.appendChild(img);
        mediaContainer.appendChild(imgWrapper);
        
        // Initialize zoom functionality without fullscreen support
        initializeImageZoom(img, imgWrapper);
    } else if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = `/media${item.path}`;
        video.controls = true;
        video.autoplay = false;
        
        // Add metadata event listener to update resolution when video metadata loads
        video.addEventListener('loadedmetadata', () => {
            const resolutionEl = mediaMetadataPanel.querySelector('.resolution-value');
            if (resolutionEl && resolutionEl.textContent === 'Unknown') {
                resolutionEl.textContent = `${video.videoWidth} × ${video.videoHeight}`;
            }
        });
        
        mediaContainer.appendChild(video);
    }
    
    mediaViewer.classList.remove('hidden');
    
    // Add keyboard shortcuts info from template
    const keyboardHints = await loadAndFillTemplate('/public/templates/keyboard-hints.html');
    mediaViewer.appendChild(keyboardHints);
    
    // Add fade-out class after delay
    const hintElement = mediaViewer.querySelector('.keyboard-hints');
    setTimeout(() => {
        hintElement.classList.add('fade-out');
    }, 3000);
    
    // Update close button to use our closeViewerFunction
    closeViewer.removeEventListener('click', closeViewerFunction);
    closeViewer.addEventListener('click', closeViewerFunction);
}

// Initialize image zoom functionality without fullscreen support
function initializeImageZoom(imgElement, wrapperElement) {
    let currentScale = 1;
    const minScale = 0.5;
    const maxScale = 5;
    const scaleStep = 0.1;
    const keyboardScaleStep = 0.2; // Double the regular scale step for keyboard shortcuts
    
    // Add variables for panning
    let isDragging = false;
    let startX, startY;
    let translateX = 0;
    let translateY = 0;
    let lastX, lastY; // Track the last mouse position for smoother dragging
    
    // Helper function to hide keyboard hints immediately
    function hideKeyboardHints() {
        const keyboardHints = document.querySelector('.keyboard-hints');
        if (keyboardHints) {
            keyboardHints.remove(); // Remove completely instead of just fading out
        }
    }
    
    // Reset zoom and position when the viewer opens
    function resetZoom() {
        currentScale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
    }
    
    // Update the CSS transform with bounds checking
    function updateTransform() {
        // Only allow panning when zoomed in
        if (currentScale <= 1) {
            translateX = 0;
            translateY = 0;
        } else {
            // Calculate bounds based on current zoom level and image/wrapper dimensions
            const imgRect = imgElement.getBoundingClientRect();
            const wrapperRect = wrapperElement.getBoundingClientRect();
            
            // Calculate how much the image extends beyond the wrapper
            const overflowX = (imgRect.width * currentScale - wrapperRect.width) / 2;
            const overflowY = (imgRect.height * currentScale - wrapperRect.height) / 2;
            
            // Limit translation to prevent going out of bounds
            if (overflowX > 0) {
                translateX = Math.max(-overflowX, Math.min(overflowX, translateX));
            } else {
                translateX = 0;
            }
            
            if (overflowY > 0) {
                translateY = Math.max(-overflowY, Math.min(overflowY, translateY));
            } else {
                translateY = 0;
            }
        }
        
        imgElement.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
    }
    
    // Handle mouse wheel for zooming
    wrapperElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Hide hints immediately on first zoom interaction
        hideKeyboardHints();
        
        // Determine zoom direction
        const delta = e.deltaY < 0 ? scaleStep : -scaleStep;
        const newScale = Math.max(minScale, Math.min(maxScale, currentScale + delta));
        
        if (currentScale !== newScale) {
            // Calculate zoom relative to cursor position
            const rect = wrapperElement.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Calculate how much the image will grow/shrink
            const scaleFactor = newScale / currentScale;
            
            // Adjust translation to zoom towards cursor
            if (currentScale > 1) {
                translateX = mouseX - (mouseX - translateX) * scaleFactor;
                translateY = mouseY - (mouseY - translateY) * scaleFactor;
            }
            
            currentScale = newScale;
            updateTransform();
            updateZoomIndicator();
        }
    });
    
    // Handle mouse down for dragging - Fix for improved drag detection
    imgElement.addEventListener('mousedown', (e) => {
        if (currentScale > 1) {
            e.preventDefault(); // Prevent image dragging behavior
            
            // Hide hints immediately on drag interaction
            hideKeyboardHints();
            
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            lastX = e.clientX; // Store last position
            lastY = e.clientY;
            imgElement.style.cursor = 'grabbing';
            
            // Add a class to the wrapper to prevent text selection during drag
            wrapperElement.classList.add('dragging');
        }
    });
    
    // Handle mouse move for dragging - Improved for smoother dragging
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        // Calculate movement based on current event and last position
        const deltaX = e.clientX - lastX;
        const deltaY = e.clientY - lastY;
        
        // Update last position
        lastX = e.clientX;
        lastY = e.clientY;
        
        // Apply the movement directly (more responsive than recalculating from start)
        translateX += deltaX;
        translateY += deltaY;
        
        // Apply bounds and update the transform
        updateTransform();
    });
    
    // Handle mouse up to end dragging - Enhanced with better cleanup
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            imgElement.style.cursor = currentScale > 1 ? 'grab' : 'zoom-in';
            wrapperElement.classList.remove('dragging');
        }
    });
    
    // Handle mouse leave to prevent stuck dragging state
    wrapperElement.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            imgElement.style.cursor = currentScale > 1 ? 'grab' : 'zoom-in';
            wrapperElement.classList.remove('dragging');
        }
    });
    
    // Show zoom indicator
    function updateZoomIndicator() {
        // Create or update the zoom indicator
        let zoomIndicator = document.getElementById('zoom-indicator');
        if (!zoomIndicator) {
            zoomIndicator = document.createElement('div');
            zoomIndicator.id = 'zoom-indicator';
            mediaViewer.appendChild(zoomIndicator);
        }
        
        // Show zoom percentage
        zoomIndicator.textContent = `${Math.round(currentScale * 100)}%`;
        zoomIndicator.classList.add('active');
        
        // Update cursor based on zoom level
        if (currentScale > 1) {
            imgElement.style.cursor = isDragging ? 'grabbing' : 'grab';
        } else {
            imgElement.style.cursor = 'zoom-in';
        }
        
        // Hide the indicator after a delay
        clearTimeout(zoomIndicator.timeout);
        zoomIndicator.timeout = setTimeout(() => {
            zoomIndicator.classList.remove('active');
        }, 1500);
    }
    
    // Touch support for pinch zoom and panning - Enhanced for better dragging
    let initialDistance = 0;
    let initialScale = 1;
    let touchStartX, touchStartY;
    
    // Handle pinch to zoom and touch panning
    wrapperElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            
            // Hide hints immediately on pinch zoom interaction
            hideKeyboardHints();
            
            initialDistance = getDistance(e.touches[0], e.touches[1]);
            initialScale = currentScale;
            
            // Calculate midpoint of touches as reference point for zoom
            touchStartX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            touchStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        } else if (e.touches.length === 1 && currentScale > 1) {
            // Hide hints immediately on touch drag interaction when zoomed
            hideKeyboardHints();
            
            isDragging = true;
            startX = e.touches[0].clientX - translateX;
            startY = e.touches[0].clientY - translateY;
            lastX = e.touches[0].clientX; // Track last position for smoother movement
            lastY = e.touches[0].clientY;
        }
    }, { passive: false });
    
    // Handle touch move with enhanced panning
    wrapperElement.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const distance = getDistance(e.touches[0], e.touches[1]);
            const scaleFactor = distance / initialDistance;
            
            const newScale = Math.max(minScale, Math.min(maxScale, initialScale * scaleFactor));
            
            if (currentScale !== newScale) {
                // Calculate midpoint of current touches
                const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                
                // Calculate how much midpoint has moved
                const deltaX = currentMidX - touchStartX;
                const deltaY = currentMidY - touchStartY;
                
                // Apply scale and then translation
                currentScale = newScale;
                translateX += deltaX;
                translateY += deltaY;
                
                // Update reference point for next move
                touchStartX = currentMidX;
                touchStartY = currentMidY;
                
                updateTransform();
                updateZoomIndicator();
            }
        } else if (e.touches.length === 1 && isDragging) {
            // Use delta movement for smoother touch dragging
            const deltaX = e.touches[0].clientX - lastX;
            const deltaY = e.touches[0].clientY - lastY;
            
            translateX += deltaX;
            translateY += deltaY;
            
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            
            updateTransform();
            
            // Prevent default to avoid page scrolling when panning
            if (currentScale > 1) {
                e.preventDefault();
            }
        }
    }, { passive: false });
    
    wrapperElement.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            initialDistance = 0;
            initialScale = currentScale;
        }
        
        if (e.touches.length === 0) {
            isDragging = false;
        }
    });
    
    // Helper function to calculate distance between two touch points
    function getDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Set initial cursor style
    imgElement.style.cursor = 'zoom-in';
    
    // Initial update
    updateTransform();
    
    // Handle keyboard navigation for accessibility
    // Use WASD or +/- for zooming
    document.addEventListener('keydown', (e) => {
        // Only respond if viewer is visible
        if (mediaViewer.classList.contains('hidden')) return;
        
        const moveStep = 100; // pixels to move per keypress
        
        switch (e.key) {
            // Use WASD for panning when zoomed in
            case 'w':
            case 'a':
            case 's':
            case 'd':
                if (currentScale > 1) {
                    // Hide hints immediately on keyboard pan interaction
                    hideKeyboardHints();
                    
                    switch (e.key) {
                        case 'w':
                            translateY += moveStep;
                            break;
                        case 'a':
                            translateX += moveStep;
                            break;
                        case 's':
                            translateY -= moveStep;
                            break;
                        case 'd':
                            translateX -= moveStep;
                            break;
                    }
                    e.preventDefault();
                    updateTransform();
                }
                break;
            // Use + and - for zooming in and out, even when not already zoomed
            case '+':
            case '=': // Same key as + without shift
                // Hide hints immediately on keyboard zoom interaction
                hideKeyboardHints();
                
                // Allow zooming in regardless of current zoom state
                if (currentScale < maxScale) {
                    currentScale += keyboardScaleStep; // Use the doubled scale step
                    currentScale = Math.min(currentScale, maxScale); // Ensure we don't exceed max scale
                    updateTransform();
                    updateZoomIndicator();
                    e.preventDefault();
                }
                break;
            case '-':
                // Hide hints immediately on keyboard zoom interaction
                hideKeyboardHints();
                
                // Allow zooming out regardless of current zoom state
                if (currentScale > minScale) {
                    currentScale -= keyboardScaleStep; // Use the doubled scale step
                    currentScale = Math.max(currentScale, minScale); // Ensure we don't go below min scale
                    updateTransform();
                    updateZoomIndicator();
                    e.preventDefault();
                }
                break;
        }
    });
}
