import { formatFileSize, formatDate, getMediaResolution, formatDateHeader as formatHeaderDate } from '../utils/helpers.js';
import { insertSvg } from '../utils/svg-loader.js';

/**
 * Media item renderer module
 * Handles creation and management of media item elements in the gallery
 */

// Constants for configuration
const LONG_PRESS_DURATION = 500; // ms

// ======================== PATH HANDLING ========================

/**
 * Process a loaded media item to ensure proper paths and metadata
 * @param {Object} item - The media item to process
 * @returns {Object} - The processed item
 */
export function processMediaItem(item) {
    // Clone the item to avoid mutating the original
    const processedItem = { ...item };
    
    // Ensure paths are properly set
    processedItem.path = processedItem.path || `/${processedItem.id}`;
    
    // Ensure path starts with /
    if (!processedItem.path.startsWith('/')) {
        processedItem.path = `/${processedItem.path}`;
    }
    
    // Process thumbnail paths using the thumbnails API
    if (processedItem.thumbnailId || (processedItem.metadata && processedItem.metadata.thumbnailId)) {
        processedItem.thumbnailPath = `/api/thumbnails/${processedItem.id}`;
    }
    
    return processedItem;
}

// ======================== THUMBNAIL HANDLING ========================

/**
 * Set the appropriate thumbnail for an image item
 * @param {HTMLImageElement} thumbnail - The thumbnail element
 * @param {Object} item - The media item
 * @param {Object} fileInfo - Optional additional file information
 */
function setImageThumbnail(thumbnail, item, fileInfo) {
    // Use thumbnail API if thumbnailId exists or if we previously set thumbnailPath
    if (item.id) {
        thumbnail.src = `/api/thumbnails/${item.id}`;
        
        // Store fileInfo for potential later use
        if (fileInfo) {
            thumbnail.dataset.fileInfo = JSON.stringify(fileInfo);
        }
    } else {
        // Use placeholder instead of loading full image for better performance
        thumbnail.src = '/public/img/image-placeholder.svg';
    }
    
    // Store original source path for viewer mode, but don't load it
    thumbnail.dataset.originalSrc = `/media${item.path}`;
    
    // Set lazy loading for performance
    thumbnail.loading = "lazy";
    
    // Add error handler - use placeholder instead of loading full image
    thumbnail.onerror = function() {
        this.onerror = null; // Prevent infinite error loop
        this.src = '/public/img/image-placeholder.svg';
    };
}

/**
 * Set the appropriate thumbnail for a video item
 * @param {HTMLImageElement} thumbnail - The thumbnail element
 * @param {Object} item - The media item
 * @param {Object} fileInfo - Optional additional file information
 */
function setVideoThumbnail(thumbnail, item, fileInfo) {
    // Use thumbnail API if thumbnailId exists or if we previously set thumbnailPath
    if ((item.thumbnailId || (item.metadata && item.metadata.thumbnailId)) || item.thumbnailPath) {
        thumbnail.src = `/api/thumbnails/${item.id}`;
        
        // Store fileInfo for potential later use
        if (fileInfo) {
            thumbnail.dataset.fileInfo = JSON.stringify(fileInfo);
        }
    } else {
        // Use placeholder for videos with no thumbnails
        thumbnail.src = '/public/img/video-placeholder.svg';
    }
    
    // Store original source path for viewer mode, but don't load it
    thumbnail.dataset.originalSrc = `/media${item.path}`;
    
    // Set lazy loading for performance
    thumbnail.loading = "lazy";
    
    // Add error handler
    thumbnail.onerror = function() {
        this.onerror = null; // Prevent infinite error loop
        this.src = '/public/img/video-placeholder.svg';
    };
}

// ======================== UI ELEMENT CREATION ========================

/**
 * Create a thumbnail container element
 * @param {Object} item - Media item data
 * @param {Object} fileInfo - Optional additional file information
 * @returns {HTMLElement} - The thumbnail container element
 */
function createThumbnailContainer(item, fileInfo = null) {
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'thumbnail-container';
    
    // Create the thumbnail image element
    const thumbnail = document.createElement('img');
    thumbnail.className = 'media-thumbnail';
    thumbnail.alt = item.name;
    
    // Set the appropriate thumbnail based on media type
    if (item.type === 'image') {
        setImageThumbnail(thumbnail, item, fileInfo);
    } else if (item.type === 'video') {
        setVideoThumbnail(thumbnail, item, fileInfo);
    }
    
    thumbnailContainer.appendChild(thumbnail);
    
    // Add resolution indicator only if available from original file
    const dimensionsOverlay = createResolutionOverlay(item, thumbnail, fileInfo);
    if (dimensionsOverlay) {
        thumbnailContainer.appendChild(dimensionsOverlay);
    }
    
    return thumbnailContainer;
}

