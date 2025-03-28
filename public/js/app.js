// Import SVG loader utility
import { insertSvg } from './utils/svg-loader.js';
import { formatDateHeader, isMobileDevice } from './utils/helpers.js';
// Import viewer module
import * as viewerModule from './modules/viewer.js';
// Import item renderer module
import { createMediaItem, updateItemSelection } from './modules/item-renderer.js';
import { loadAndFillTemplate } from './utils/template-loader.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const gallery = document.getElementById('gallery');
    const allMediaBtn = document.getElementById('all-media-btn');
    const imagesBtn = document.getElementById('images-btn');
    const videosBtn = document.getElementById('videos-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    const mediaViewer = document.getElementById('media-viewer');
    
    // State
    let currentFilter = null;
    let currentPage = 1;
    let totalPages = 1;
    const pageSize = 24;
    
    // Initialize the viewer module
    viewerModule.init();
    
    // Import upload module
    import('./modules/upload.js').then(module => {
        // Initialize upload module with callback to refresh gallery
        const uploadModule = module.init(loadMedia);
        
        // Set up click handler for upload button
        uploadBtn.addEventListener('click', uploadModule.openUploadModal);
    });
    
    // Add selection mode state variables
    let isSelectionMode = false;
    let selectedMediaItems = new Set();
    let selectionToolbar;
    let selectionCount;
    let deleteSelectedBtn;
    
    // Load the selection toolbar from template
    loadAndFillTemplate('/public/templates/selection-toolbar.html').then(toolbarFragment => {
        selectionToolbar = toolbarFragment.querySelector('.selection-toolbar');
        document.getElementById('app').appendChild(selectionToolbar);
        
        // Get references to toolbar elements
        selectionCount = selectionToolbar.querySelector('.selection-count');
        deleteSelectedBtn = selectionToolbar.querySelector('#delete-selected');
        const cancelSelectionBtn = selectionToolbar.querySelector('#cancel-selection');
        
        // Load SVG for delete button in toolbar
        insertSvg('/public/img/icons/trash.svg', selectionToolbar.querySelector('.icon-container'));
        
        // Selection toolbar event listeners
        deleteSelectedBtn.addEventListener('click', deleteSelectedMedia);
        cancelSelectionBtn.addEventListener('click', exitSelectionMode);
    });
    
    // Load media
    const loadMedia = async () => {
        gallery.textContent = ''; // Clear gallery
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.textContent = 'Loading media library...';
        gallery.appendChild(loadingDiv);
        
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
            
            // Store the date groups and media map as window properties for cross-date navigation
            window.dateGroups = Object.keys(mediaByDate).sort().reverse();
            window.mediaByDateMap = mediaByDate;
            
            // Create date section headers and items for each date
            window.dateGroups.forEach(dateKey => {
                const items = mediaByDate[dateKey];
                const date = new Date(dateKey);
                
                // Create a header for this date group
                const dateHeader = document.createElement('div');
                dateHeader.className = 'date-header';
                dateHeader.dataset.dateKey = dateKey;
                
                const dateHeading = document.createElement('h2');
                dateHeading.textContent = formatDateHeader(date);
                dateHeader.appendChild(dateHeading);
                
                gallery.appendChild(dateHeader);
                
                // Create a container for this date's media items
                const dateGroup = document.createElement('div');
                dateGroup.className = 'date-group';
                dateGroup.dataset.dateKey = dateKey;
                
                // Add all media items for this date
                items.forEach(item => {
                    // Use the item renderer module to create media items with proper callbacks
                    const mediaItem = createMediaItem(item, {
                        onItemClick: handleItemClick,
                        onDeleteClick: deleteMedia,
                        onSelectClick: toggleItemSelection,
                        enterSelectionMode,
                        toggleItemSelection,
                        // Pass isSelectionMode as a function that returns the current state
                        isSelectionMode: () => isSelectionMode
                    });
                    dateGroup.appendChild(mediaItem);
                });
                
                gallery.appendChild(dateGroup);
            });
        } catch (error) {
            console.error('Failed to load media:', error);
            gallery.textContent = ''; // Clear gallery
            const errorDiv = document.createElement('div');
            errorDiv.className = 'loading';
            errorDiv.textContent = 'Failed to load media. Please try again.';
            gallery.appendChild(errorDiv);
        }
    };

    // Handle click on a media item
    function handleItemClick(item, mediaItemElement) {
        // Get the current date group for this item
        const dateGroup = mediaItemElement.closest('.date-group');
        const dateKey = dateGroup.dataset.dateKey;
        
        // Create navigation context with date information
        const navigationContext = {
            currentDateKey: dateKey,
            dateGroups: window.dateGroups
        };
        
        // Pass all media items of the current date and navigation context
        viewerModule.openMediaViewer(item, window.mediaByDateMap[dateKey], navigationContext);

        // If path lookup failed, try base64 encoding
        try {
            if (item.type === 'image') {
                const img = document.createElement('img');
                img.src = fixMediaPath(item.path); // Fix the path here
                img.alt = item.name;
                img.className = 'zoomable-image';
            
                imgWrapper.appendChild(img);
            } else if (item.type === 'video') {
                const video = document.createElement('video');
                video.src = fixMediaPath(item.path); // Fix the path here 
                video.controls = true;
                video.autoplay = false;
            }
        } catch (b64Err) {
            console.error(`Base64 lookup failed for ${item.path}: ${b64Err.message}`);
        }
    }

    // Update pagination controls
    const updatePagination = () => {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    };

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
    
    // Close viewer with ESC key and handle other keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isSelectionMode) {
                exitSelectionMode();
            } else if (document.getElementById('upload-modal') && 
                      !document.getElementById('upload-modal').classList.contains('hidden')) {
                // The close handler will be triggered via event bubbling
            } else if (!mediaViewer.classList.contains('hidden')) {
                viewerModule.closeViewerFunction();
            }
        }
    });

    // Function for deleting media items
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
        if (selectionToolbar) {
            selectionToolbar.classList.remove('hidden');
        }
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
        if (selectionToolbar) {
            selectionToolbar.classList.add('hidden');
        }
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
        console.log(`Toggling selection for item ${id}, current selection mode: ${isSelectionMode}`);
        
        const isSelected = selectedMediaItems.has(id);
        
        if (isSelected) {
            selectedMediaItems.delete(id);
        } else {
            selectedMediaItems.add(id);
        }
        
        // Update the UI to reflect the new selection state
        updateItemSelection(element, id, !isSelected);
        updateSelectionCount();
        
        console.log(`After toggle: ${selectedMediaItems.size} items selected`);
    }
    
    // Update selection count in toolbar
    function updateSelectionCount() {
        const count = selectedMediaItems.size;
        if (selectionCount) {
            selectionCount.textContent = `${count} item${count !== 1 ? 's' : ''} selected`;
        }
        
        // Show/hide delete button based on selection
        if (deleteSelectedBtn) {
            deleteSelectedBtn.disabled = count === 0;
        }
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

    /**
     * Helper function to fix media paths in the view
     * @param {string} path - The original path from the API 
     * @returns {string} - The fixed path for proper display
     */
    function fixMediaPath(path) {
        // If path doesn't start with /media, add it to ensure compatibility
        if (!path.startsWith('/media')) {
            return `/media${path}`;
        }
        return path;
    }

    // Initial load
    loadMedia();
});
