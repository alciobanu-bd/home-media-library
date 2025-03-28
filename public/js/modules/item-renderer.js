import { formatFileSize, formatDate } from '../utils/helpers.js';
import { insertSvg } from '../utils/svg-loader.js';

/**
 * Module for handling media item rendering
 */

/**
 * Create a single media item element
 * 
 * @param {Object} item - Media item data
 * @param {Object} options - Configuration options
 * @returns {HTMLElement} - The created media item element
 */
export function createMediaItem(item, options) {
    const {
        onItemClick,
        onDeleteClick,
        onSelectClick,
        enterSelectionMode,
        toggleItemSelection,
        isSelectionMode
    } = options;
    
    // Ensure isSelectionMode is a function that returns the current state
    const getSelectionMode = typeof isSelectionMode === 'function' 
        ? isSelectionMode 
        : () => isSelectionMode;
    
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
    
    // Create select mode button
    const selectModeBtn = document.createElement('button');
    selectModeBtn.className = 'select-mode-btn';
    selectModeBtn.title = 'Select';
    
    const checkboxIcon = document.createElement('span');
    checkboxIcon.className = 'checkbox-empty-icon';
    selectModeBtn.appendChild(checkboxIcon);
    
    // Create thumbnail container
    const thumbnailContainer = document.createElement('div');
    thumbnailContainer.className = 'thumbnail-container';
    
    const thumbnail = document.createElement('img');
    thumbnail.className = 'media-thumbnail';
    
    // Set thumbnail URL based on media type
    if (item.type === 'image') {
        thumbnail.src = `/media${item.path}`;
    } else {
        thumbnail.src = '/public/img/video-placeholder.svg';
    }
    thumbnail.alt = item.name;
    thumbnailContainer.appendChild(thumbnail);
    
    // Create media info container
    const mediaInfo = document.createElement('div');
    mediaInfo.className = 'media-info';
    
    const mediaName = document.createElement('div');
    mediaName.className = 'media-name';
    mediaName.textContent = item.name;
    mediaInfo.appendChild(mediaName);
    
    // Create actions row
    const actionsRow = document.createElement('div');
    actionsRow.className = 'media-actions-row';
    
    // Create metadata section
    const mediaMetadata = document.createElement('div');
    mediaMetadata.className = 'media-metadata';
    
    // Format data for display
    const fileSize = formatFileSize(item.size);
    const dateCreated = formatDate(item.created || item.modified);
    const fileType = item.type.charAt(0).toUpperCase() + item.type.slice(1);
    
    // Add type badge
    const typeBadge = document.createElement('span');
    typeBadge.className = `media-type-badge media-type-${item.type}`;
    typeBadge.textContent = fileType;
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
    
    actionsRow.appendChild(mediaMetadata);
    
    // Create delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-media-btn';
    deleteBtn.dataset.id = item.id;
    deleteBtn.title = 'Delete';
    
    const trashIcon = document.createElement('span');
    trashIcon.className = 'trash-icon';
    deleteBtn.appendChild(trashIcon);
    
    actionsRow.appendChild(deleteBtn);
    mediaInfo.appendChild(actionsRow);
    
    // Assemble the final mediaItem element
    mediaItem.appendChild(selectModeBtn);
    mediaItem.appendChild(thumbnailContainer);
    mediaItem.appendChild(mediaInfo);
    
    // Insert SVG icons
    insertSvg('/public/img/icons/checkbox-empty.svg', checkboxIcon);
    insertSvg('/public/img/icons/trash.svg', trashIcon);
    
    // Add event listeners
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent opening the media viewer when clicking delete
        onDeleteClick(item);
    });
    
    // Add select mode button handler
    selectModeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent opening the viewer
        if (!getSelectionMode()) {
            enterSelectionMode();
        }
        onSelectClick(mediaItem, item.id);
    });
    
    // Click handler for the media item
    mediaItem.addEventListener('click', (e) => {
        if (getSelectionMode()) {
            e.preventDefault();
            onSelectClick(mediaItem, item.id);
        } else {
            onItemClick(item, mediaItem);
        }
    });
    
    // Remove long press on mobile devices and use tap on select button instead
    let pressTimer;
    let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (!isMobile) {
        // Keep long press for desktop
        mediaItem.addEventListener('mousedown', () => {
            pressTimer = window.setTimeout(() => {
                if (!getSelectionMode()) {
                    enterSelectionMode();
                    onSelectClick(mediaItem, item.id);
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
        if (!getSelectionMode()) {
            enterSelectionMode();
            onSelectClick(mediaItem, item.id);
        }
    });
    
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
        
        // Update the select button to show checked checkbox
        const selectButton = element.querySelector('.select-mode-btn');
        const checkboxIcon = selectButton.querySelector('span');
        checkboxIcon.innerHTML = '';
        insertSvg('/public/img/icons/checkbox.svg', checkboxIcon);
    } else {
        element.classList.remove('selected');
        
        // Update the select button to show empty checkbox
        const selectButton = element.querySelector('.select-mode-btn');
        const checkboxIcon = selectButton.querySelector('span');
        checkboxIcon.innerHTML = '';
        insertSvg('/public/img/icons/checkbox-empty.svg', checkboxIcon);
    }
}
