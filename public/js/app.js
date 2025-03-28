import { insertSvg } from './utils/svg-loader.js';
import * as viewerModule from './modules/viewer.js';
import { createMediaItem, processMediaItem, renderMediaByDate } from './modules/item-renderer.js';
import { loadAndFillTemplate } from './utils/template-loader.js';
import { updateItemSelection } from './modules/item-renderer.js';
import * as uploadModule from './modules/upload.js';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM references
    const gallery = document.getElementById('gallery');
    const allMediaBtn = document.getElementById('all-media-btn');
    const imagesBtn = document.getElementById('images-btn');
    const videosBtn = document.getElementById('videos-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    
    // State
    let currentPage = 1;
    let pageSize = 100; // Increased from 50 to 100
    let totalPages = 1;
    let currentFilter = '';
    let isSelectionMode = false;
    let selectedItems = new Set();

    // Define loadMedia function first, before it's used anywhere else
    const loadMedia = async () => {
        gallery.textContent = ''; // Clear gallery
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.textContent = 'Loading media library...';
        gallery.appendChild(loadingDiv);
        
        try {
            // Use the consolidated API endpoint with proper pagination and filtering
            let url = `/api/media?page=${currentPage}&limit=${pageSize}`;
            if (currentFilter) {
                url += `&type=${currentFilter}`;
            }
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.data || data.data.length === 0) {
                gallery.innerHTML = '<div class="loading">No media files found</div>';
                return;
            }
            
            // Update pagination from API response
            currentPage = data.page;
            totalPages = data.totalPages;
            updatePagination();
            
            // Sort the media items by creation date (newest first)
            data.data.sort((a, b) => {
                const dateA = new Date(a.created || a.modified);
                const dateB = new Date(b.created || b.modified);
                return dateB - dateA;
            });
            
            // Collect IDs for batch information lookup
            const mediaIds = data.data.map(item => item.id).join(',');
            
            // Fetch detailed file information and thumbnails in parallel
            let fileInfos = {};
            let thumbnailInfo = {};
            if (mediaIds) {
                try {
                    console.log('Fetching file info and thumbnails for IDs:', mediaIds);
                    
                    // Parallel fetching for both file info and thumbnail info
                    const [fileInfoResponse, thumbnailResponse] = await Promise.all([
                        fetch(`/api/file-info?ids=${mediaIds}`),
                        fetch(`/api/thumbnails/info?ids=${mediaIds}`)
                    ]);
                    
                    if (fileInfoResponse.ok) {
                        const fileData = await fileInfoResponse.json();
                        fileInfos = fileData.files || {};
                        console.log('File info received:', Object.keys(fileInfos).length);
                    }
                    
                    if (thumbnailResponse.ok) {
                        const thumbData = await thumbnailResponse.json();
                        thumbnailInfo = thumbData.thumbnails || {};
                    }
                } catch (err) {
                    console.warn('Error fetching additional information:', err);
                }
            }
            
            // Group media by date
            const mediaByDate = {};
            
            // Process media items and group by date
            data.data.forEach(item => {
                // Process media item paths and metadata
                const processedItem = processMediaItem(item);
                
                // Add thumbnail ID from batch lookup if not already present
                if (!processedItem.thumbnailId && thumbnailInfo[processedItem.id]) {
                    processedItem.thumbnailId = thumbnailInfo[processedItem.id];
                }
                
                // Get the detailed file info for this item
                const fileInfo = fileInfos[processedItem.id] || null;
                
                // Get date in YYYY-MM-DD format for grouping
                const itemDate = new Date(processedItem.created || processedItem.modified);
                const dateKey = itemDate.toISOString().split('T')[0];
                
                if (!mediaByDate[dateKey]) {
                    mediaByDate[dateKey] = [];
                }
                
                // Add file info to the processed item for better metadata display
                processedItem.fileInfo = fileInfo;
                
                mediaByDate[dateKey].push(processedItem);
            });
            
            // Render media items grouped by date
            renderMediaByDate(mediaByDate, gallery, {
                onItemClick: handleItemClick,
                onDeleteClick: deleteMedia,
                onSelectClick: toggleItemSelection,
                enterSelectionMode: enterSelectionMode,
                isSelectionMode: () => isSelectionMode,
                fileInfos: fileInfos // Pass file info to renderer
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
    
    // Initialize modules - after loadMedia is defined
    viewerModule.init();
    const uploadController = uploadModule.init(loadMedia);
    
    // Insert SVGs for navigation
    insertSvg('/public/img/icons/all-media-icon.svg', document.querySelector('.all-media-icon'));
    insertSvg('/public/img/icons/image-icon.svg', document.querySelector('.images-icon'));
    insertSvg('/public/img/icons/video-icon.svg', document.querySelector('.videos-icon'));
    insertSvg('/public/img/icons/upload-icon.svg', document.querySelector('.upload-icon'));
    
    // Add selection toolbar from template
    const selectionToolbar = await loadAndFillTemplate('/public/templates/selection-toolbar.html');
    document.body.appendChild(selectionToolbar);
    
    // Get references to selection toolbar elements
    const selectionToolbarElement = document.querySelector('.selection-toolbar');
    const selectionCount = document.querySelector('.selection-count');
    const deleteSelectedBtn = document.getElementById('delete-selected');
    const cancelSelectionBtn = document.getElementById('cancel-selection');
    
    // Setup event listeners for selection toolbar
    deleteSelectedBtn.addEventListener('click', handleDeleteSelected);
    cancelSelectionBtn.addEventListener('click', exitSelectionMode);
    
    // Insert trash icon in delete button
    const deleteIconContainer = deleteSelectedBtn.querySelector('.icon-container');
    insertSvg('/public/img/icons/trash.svg', deleteIconContainer);
    
    // Filter buttons click handlers
    allMediaBtn.addEventListener('click', () => handleFilterChange(''));
    imagesBtn.addEventListener('click', () => handleFilterChange('image'));
    videosBtn.addEventListener('click', () => handleFilterChange('video'));
    
    // Upload button click handler
    uploadBtn.addEventListener('click', () => {
        uploadController.openUploadModal();
    });
    
    // Pagination button click handlers
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
    
    // Handle filter change
    function handleFilterChange(filter) {
        // Skip if this filter is already active
        if (currentFilter === filter) return;
        
        // Remove active class from all filter buttons
        allMediaBtn.classList.remove('active');
        imagesBtn.classList.remove('active');
        videosBtn.classList.remove('active');
        
        // Add active class to selected filter button
        if (filter === '') {
            allMediaBtn.classList.add('active');
        } else if (filter === 'image') {
            imagesBtn.classList.add('active');
        } else if (filter === 'video') {
            videosBtn.classList.add('active');
        }
        
        // Update current filter and reset pagination
        currentFilter = filter;
        currentPage = 1;
        
        // Load media with the new filter
        loadMedia();
    }
    
    // Update pagination UI
    function updatePagination() {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    }
    
    // Handler for media item click
    function handleItemClick(item, element) {
        // Get all media items in the same date group
        const dateGroup = element.closest('.date-group');
        const mediaItems = Array.from(dateGroup.querySelectorAll('.media-item'))
            .map(el => {
                try {
                    return JSON.parse(el.dataset.itemData);
                } catch (err) {
                    console.error('Error parsing media item data:', err);
                    return null;
                }
            })
            .filter(item => item !== null);
        
        // Open viewer with this item and items from the same date
        viewerModule.openMediaViewer(item, mediaItems);
    }
    
    // Handler for deleting a media item
    async function deleteMedia(item) {
        if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
            try {
                const response = await fetch(`/api/media/${item.id}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    // Remove the item from the DOM and trigger a refresh
                    const mediaItem = document.querySelector(`.media-item[data-id="${item.id}"]`);
                    if (mediaItem) {
                        mediaItem.remove();
                        
                        // Check if the date group is empty and remove if it is
                        const dateGroup = document.querySelectorAll('.date-group');
                        dateGroup.forEach(group => {
                            if (group.childElementCount === 0) {
                                const dateKey = group.dataset.dateKey;
                                const header = document.querySelector(`.date-header[data-date-key="${dateKey}"]`);
                                if (header) header.remove();
                                group.remove();
                            }
                        });
                    }
                } else {
                    throw new Error('Failed to delete media');
                }
            } catch (err) {
                console.error('Error deleting media:', err);
                alert('Failed to delete media. Please try again.');
            }
        }
    }
    
    // Enter selection mode
    function enterSelectionMode() {
        isSelectionMode = true;
        document.body.classList.add('selection-mode');
        selectionToolbarElement.classList.remove('hidden');
        updateSelectionCount();
    }
    
    // Exit selection mode
    function exitSelectionMode() {
        isSelectionMode = false;
        document.body.classList.remove('selection-mode');
        selectionToolbarElement.classList.add('hidden');
        
        // Clear all selected items
        selectedItems.clear();
        
        // Remove selected class from all items
        document.querySelectorAll('.media-item').forEach(item => {
            item.classList.remove('selected');
            
            // Reset checkbox icon
            const checkboxIcon = item.querySelector('.select-mode-btn span');
            checkboxIcon.innerHTML = '';
            insertSvg('/public/img/icons/checkbox-empty.svg', checkboxIcon);
        });
    }
    
    // Toggle item selection
    function toggleItemSelection(element, id) {
        if (selectedItems.has(id)) {
            selectedItems.delete(id);
            updateItemSelection(element, id, false);
        } else {
            selectedItems.add(id);
            updateItemSelection(element, id, true);
        }
        
        updateSelectionCount();
    }
    
    // Update selection count
    function updateSelectionCount() {
        const count = selectedItems.size;
        selectionCount.textContent = `${count} item${count !== 1 ? 's' : ''} selected`;
        deleteSelectedBtn.disabled = count === 0;
    }
    
    // Handle delete selected items
    async function handleDeleteSelected() {
        if (selectedItems.size === 0) return;
        
        const confirmMessage = selectedItems.size === 1 
            ? 'Are you sure you want to delete the selected item?' 
            : `Are you sure you want to delete ${selectedItems.size} selected items?`;
            
        if (confirm(confirmMessage)) {
            try {
                // Delete each selected item
                const deletePromises = Array.from(selectedItems).map(async id => {
                    try {
                        const response = await fetch(`/api/media/${id}`, {
                            method: 'DELETE'
                        });
                        return response.ok;
                    } catch (err) {
                        console.error(`Error deleting item ${id}:`, err);
                        return false;
                    }
                });
                
                // Wait for all deletions to complete
                const results = await Promise.all(deletePromises);
                
                // Count successful deletions
                const successCount = results.filter(result => result).length;
                
                if (successCount > 0) {
                    alert(`Successfully deleted ${successCount} item${successCount !== 1 ? 's' : ''}.`);
                    
                    // Reload media to refresh the gallery
                    exitSelectionMode();
                    loadMedia();
                } else {
                    alert('Failed to delete selected items.');
                }
            } catch (err) {
                console.error('Error during batch delete:', err);
                alert('Failed to delete selected items.');
            }
        }
    }
    
    // Initial load
    loadMedia();
});