/**
 * Create resolution overlay for media items
 * @param {Object} item - The media item
 * @param {HTMLImageElement} thumbnail - The thumbnail element
 * @param {Object} fileInfo - Optional additional file information
 * @returns {HTMLElement} - The resolution overlay element
 */
function createResolutionOverlay(item, thumbnail, fileInfo = null) {
    const dimensionsOverlay = document.createElement('div');
    dimensionsOverlay.className = 'media-dimensions-overlay';
    
    const dimensions = document.createElement('span');
    dimensions.className = 'media-dimensions';
    
    // Set resolution from fileInfo if available, prioritizing stored dimensions
    let resolution = null;
    
    if (fileInfo && fileInfo.metadata) {
        const fileMetadata = fileInfo.metadata;
        
        // First check directly stored dimensions in file metadata
        if (fileMetadata.width && fileMetadata.height) {
            resolution = `${fileMetadata.width} × ${fileMetadata.height}`;
        }
        // Check for resolution string that might be stored directly
        else if (fileMetadata.resolution) {
            // Convert format from WxH to W × H for display
            resolution = fileMetadata.resolution.replace('x', ' × ');
        }
        // Next check for original dimensions stored in metadata
        else if (fileMetadata.originalWidth && fileMetadata.originalHeight) {
            resolution = `${fileMetadata.originalWidth} × ${fileMetadata.originalHeight}`;
        }
        // Finally check EXIF data
        else if (fileMetadata.exif) {
            const exif = fileMetadata.exif;
            if (exif.imageWidth && exif.imageHeight) {
                resolution = `${exif.imageWidth} × ${exif.imageHeight}`;
            } else if (exif.PixelXDimension && exif.PixelYDimension) {
                resolution = `${exif.PixelXDimension} × ${exif.PixelYDimension}`;
            }
        }
    }
    
    // Only fall back to item metadata if we couldn't get resolution from file info
    if (!resolution && item.metadata) {
        // Check metadata fields but not thumbnail dimensions
        if (item.metadata.width && item.metadata.height) {
            resolution = `${item.metadata.width} × ${item.metadata.height}`;
        } else if (item.metadata.resolution) {
            resolution = item.metadata.resolution.replace('x', ' × ');
        }
    }
    
    // Only display resolution if we have accurate information from the original file
    if (resolution) {
        dimensions.textContent = resolution;
    } else {
        // Don't show resolution at all if we can't get accurate data
        // from original file metadata - remove the overlay entirely
        return null;
    }
    
    dimensionsOverlay.appendChild(dimensions);
    return dimensionsOverlay;
}

/**
 * Create the metadata section for a media item
 * @param {Object} item - Media item data
 * @param {Object} fileInfo - Optional additional file information 
 * @returns {HTMLElement} - The metadata element
 */
function createMetadataSection(item, fileInfo = null) {
    const mediaMetadata = document.createElement('div');
    mediaMetadata.className = 'media-metadata';
    
    // Format data for display
    const fileSize = fileInfo && fileInfo.size ? 
        formatFileSize(fileInfo.size) : 
        formatFileSize(item.size);
    
    const dateCreated = fileInfo && fileInfo.uploadDate ? 
        formatDate(fileInfo.uploadDate) : 
        formatDate(item.created || item.modified);
    
    // Get file extension for the badge instead of generic type
    const fileExtension = item.name.split('.').pop().toUpperCase();
    
    // Add extension badge with appropriate type class
    const typeBadge = document.createElement('span');
    typeBadge.className = `media-type-badge media-type-${item.type}`;
    typeBadge.textContent = fileExtension;
    mediaMetadata.appendChild(typeBadge);
    
    // Add file size
    const sizeSpan = document.createElement('span');
    sizeSpan.textContent = fileSize;
    mediaMetadata.appendChild(sizeSpan);
    
    // Add date
    const dateSpan = document.createElement('span');
    dateSpan.className = 'media-date';
    dateSpan.textContent = dateCreated;
    mediaMetadata.appendChild(dateSpan);
    
    return mediaMetadata;
}

/**
 * Create the info and actions section for a media item
 * @param {Object} item - Media item data
 * @param {Function} onDeleteClick - Callback for delete button click
 * @param {Object} fileInfo - Optional additional file information
 * @returns {Object} - The info element and trash icon
 */
