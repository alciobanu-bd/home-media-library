import { formatFileSize } from '../utils/helpers.js';
import { loadAndFillTemplate } from '../utils/template-loader.js';

/**
 * Module for handling metadata display in the viewer
 */

/**
 * Render metadata for a media item
 * 
 * @param {Object} item - Media item object containing metadata
 * @param {HTMLElement} container - Container element where metadata will be displayed
 */
export async function renderMetadata(item, container) {
    if (!item || !container) {
        console.error('Missing required parameters for renderMetadata');
        return;
    }
    
    // Format basic information
    const fileSize = formatFileSize(item.size);
    const dateCreated = new Date(item.created || item.modified).toLocaleString();
    const fileType = item.type.charAt(0).toUpperCase() + item.type.slice(1);
    const extension = item.name.split('.').pop().toUpperCase();
    
    // Prepare data for template
    const templateData = {
        name: item.name,
        fileType: fileType,
        extension: extension,
        fileSize: fileSize,
        dateCreated: dateCreated,
        path: item.path
    };
    
    // Load and fill the template
    const metadataElement = await loadAndFillTemplate('/public/templates/metadata-template.html', templateData);
    container.appendChild(metadataElement);
    
    // Add type-specific metadata
    const additionalMetadataContainer = container.querySelector('#additional-metadata');
    if (item.type === 'image') {
        await renderImageMetadata(item, additionalMetadataContainer);
    } else if (item.type === 'video') {
        await renderVideoMetadata(item, additionalMetadataContainer);
    }
}

/**
 * Render image-specific metadata
 * 
 * @param {Object} item - Image item
 * @param {HTMLElement} container - Container for additional metadata
 */
async function renderImageMetadata(item, container) {
    const group = document.createElement('div');
    group.className = 'metadata-group';
    
    const title = document.createElement('h4');
    title.textContent = 'Image Information';
    group.appendChild(title);
    
    const note = document.createElement('div');
    note.className = 'metadata-note';
    note.textContent = 'Additional image metadata would appear here';
    group.appendChild(note);
    
    container.appendChild(group);
}

/**
 * Render video-specific metadata
 * 
 * @param {Object} item - Video item
 * @param {HTMLElement} container - Container for additional metadata
 */
async function renderVideoMetadata(item, container) {
    const group = document.createElement('div');
    group.className = 'metadata-group';
    
    const title = document.createElement('h4');
    title.textContent = 'Video Information';
    group.appendChild(title);
    
    const note = document.createElement('div');
    note.className = 'metadata-note';
    note.textContent = 'Additional video metadata would appear here';
    group.appendChild(note);
    
    container.appendChild(group);
}
