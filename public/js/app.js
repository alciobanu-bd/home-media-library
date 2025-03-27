document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const gallery = document.getElementById('gallery');
    const allMediaBtn = document.getElementById('all-media-btn');
    const imagesBtn = document.getElementById('images-btn');
    const videosBtn = document.getElementById('videos-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadModal = document.getElementById('upload-modal');
    const closeUploadModal = document.getElementById('close-upload-modal');
    const modalOverlay = document.querySelector('.modal-overlay');
    const dragArea = document.querySelector('.drag-area');
    const fileInput = document.getElementById('file-input');
    const browseFilesBtn = document.getElementById('browse-files');
    const fileList = document.getElementById('file-list');
    const uploadSubmitBtn = document.getElementById('upload-submit');
    const cancelUploadBtn = document.getElementById('cancel-upload');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    const mediaViewer = document.getElementById('media-viewer');
    const mediaContainer = document.getElementById('media-container');
    const closeViewer = document.getElementById('close-viewer');
    const mediaName = document.getElementById('media-name');
    const mediaDetails = document.getElementById('media-details');
    
    // State
    let currentFilter = null;
    let currentPage = 1;
    let totalPages = 1;
    const pageSize = 24;
    let selectedFiles = [];
    
    // Add selection mode state variables
    let isSelectionMode = false;
    let selectedMediaItems = new Set();
    const selectionToolbar = document.createElement('div');
    selectionToolbar.className = 'selection-toolbar hidden';
    selectionToolbar.innerHTML = `
        <div class="selection-count">0 items selected</div>
        <div class="selection-actions">
            <button id="delete-selected" class="selection-action-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                    <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
                Delete Selected
            </button>
            <button id="cancel-selection" class="selection-action-btn">Cancel</button>
        </div>
    `;
    document.getElementById('app').appendChild(selectionToolbar);
    
    // Selection toolbar event listeners
    document.getElementById('delete-selected').addEventListener('click', () => deleteSelectedMedia());
    document.getElementById('cancel-selection').addEventListener('click', () => exitSelectionMode());
    
    // Load media
    const loadMedia = async () => {
        gallery.innerHTML = '<div class="loading">Loading media library...</div>';
        
        try {
            let url = `/api/media?page=${currentPage}&limit=${pageSize}`;
            if (currentFilter) {
                url += `&type=${currentFilter}`;
            }
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (!data.data || data.data.length === 0) {
                gallery.innerHTML = '<div class="loading">No media files found</div>';
                return;
            }
            
            totalPages = Math.ceil(data.total / pageSize);
            updatePagination();
            
            // Sort the media items by creation date (newest first)
            data.data.sort((a, b) => {
                const dateA = new Date(a.created || a.modified);
                const dateB = new Date(b.created || b.modified);
                return dateB - dateA;
            });
            
            // Group media by date
            const mediaByDate = {};
            
            data.data.forEach(item => {
                // Get date in YYYY-MM-DD format for grouping
                const itemDate = new Date(item.created || item.modified);
                const dateKey = itemDate.toISOString().split('T')[0];
                
                if (!mediaByDate[dateKey]) {
                    mediaByDate[dateKey] = [];
                }
                
                mediaByDate[dateKey].push(item);
            });
            
            // Clear gallery
            gallery.innerHTML = '';

            // Store the date groups in a global variable for navigation
            window.dateGroups = Object.keys(mediaByDate).sort().reverse();
            window.mediaByDateMap = mediaByDate; // Store full media map for cross-date navigation
            
            // Create date section headers and items for each date
            window.dateGroups.forEach(dateKey => {
                const items = mediaByDate[dateKey];
                const date = new Date(dateKey);
                
                // Create a header for this date group
                const dateHeader = document.createElement('div');
                dateHeader.className = 'date-header';
                dateHeader.dataset.dateKey = dateKey;
                dateHeader.innerHTML = `
                    <h2>${formatDateHeader(date)}</h2>
                `;
                gallery.appendChild(dateHeader);
                
                // Create a container for this date's media items
                const dateGroup = document.createElement('div');
                dateGroup.className = 'date-group';
                dateGroup.dataset.dateKey = dateKey;
                
                // Add all media items for this date
                items.forEach(item => {
                    const mediaItem = createMediaItem(item);
                    dateGroup.appendChild(mediaItem);
                });
                
                gallery.appendChild(dateGroup);
            });
        } catch (error) {
            console.error('Failed to load media:', error);
            gallery.innerHTML = '<div class="loading">Failed to load media. Please try again.</div>';
        }
    };
    
    // Create a single media item element
    const createMediaItem = (item) => {
        const mediaItem = document.createElement('div');
        mediaItem.className = 'media-item';
        mediaItem.dataset.id = item.id;
        mediaItem.dataset.type = item.type;
        
        // Store all item data as JSON in a data attribute for easy access during navigation
        mediaItem.dataset.itemData = JSON.stringify({
            id: item.id,
            type: item.type,
            name: item.name,
            path: item.path,
            size: item.size || 0,
            created: item.created,
            modified: item.modified || item.created
        });
        
        let thumbnailUrl;
        if (item.type === 'image') {
            thumbnailUrl = `/media${item.path}`;
        } else {
            // Video thumbnail - use a placeholder for now
            thumbnailUrl = '/public/img/video-placeholder.svg';
        }
        
        // Format file size and date for display
        const fileSize = formatFileSize(item.size);
        const dateCreated = formatDate(item.created || item.modified); // Use created date if available, fallback to modified
        const fileType = item.type.charAt(0).toUpperCase() + item.type.slice(1);
        
        mediaItem.innerHTML = `
            <div class="selection-indicator">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
                </svg>
            </div>
            <button class="select-mode-btn" title="Select">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
                    <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
                </svg>
            </button>
            <div class="thumbnail-container">
                <img class="media-thumbnail" src="${thumbnailUrl}" alt="${item.name}">
            </div>
            <div class="media-info">
                <div class="media-name">${item.name}</div>
                <div class="media-actions-row">
                    <div class="media-metadata">
                        <span class="media-type-badge media-type-${item.type}">${fileType}</span>
                        <span>${fileSize}</span>
                        <span class="media-date">${dateCreated}</span>
                    </div>
                    <button class="delete-media-btn" data-id="${item.id}" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        const deleteBtn = mediaItem.querySelector('.delete-media-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening the media viewer when clicking delete
            deleteMedia(item);
        });
        
        // Add select mode button handler
        const selectModeBtn = mediaItem.querySelector('.select-mode-btn');
        selectModeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening the viewer
            if (!isSelectionMode) {
                enterSelectionMode();
            }
            toggleItemSelection(mediaItem, item.id);
        });
        
        // Use touchend instead of click for better mobile experience
        mediaItem.addEventListener('click', (e) => {
            if (isSelectionMode) {
                e.preventDefault();
                toggleItemSelection(mediaItem, item.id);
            } else {
                // Get the current date group for this item
                const dateGroup = mediaItem.closest('.date-group');
                const dateKey = dateGroup.dataset.dateKey;
                
                // Create context data for navigation
                const navigationContext = {
                    currentDateKey: dateKey,
                    dateGroups: window.dateGroups,
                    mediaByDateMap: window.mediaByDateMap
                };
                
                // Pass the navigation context to the viewer
                openMediaViewer(item, window.mediaByDateMap[dateKey], navigationContext);
            }
        });
        
        // Remove long press on mobile devices and use tap on select button instead
        let pressTimer;
        let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        if (!isMobile) {
            // Keep long press for desktop
            mediaItem.addEventListener('mousedown', () => {
                pressTimer = window.setTimeout(() => {
                    if (!isSelectionMode) {
                        enterSelectionMode();
                        toggleItemSelection(mediaItem, item.id);
                    }
                }, 500); // Long press: 500ms
            });
            
            mediaItem.addEventListener('mouseup', () => {
                clearTimeout(pressTimer);
            });
            
            mediaItem.addEventListener('mouseleave', () => {
                clearTimeout(pressTimer);
            });
        }
        
        // Handle double-click
        mediaItem.addEventListener('dblclick', (e) => {
            e.preventDefault();
            if (!isSelectionMode) {
                enterSelectionMode();
                toggleItemSelection(mediaItem, item.id);
            }
        });
        
        return mediaItem;
    };

    // Format date for headers
    const formatDateHeader = (date) => {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        
        // If the date is today
        if (date.toDateString() === now.toDateString()) {
            return 'Today';
        }
        
        // If the date is yesterday
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        }
        
        // If the date is within this week
        const dayDiff = Math.round((now - date) / (1000 * 60 * 60 * 24));
        if (dayDiff < 7) {
            return date.toLocaleDateString(undefined, { weekday: 'long' });
        }
        
        // If the date is within this year
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
        }
        
        // For older dates
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    };

    // Open media viewer
    const openMediaViewer = (item, mediaItems = null, navigationContext = null) => {
        mediaContainer.innerHTML = '';
        mediaName.textContent = item.name;
        
        console.log("Opening media viewer with item:", item);
        if (mediaItems) {
            console.log(`With navigation: ${mediaItems.length} items available in current day`);
        }
        
        // Store current item and all items for navigation
        mediaViewer.dataset.currentItemId = item.id;
        
        // Store navigation context
        if (navigationContext) {
            mediaViewer.navigationContext = navigationContext;
        }
        
        // If mediaItems is provided, store it for navigation
        if (mediaItems) {
            // Store the items array as a property on the viewer
            mediaViewer.mediaItems = mediaItems;
        }
        
        // Format file size
        const fileSize = formatFileSize(item.size);
        const dateCreated = new Date(item.created || item.modified).toLocaleString();
        const fileType = item.type.charAt(0).toUpperCase() + item.type.slice(1);
        const extension = item.name.split('.').pop().toUpperCase();
        
        // Build raw metadata display
        let rawMetadata = '';
        for (const key in item) {
            // Include all fields for full transparency
            const value = item[key];
            let displayValue = value;
            
            if (key === 'size') {
                displayValue = formatFileSize(value);
            } else if (key === 'created' || key === 'modified') {
                displayValue = new Date(value).toLocaleString();
            } else if (key === 'id') {
                displayValue = value.substring(0, 10) + '...'; // Truncate long IDs
            }
            
            rawMetadata += `<div class="metadata-row"><span class="metadata-key">${key}:</span><span class="metadata-value">${displayValue}</span></div>`;
        }
        
        mediaDetails.innerHTML = `
            <div><strong>${fileType} (${extension})</strong> · ${fileSize}</div>
            <div>Taken: ${dateCreated}</div>
            <div>Path: ${item.path}</div>
            <details class="raw-metadata" open>
                <summary>▼ Show Raw Metadata</summary>
                <div class="raw-metadata-content">
                    ${rawMetadata}
                </div>
            </details>
        `;
        
        // Create navigation buttons with unique IDs to ensure we can reference them
        const navigationPrev = document.createElement('button');
        navigationPrev.id = 'prev-media';
        navigationPrev.className = 'viewer-navigation-btn prev-btn';
        navigationPrev.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                <path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
            </svg>
        `;
        
        const navigationNext = document.createElement('button');
        navigationNext.id = 'next-media';
        navigationNext.className = 'viewer-navigation-btn next-btn';
        navigationNext.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
            </svg>
        `;
        
        // Add fullscreen button to the media viewer controls
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.id = 'fullscreen-toggle';
        fullscreenBtn.className = 'viewer-control-btn';
        fullscreenBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" class="fullscreen-icon">
                <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/>
            </svg>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" class="exit-fullscreen-icon hidden">
                <path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 4.5v-4a.5.5 0 0 1 .5-.5zM0 10.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 11.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z"/>
            </svg>
        `;
        
        // Add navigation buttons to the viewer
        mediaContainer.appendChild(navigationPrev);
        mediaContainer.appendChild(navigationNext);
        
        // Add the fullscreen button to the viewer controls
        const viewerControls = document.createElement('div');
        viewerControls.className = 'viewer-controls';
        viewerControls.appendChild(fullscreenBtn);
        mediaContainer.appendChild(viewerControls);
        
        // Update navigation button states
        updateNavigationButtons();
        
        // Add event listeners to navigation buttons - using direct function references
        navigationPrev.addEventListener('click', navigateToPrevMedia);
        navigationNext.addEventListener('click', navigateToNextMedia);
        
        if (item.type === 'image') {
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'image-zoom-wrapper';
            
            const img = document.createElement('img');
            img.src = `/media${item.path}`;
            img.alt = item.name;
            img.className = 'zoomable-image';
            
            imgWrapper.appendChild(img);
            mediaContainer.appendChild(imgWrapper);
            
            // Initialize zoom functionality with fullscreen support
            initializeImageZoom(img, imgWrapper, fullscreenBtn);
        } else if (item.type === 'video') {
            const video = document.createElement('video');
            video.src = `/media${item.path}`;
            video.controls = true;
            video.autoplay = false;
            mediaContainer.appendChild(video);
        }
        
        mediaViewer.classList.remove('hidden');
    };

    // Initialize image zoom functionality with fullscreen support
    function initializeImageZoom(imgElement, wrapperElement, fullscreenBtn) {
        let currentScale = 1;
        const minScale = 0.5;
        const maxScale = 5;
        const scaleStep = 0.1;
        
        // Add variables for panning and fullscreen state
        let isDragging = false;
        let startX, startY;
        let translateX = 0;
        let translateY = 0;
        let isFullscreen = false;
        
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
        
        // Handle mouse down for dragging
        imgElement.addEventListener('mousedown', (e) => {
            if (currentScale > 1) {
                isDragging = true;
                startX = e.clientX - translateX;
                startY = e.clientY - translateY;
                imgElement.style.cursor = 'grabbing';
            }
        });
        
        // Handle mouse move for dragging
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                translateX = e.clientX - startX;
                translateY = e.clientY - startY;
                updateTransform();
            }
        });
        
        // Handle mouse up to end dragging
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                imgElement.style.cursor = currentScale > 1 ? 'grab' : 'default';
            }
        });
        
        // Handle double-click to reset zoom
        imgElement.addEventListener('dblclick', (e) => {
            e.preventDefault();
            resetZoom();
            updateZoomIndicator();
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
        
        // Touch support for pinch zoom and panning
        let initialDistance = 0;
        let initialScale = 1;
        
        // Handle pinch to zoom and touch panning
        wrapperElement.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                initialDistance = getDistance(e.touches[0], e.touches[1]);
                initialScale = currentScale;
            } else if (e.touches.length === 1 && currentScale > 1) {
                isDragging = true;
                startX = e.touches[0].clientX - translateX;
                startY = e.touches[0].clientY - translateY;
            }
        }, { passive: false });
        
        wrapperElement.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const distance = getDistance(e.touches[0], e.touches[1]);
                const scaleFactor = distance / initialDistance;
                
                currentScale = Math.max(minScale, Math.min(maxScale, initialScale * scaleFactor));
                
                // Calculate midpoint of touches as reference point for zoom
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                
                updateTransform();
                updateZoomIndicator();
            } else if (e.touches.length === 1 && isDragging) {
                translateX = e.touches[0].clientX - startX;
                translateY = e.touches[0].clientY - startY;
                updateTransform();
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
        document.addEventListener('keydown', (e) => {
            if (currentScale > 1) {
                const moveStep = 50; // pixels to move per keypress
                
                switch (e.key) {
                    case 'ArrowLeft':
                        translateX += moveStep;
                        break;
                    case 'ArrowRight':
                        translateX -= moveStep;
                        break;
                    case 'ArrowUp':
                        translateY += moveStep;
                        break;
                    case 'ArrowDown':
                        translateY -= moveStep;
                        break;
                    default:
                        return; // Exit the handler for other keys
                }
                
                e.preventDefault();
                updateTransform();
            }
        });
        
        // Toggle fullscreen mode
        function toggleFullscreen() {
            const viewer = document.getElementById('media-viewer');
            
            if (!isFullscreen) {
                // Enter fullscreen
                if (viewer.requestFullscreen) {
                    viewer.requestFullscreen();
                } else if (viewer.webkitRequestFullscreen) {
                    viewer.webkitRequestFullscreen();
                } else if (viewer.msRequestFullscreen) {
                    viewer.msRequestFullscreen();
                }
                isFullscreen = true;
                
                // Update UI for fullscreen mode
                document.querySelector('.fullscreen-icon').classList.add('hidden');
                document.querySelector('.exit-fullscreen-icon').classList.remove('hidden');
                viewer.classList.add('fullscreen-mode');
                
                // Show fullscreen notification
                showFullscreenNotification('Fullscreen mode');
            } else {
                // Exit fullscreen
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
                isFullscreen = false;
                
                // Update UI back to normal mode
                document.querySelector('.fullscreen-icon').classList.remove('hidden');
                document.querySelector('.exit-fullscreen-icon').classList.add('hidden');
                viewer.classList.remove('fullscreen-mode');
                
                // Show fullscreen notification
                showFullscreenNotification('Exited fullscreen');
            }
        }
        
        // Show fullscreen notification
        function showFullscreenNotification(message) {
            let notification = document.getElementById('fullscreen-notification');
            if (!notification) {
                notification = document.createElement('div');
                notification.id = 'fullscreen-notification';
                mediaViewer.appendChild(notification);
            }
            
            notification.textContent = message;
            notification.classList.add('active');
            
            clearTimeout(notification.timeout);
            notification.timeout = setTimeout(() => {
                notification.classList.remove('active');
            }, 1500);
        }
        
        // Add fullscreen button event listener
        fullscreenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFullscreen();
        });
        
        // Also listen for fullscreen change events from the browser
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                // Browser's fullscreen was exited
                isFullscreen = false;
                document.querySelector('.fullscreen-icon').classList.remove('hidden');
                document.querySelector('.exit-fullscreen-icon').classList.add('hidden');
                document.getElementById('media-viewer').classList.remove('fullscreen-mode');
            }
        });
        
        // Add double-tap to toggle fullscreen on mobile
        let lastTap = 0;
        wrapperElement.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            
            if (tapLength < 300 && tapLength > 0 && e.touches.length === 0) {
                // Double tap detected
                e.preventDefault();
                toggleFullscreen();
            }
            
            lastTap = currentTime;
        });
        
        // Additional key handlers for fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'f') {
                // 'f' key toggles fullscreen
                toggleFullscreen();
            } else if (e.key === 'Escape' && isFullscreen) {
                // Allow ESC to exit fullscreen but not close the viewer
                if (document.fullscreenElement) {
                    e.preventDefault();
                    toggleFullscreen();
                }
            }
        });
        
        // Add keyboard shortcuts info
        const keyboardHints = document.createElement('div');
        keyboardHints.className = 'keyboard-hints';
        keyboardHints.innerHTML = `
            <div class="hint-item"><kbd>←</kbd><kbd>→</kbd> Navigate</div>
            <div class="hint-item"><kbd>F</kbd> Fullscreen</div>
            <div class="hint-item"><kbd>ESC</kbd> Close</div>
        `;
        mediaViewer.appendChild(keyboardHints);
        
        setTimeout(() => {
            keyboardHints.classList.add('fade-out');
        }, 3000);
    }

    // Modify closeViewer to reset zoom when closing
    closeViewer.addEventListener('click', () => {
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
        
        mediaViewer.classList.add('hidden');
    });

    // Helper function to format file size
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    // Helper function to format dates in a more readable way
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // If the date is today
        if (date.toDateString() === now.toDateString()) {
            return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // If the date is yesterday
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // If the date is within the last 7 days
        if (diffDays <= 7) {
            const options = { weekday: 'short', hour: '2-digit', minute: '2-digit' };
            return date.toLocaleString([], options);
        }
        
        // Otherwise, show the full date
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString([], options);
    };
    
    // Update pagination controls
    const updatePagination = () => {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    };

    // File upload handling - Updated for modal behavior
    uploadBtn.addEventListener('click', () => {
        openUploadModal();
    });

    closeUploadModal.addEventListener('click', () => {
        closeModal();
    });

    modalOverlay.addEventListener('click', () => {
        closeModal();
    });

    // Open upload modal
    const openUploadModal = () => {
        uploadModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent scrolling behind modal
    };

    // Close upload modal
    const closeModal = () => {
        uploadModal.classList.add('hidden');
        document.body.style.overflow = '';
        
        // Check if any files were successfully uploaded
        const successfulUploads = document.querySelectorAll('.file-status.success');
        const hasUploads = successfulUploads.length > 0;
        
        // Reset the form
        resetUploadForm();
        
        // If files were successfully uploaded, refresh the media library
        if (hasUploads) {
            loadMedia();
        }
    };

    cancelUploadBtn.addEventListener('click', () => {
        // Check if any uploads have completed
        const successfulUploads = document.querySelectorAll('.file-status.success');
        if (successfulUploads.length > 0) {
            // If uploads are in progress, confirm cancellation
            if (document.querySelectorAll('.file-status.pending').length > 0) {
                if (!confirm('Some files are still uploading. Are you sure you want to cancel?')) {
                    return;
                }
            }
            // Let the user know their uploads have been processed
            alert(`${successfulUploads.length} file(s) were successfully uploaded.`);
        }
        
        closeModal();
    });

    browseFilesBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle file selection
    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        handleSelectedFiles(files);
    });

    // Handle drag and drop
    dragArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dragArea.classList.add('active');
    });

    dragArea.addEventListener('dragleave', () => {
        dragArea.classList.remove('active');
    });

    dragArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dragArea.classList.remove('active');
        
        const files = Array.from(e.dataTransfer.files);
        handleSelectedFiles(files);
    });

    // Process selected files
    const handleSelectedFiles = (files) => {
        files.forEach(file => {
            // Check if file is already in the list
            if (selectedFiles.some(f => f.name === file.name && f.size === f.size)) {
                return;
            }

            // Validate file type
            const fileExt = file.name.split('.').pop().toLowerCase();
            const supportedImageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
            const supportedVideoTypes = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
            
            if (!supportedImageTypes.includes(fileExt) && !supportedVideoTypes.includes(fileExt)) {
                alert(`File type not supported: ${fileExt}`);
                return;
            }

            // Add file to list
            selectedFiles.push(file);
            
            // Create file item in UI with modified structure
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
                <div class="file-controls">
                    <div class="file-status"></div>
                    <div class="file-error-message"></div>
                    <button class="remove-file" data-name="${file.name}">&times;</button>
                </div>
                <div class="upload-progress">
                    <div class="progress-bar"></div>
                </div>
            `;
            
            fileList.appendChild(fileItem);
        });

        // Enable upload button if files are selected
        uploadSubmitBtn.disabled = selectedFiles.length === 0;
    };

    // Remove file from list
    fileList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-file')) {
            const fileName = e.target.dataset.name;
            selectedFiles = selectedFiles.filter(file => file.name !== fileName);
            e.target.closest('.file-item').remove();
            
            // Disable upload button if no files are selected
            uploadSubmitBtn.disabled = selectedFiles.length === 0;
        }
    });

    // Upload files
    uploadSubmitBtn.addEventListener('click', async () => {
        if (selectedFiles.length === 0) return;
        
        uploadSubmitBtn.disabled = true;
        // Also disable cancel button during upload to prevent issues
        cancelUploadBtn.disabled = true;
        uploadSubmitBtn.textContent = 'Uploading...';
        
        let hasErrors = false;
        
        try {
            // Disable remove buttons during upload
            document.querySelectorAll('.remove-file').forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            });
            
            // Only include files that are still pending (not already uploaded)
            const filesToUpload = selectedFiles.filter(file => {
                // Check if this file has a status element showing success
                const fileItems = fileList.querySelectorAll('.file-item');
                for (const item of fileItems) {
                    const nameElement = item.querySelector('.file-name');
                    const statusElement = item.querySelector('.file-status');
                    if (nameElement && nameElement.textContent === file.name && 
                        statusElement && statusElement.classList.contains('success')) {
                        // File was already successfully uploaded, skip it
                        return false;
                    }
                }
                return true;
            });
            
            // If there are no files to upload after filtering, we're done
            if (filesToUpload.length === 0) {
                alert('All files have already been uploaded successfully.');
                uploadSubmitBtn.textContent = 'Upload Files';
                uploadSubmitBtn.disabled = false;
                return;
            }
            
            const formData = new FormData();
            
            // Add files to the form data
            filesToUpload.forEach((file, index) => {
                formData.append('files', file);
                
                // Update UI to show pending status
                const fileItem = findFileItemByName(file.name);
                if (fileItem) {
                    const statusEl = fileItem.querySelector('.file-status');
                    statusEl.textContent = 'Pending';
                    statusEl.className = 'file-status pending';
                    
                    // Start progress bar animation
                    const progressBar = fileItem.querySelector('.progress-bar');
                    progressBar.style.width = '10%'; // Show some initial progress
                    
                    // Simulate upload progress
                    setTimeout(() => {
                        progressBar.style.width = '30%';
                    }, 300);
                    setTimeout(() => {
                        progressBar.style.width = '60%';
                    }, 800);
                }
                
                // Add metadata for this file
                if (file.lastModified) {
                    const metadata = {
                        filename: file.name,
                        lastModified: file.lastModified,
                        type: file.type
                    };
                    formData.append('metadata', JSON.stringify(metadata));
                }
            });
            
            // Send upload request
            const response = await fetch('/api/media/upload-multiple', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Process successful uploads
                if (result.files && result.files.length > 0) {
                    result.files.forEach(file => {
                        const fileItem = findFileItemByName(file.name);
                        if (fileItem) {
                            const statusEl = fileItem.querySelector('.file-status');
                            statusEl.textContent = 'Success';
                            statusEl.className = 'file-status success';
                            
                            // Show progress bar at 100%
                            const progressBar = fileItem.querySelector('.progress-bar');
                            progressBar.style.width = '100%';
                        }
                    });
                }
                
                // Handle errors
                if (result.errors && result.errors.length > 0) {
                    // ...existing error handling code...
                } else {
                    // All uploads succeeded, clear the selectedFiles array
                    selectedFiles = [];
                }
                
                // Set a timeout to close modal and refresh gallery if no errors
                if (!hasErrors) {
                    setTimeout(() => {
                        closeModal();
                        loadMedia();  // Refresh the media library
                    }, 1500);
                }
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload failed:', error);
            
            // Mark all pending uploads as failed
            document.querySelectorAll('.file-status.pending').forEach(status => {
                const fileItem = status.closest('.file-item');
                status.textContent = 'Failed';
                status.className = 'file-status error';
                
                // Add a generic error message
                if (fileItem) {
                    const errorMessageEl = fileItem.querySelector('.file-error-message');
                    errorMessageEl.textContent = error.message || 'Unknown error occurred';
                    fileItem.classList.add('has-error');
                }
            });
            
            // Show error message
            alert(`Upload failed: ${error.message}`);
            hasErrors = true;
        } finally {
            uploadSubmitBtn.disabled = false;
            uploadSubmitBtn.textContent = hasErrors ? 'Retry Failed Uploads' : 'Upload Complete';
            
            // Re-enable remove buttons
            document.querySelectorAll('.remove-file').forEach(btn => {
                btn.disabled = false;
                btn.style.opacity = '1';
            });
            
            // Enable cancel button
            cancelUploadBtn.disabled = false;
            // Change cancel button to "Close" after upload completes
            cancelUploadBtn.textContent = 'Close';
        }
    });

    // Helper function to find a file item by name
    function findFileItemByName(fileName) {
        const fileItems = fileList.querySelectorAll('.file-item');
        for (const item of fileItems) {
            const nameElement = item.querySelector('.file-name');
            // Match by original name or name with timestamp
            const itemName = nameElement ? nameElement.textContent : '';
            const normalizedFileName = fileName.includes('_') ? 
                fileName.substring(fileName.indexOf('_') + 1) : fileName;
                
            if (itemName === fileName || itemName === normalizedFileName) {
                return item;
            }
        }
        return null;
    }

    // Reset upload form
    const resetUploadForm = () => {
        fileInput.value = '';
        selectedFiles = [];
        fileList.innerHTML = '';
        uploadSubmitBtn.disabled = true;
        uploadSubmitBtn.textContent = 'Upload Files';
        cancelUploadBtn.textContent = 'Cancel';
        cancelUploadBtn.disabled = false;
    };
    
    // Close modal with ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!uploadModal.classList.contains('hidden')) {
                closeModal();
            } else if (!mediaViewer.classList.contains('hidden')) {
                closeViewer.click();
            }
        }
    });
    
    // Event Listeners for existing functionality
    allMediaBtn.addEventListener('click', () => {
        currentFilter = null;
        currentPage = 1;
        allMediaBtn.classList.add('active');
        imagesBtn.classList.remove('active');
        videosBtn.classList.remove('active');
        loadMedia();
    });
    
    imagesBtn.addEventListener('click', () => {
        currentFilter = 'image';
        currentPage = 1;
        allMediaBtn.classList.remove('active');
        imagesBtn.classList.add('active');
        videosBtn.classList.remove('active');
        loadMedia();
    });
    
    videosBtn.addEventListener('click', () => {
        currentFilter = 'video';
        currentPage = 1;
        allMediaBtn.classList.remove('active');
        imagesBtn.classList.remove('active');
        videosBtn.classList.add('active');
        loadMedia();
    });
    
    refreshBtn.addEventListener('click', async () => {
        try {
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Refreshing...';
            
            await fetch('/api/media/rescan', { method: 'POST' });
            
            loadMedia();
        } catch (error) {
            console.error('Failed to refresh media library:', error);
            alert('Failed to refresh media library. Please try again.');
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh Library';
        }
    });
    
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadMedia();
        }
    });
    
    nextPageBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadMedia();
        }
    });
    
    closeViewer.addEventListener('click', () => {
        mediaViewer.classList.add('hidden');
        
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
    });
    
    // Close viewer with ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !mediaViewer.classList.contains('hidden')) {
            closeViewer.click();
        }
    });
    
    // Add this new function for deleting media items
    const deleteMedia = async (item) => {
        // Ask for confirmation before deleting
        if (!confirm(`Are you sure you want to delete ${item.name}?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/media/${item.id}`, {
                method: 'DELETE',
            });
            
            if (response.ok) {
                // Remove the item from the DOM
                const mediaItem = document.querySelector(`.media-item[data-id="${item.id}"]`);
                if (mediaItem) {
                    mediaItem.remove();
                }
                
                // If the current page is now empty and there are other pages, reload the current page
                if (gallery.children.length === 0 && totalPages > 1) {
                    loadMedia();
                }
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete media');
            }
        } catch (error) {
            console.error('Delete failed:', error);
            alert(`Failed to delete media: ${error.message}`);
        }
    };

    // Function to enter selection mode
    function enterSelectionMode() {
        isSelectionMode = true;
        selectedMediaItems.clear();
        selectionToolbar.classList.remove('hidden');
        document.body.classList.add('selection-mode');
        
        // Disable scrolling in background on mobile to prevent accidental scrolling
        if (isMobileDevice()) {
            document.body.style.overflow = 'hidden';
        }
        
        updateSelectionCount();
    }
    
    // Function to exit selection mode
    function exitSelectionMode() {
        isSelectionMode = false;
        selectedMediaItems.clear();
        selectionToolbar.classList.add('hidden');
        document.body.classList.remove('selection-mode');
        
        // Restore scrolling
        document.body.style.overflow = '';
        
        // Remove selected class from all items
        document.querySelectorAll('.media-item').forEach(item => {
            item.classList.remove('selected');
        });
    }
    
    // Toggle selection state of an item
    function toggleItemSelection(element, id) {
        if (selectedMediaItems.has(id)) {
            selectedMediaItems.delete(id);
            element.classList.remove('selected');
        } else {
            selectedMediaItems.add(id);
            element.classList.add('selected');
        }
        updateSelectionCount();
    }
    
    // Update selection count in toolbar
    function updateSelectionCount() {
        const count = selectedMediaItems.size;
        document.querySelector('.selection-count').textContent = `${count} item${count !== 1 ? 's' : ''} selected`;
        
        // Show/hide delete button based on selection
        document.getElementById('delete-selected').disabled = count === 0;
    }
    
    // Delete selected media files
    async function deleteSelectedMedia() {
        if (selectedMediaItems.size === 0) return;
        
        if (!confirm(`Are you sure you want to delete ${selectedMediaItems.size} selected item${selectedMediaItems.size !== 1 ? 's' : ''}?`)) {
            return;
        }
        
        let successCount = 0;
        let errorCount = 0;
        
        // Process deletions
        for (const id of selectedMediaItems) {
            try {
                const response = await fetch(`/api/media/${id}`, { method: 'DELETE' });
                
                if (response.ok) {
                    // Find and remove the item from the DOM
                    const mediaItem = document.querySelector(`.media-item[data-id="${id}"]`);
                    if (mediaItem) {
                        mediaItem.remove();
                    }
                    successCount++;
                } else {
                    errorCount++;
                    console.error(`Failed to delete item ID: ${id}`);
                }
            } catch (error) {
                errorCount++;
                console.error(`Error deleting item ID: ${id}`, error);
            }
        }
        
        // Show results and exit selection mode
        if (successCount > 0) {
            alert(`Successfully deleted ${successCount} item${successCount !== 1 ? 's' : ''}.${errorCount > 0 ? ` Failed to delete ${errorCount} item${errorCount !== 1 ? 's' : ''}.` : ''}`);
        } else if (errorCount > 0) {
            alert(`Failed to delete ${errorCount} item${errorCount !== 1 ? 's' : ''}.`);
        }
        
        // If current page is empty and there are other pages, reload
        if (document.querySelectorAll('.media-item').length === 0 && totalPages > 1) {
            loadMedia();
        }
        
        exitSelectionMode();
    }

    // Add additional event listener for ESC key to exit selection mode
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isSelectionMode) {
                exitSelectionMode();
            } else if (!uploadModal.classList.contains('hidden')) {
                closeModal();
            } else if (!mediaViewer.classList.contains('hidden')) {
                closeViewer.click();
            }
        }
    });

    // Helper function to detect if the device is mobile
    function isMobileDevice() {
        return (window.innerWidth <= 768) || 
               ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0) || 
               (navigator.msMaxTouchPoints > 0);
    }

    // Function to navigate to the previous media item
    function navigateToPrevMedia(e) {
        if (e) e.stopPropagation();
        
        const items = mediaViewer.mediaItems;
        if (!items || items.length === 0) {
            console.log("No media items available for navigation");
            return;
        }
        