function createInfoSection(item, onDeleteClick, fileInfo = null) {
    const mediaInfo = document.createElement('div');
    mediaInfo.className = 'media-info';
    
    // Create actions row
    const actionsRow = document.createElement('div');
    actionsRow.className = 'media-actions-row';
    
    // Add metadata section
    const mediaMetadata = createMetadataSection(item, fileInfo);
    actionsRow.appendChild(mediaMetadata);
    
    // Create delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-media-btn';
    deleteBtn.dataset.id = item.id;
    deleteBtn.title = 'Delete';
    
    const trashIcon = document.createElement('span');
    trashIcon.className = 'trash-icon';
    deleteBtn.appendChild(trashIcon);
    
    // Add delete button click handler
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDeleteClick(item);
    });
    
    actionsRow.appendChild(deleteBtn);
    mediaInfo.appendChild(actionsRow);
    
    return { mediaInfo, trashIcon };
}

// ======================== SELECTION HANDLING ========================

/**
 * Add selection functionality to a media item
 * @param {HTMLElement} mediaItem - The media item element
 * @param {Object} item - Media item data
 * @param {Object} options - Selection behavior options
 * @returns {Object} - Selection button elements
 */
function addSelectionBehavior(mediaItem, item, options) {
    const {
        onItemClick,
        onSelectClick,
        enterSelectionMode,
        isSelectionMode
    } = options;
    
    // Create select button
    const selectModeBtn = document.createElement('button');
    selectModeBtn.className = 'select-mode-btn';
    selectModeBtn.title = 'Select';
    
    const checkboxIcon = document.createElement('span');
    checkboxIcon.className = 'checkbox-empty-icon';
    selectModeBtn.appendChild(checkboxIcon);
    
    // Insert checkbox SVG
    insertSvg('/public/img/icons/checkbox-empty.svg', checkboxIcon);
    
    // Select button handler
    selectModeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Get current selection mode state
        const getSelectionMode = typeof isSelectionMode === 'function' 
            ? isSelectionMode 
            : () => isSelectionMode;
            
        if (!getSelectionMode()) {
            enterSelectionMode();
        }
        
        onSelectClick(mediaItem, item.id);
    });
    
    // Item click handler
    mediaItem.addEventListener('click', (e) => {
        // Get current selection mode state
        const getSelectionMode = typeof isSelectionMode === 'function' 
            ? isSelectionMode 
            : () => isSelectionMode;
            
        if (getSelectionMode()) {
            e.preventDefault();
            onSelectClick(mediaItem, item.id);
        } else {
            onItemClick(item, mediaItem);
        }
    });
    
    // Add long press for desktop
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) {
        addLongPressSelection(mediaItem, item, options);
    }
    
    // Handle double-click for selection
    mediaItem.addEventListener('dblclick', (e) => {
        e.preventDefault();
        
        const getSelectionMode = typeof isSelectionMode === 'function' 
            ? isSelectionMode 
            : () => isSelectionMode;
            
        if (!getSelectionMode()) {
            enterSelectionMode();
            onSelectClick(mediaItem, item.id);
        }
    });
    
    // Add select button to the item
    mediaItem.appendChild(selectModeBtn);
    
    return { selectModeBtn, checkboxIcon };
}

/**
 * Add long press selection behavior to a media item
 * @param {HTMLElement} mediaItem - The media item element
 * @param {Object} item - Media item data
 * @param {Object} options - Selection behavior options
 */
function addLongPressSelection(mediaItem, item, options) {
    const { enterSelectionMode, onSelectClick, isSelectionMode } = options;
    let pressTimer;
    
    mediaItem.addEventListener('mousedown', () => {
        pressTimer = window.setTimeout(() => {
            const getSelectionMode = typeof isSelectionMode === 'function' 
                ? isSelectionMode 
                : () => isSelectionMode;
                
            if (!getSelectionMode()) {
                enterSelectionMode();
                onSelectClick(mediaItem, item.id);
            }
        }, LONG_PRESS_DURATION);
    });
    
    mediaItem.addEventListener('mouseup', () => {
        clearTimeout(pressTimer);
    });
    
    mediaItem.addEventListener('mouseleave', () => {
        clearTimeout(pressTimer);
    });
}

// ======================== MAIN EXPORTS ========================

/**
 * Create a single media item element
 * 
 * @param {Object} item - Media item data
 * @param {Object} options - Configuration options
 * @param {Object} fileInfo - Optional additional file information
 * @returns {HTMLElement} - The created media item element
 */
export function createMediaItem(item, options, fileInfo = null) {
    const {
        onItemClick,
        onDeleteClick,
        onSelectClick,
        enterSelectionMode,
        isSelectionMode
    } = options;
    
    // Create the main container
    const mediaItem = document.createElement('div');
    mediaItem.className = 'media-item';
    mediaItem.dataset.id = item.id;
    mediaItem.dataset.type = item.type;
    
    // Store item data for navigation
    const itemData = {
        id: item.id,
        type: item.type,
        name: item.name,
        path: item.path,
        size: fileInfo?.size || item.size || 0,
        created: fileInfo?.uploadDate || item.created,
        modified: fileInfo?.uploadDate || item.modified || item.created
    };
    
    // If we have file info, include it in the stored data
    if (fileInfo) {
        itemData.fileInfo = fileInfo;
    }
    
    mediaItem.dataset.itemData = JSON.stringify(itemData);
    
    // Add selection behavior and get elements
    const { checkboxIcon } = addSelectionBehavior(mediaItem, item, options);
    
    // Create and add thumbnail container
    const thumbnailContainer = createThumbnailContainer(item, fileInfo);
    mediaItem.appendChild(thumbnailContainer);
    
    // Create info section with metadata and actions
    const { mediaInfo, trashIcon } = createInfoSection(item, onDeleteClick, fileInfo);
    mediaItem.appendChild(mediaInfo);
    
    // Insert SVG for trash icon
    insertSvg('/public/img/icons/trash.svg', trashIcon);
    
    return mediaItem;
}

/**
 * Update the selection state of a media item
 * 
 * @param {HTMLElement} element - The media item element
 * @param {string} id - The media item ID
 * @param {boolean} isSelected - Whether the item is selected
 */
export function updateItemSelection(element, id, isSelected) {
    if (isSelected) {
        element.classList.add('selected');
        
        // Update checkbox to show selected state
        const checkboxIcon = element.querySelector('.select-mode-btn span');
        checkboxIcon.innerHTML = '';
        insertSvg('/public/img/icons/checkbox.svg', checkboxIcon);
    } else {
        element.classList.remove('selected');
        
        // Update checkbox to show unselected state
        const checkboxIcon = element.querySelector('.select-mode-btn span');
        checkboxIcon.innerHTML = '';
        insertSvg('/public/img/icons/checkbox-empty.svg', checkboxIcon);
    }
}

/**
 * Format date for section headers
 * @param {Date} date - The date to format
 * @returns {string} - Formatted date string
 */
export const formatDateHeader = formatHeaderDate;

/**
 * Create date section elements for gallery
 * 
 * @param {string} dateKey - The date key in YYYY-MM-DD format
 * @param {Date} date - The date object
 * @param {HTMLElement} galleryElement - The gallery element where sections should be added
 * @returns {Object} - Object containing the created header and group elements
 */
export function createDateSection(dateKey, date, galleryElement) {
    // Create a header for this date group
    const dateHeader = document.createElement('div');
    dateHeader.className = 'date-header';
    dateHeader.dataset.dateKey = dateKey;
    
    const dateHeading = document.createElement('h2');
    dateHeading.textContent = formatDateHeader(date);
    dateHeader.appendChild(dateHeading);
    
    galleryElement.appendChild(dateHeader);
    
    // Create a container for this date's media items
    const dateGroup = document.createElement('div');
    dateGroup.className = 'date-group';
    dateGroup.dataset.dateKey = dateKey;
    galleryElement.appendChild(dateGroup);
    
    return { dateHeader, dateGroup };
}

/**
 * Populate date sections with media items
 * 
 * @param {Object} mediaByDate - Object with date keys and arrays of media items
 * @param {HTMLElement} galleryElement - The gallery element
 * @param {Object} options - Options including callbacks for item interactions
 */
export function renderMediaByDate(mediaByDate, galleryElement, options) {
    // Clear gallery first
    galleryElement.innerHTML = '';
    
    // Store the date groups and media map as window properties for cross-date navigation
    window.dateGroups = Object.keys(mediaByDate).sort().reverse();
    window.mediaByDateMap = mediaByDate;
    
    // Get file info map from options if available
    const fileInfos = options.fileInfos || {};
    
    // Create date section headers and items for each date
    window.dateGroups.forEach(dateKey => {
        const items = mediaByDate[dateKey];
        const date = new Date(dateKey);
        
        // Create the date section elements
        const { dateGroup } = createDateSection(dateKey, date, galleryElement);
        
        // Add media items to the date group
        items.forEach(item => {
            // Get the file info for this item if available
            const fileInfo = fileInfos[item.id] || null;
            
            // Create media item with file info
            const mediaItem = createMediaItem(item, options, fileInfo);
            dateGroup.appendChild(mediaItem);
        });
    });
}
