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
    
    // Extract resolution information from metadata if available
    const resolution = getResolutionString(item);
    
    // Prepare data for template
    const templateData = {
        name: item.name,
        fileType: fileType,
        extension: extension,
        fileSize: fileSize,
        dateCreated: dateCreated,
        path: item.path,
        fileHash: item.fileHash || 'Not available',
        resolution: resolution || 'Unknown'
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
    
    // If resolution wasn't in the template data but we can determine it from the DOM element
    // for the image or video, update the resolution field
    if (resolution === null && item.type === 'image') {
        setTimeout(() => {
            updateResolutionFromElement(container, 'img');
        }, 500); // Give the image some time to load
    } else if (resolution === null && item.type === 'video') {
        setTimeout(() => {
            updateResolutionFromElement(container, 'video');
        }, 500);
    }
}

/**
 * Extract resolution string from item metadata
 * 
 * @param {Object} item - Media item
 * @returns {string|null} - Resolution string or null if not available
 */
function getResolutionString(item) {
    const metadata = item.metadata || {};
    
    // Check for explicit width and height in metadata
    if (metadata.width && metadata.height) {
        return `${metadata.width} × ${metadata.height}`;
    }
    
    // Check EXIF data for image dimensions
    const exif = metadata.exif || {};
    
    if (exif.imageWidth && exif.imageHeight) {
        return `${exif.imageWidth} × ${exif.imageHeight}`;
    }
    
    if (exif.PixelXDimension && exif.PixelYDimension) {
        return `${exif.PixelXDimension} × ${exif.PixelYDimension}`;
    }
    
    // Check for resolution through various EXIF fields
    if (item.type === 'image') {
        // Try EXIF fields with different naming conventions
        const possibleWidthFields = ['width', 'Width', 'ImageWidth', 'PixelXDimension'];
        const possibleHeightFields = ['height', 'Height', 'ImageHeight', 'PixelYDimension'];
        
        for (const widthField of possibleWidthFields) {
            for (const heightField of possibleHeightFields) {
                if (exif[widthField] && exif[heightField]) {
                    return `${exif[widthField]} × ${exif[heightField]}`;
                }
            }
        }
    }
    
    return null;
}

/**
 * Update resolution information from loaded media element
 * 
 * @param {HTMLElement} container - Container element
 * @param {string} selector - Selector for media element (img or video)
 */
function updateResolutionFromElement(container, selector) {
    try {
        // Find the media element in the viewer
        const mediaElement = document.querySelector(`#media-container ${selector}`);
        const resolutionElement = container.querySelector('.resolution-value');
        
        if (mediaElement && resolutionElement && mediaElement.naturalWidth) {
            // For images, naturalWidth and naturalHeight properties provide the intrinsic dimensions
            const width = mediaElement.naturalWidth || mediaElement.videoWidth;
            const height = mediaElement.naturalHeight || mediaElement.videoHeight;
            
            if (width && height) {
                resolutionElement.textContent = `${width} × ${height}`;
            }
        }
    } catch (err) {
        console.warn('Error updating resolution from element:', err);
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
    
    // Check if image has EXIF metadata
    const metadata = item.metadata || {};
    const exifData = metadata.exif || {};
    
    if (Object.keys(exifData).length > 0) {
        // Image dimensions - add if not already included in basic info
        if ((exifData.imageWidth && exifData.imageHeight) || 
            (exifData.PixelXDimension && exifData.PixelYDimension)) {
            const width = exifData.imageWidth || exifData.PixelXDimension;
            const height = exifData.imageHeight || exifData.PixelYDimension;
            if (width && height) {
                addMetadataRow(group, 'Dimensions', `${width} × ${height}`);
            }
        }
        
        // Camera information
        if (exifData.make || exifData.model) {
            addMetadataRow(group, 'Camera', `${exifData.make || ''} ${exifData.model || ''}`.trim());
        }
        
        // Camera settings (exposure, aperture, etc.)
        if (exifData.exposureTime) {
            const exposureTime = typeof exifData.exposureTime === 'number' 
                ? formatExposureTime(exifData.exposureTime) 
                : exifData.exposureTime;
            addMetadataRow(group, 'Exposure', exposureTime);
        }
        
        if (exifData.fNumber) {
            const fNumber = typeof exifData.fNumber === 'number' 
                ? `f/${exifData.fNumber.toFixed(1)}` 
                : exifData.fNumber;
            addMetadataRow(group, 'Aperture', fNumber);
        }
        
        if (exifData.focalLength) {
            const focalLength = typeof exifData.focalLength === 'number' 
                ? `${exifData.focalLength}mm` 
                : exifData.focalLength;
            addMetadataRow(group, 'Focal Length', focalLength);
        }
        
        if (exifData.isoSpeedRatings) {
            addMetadataRow(group, 'ISO', exifData.isoSpeedRatings);
        }
        
        // GPS information
        if (exifData.gpsLatitude !== undefined && exifData.gpsLongitude !== undefined) {
            const locationValue = `${exifData.gpsLatitude.toFixed(6)}, ${exifData.gpsLongitude.toFixed(6)}`;
            const locationLink = document.createElement('a');
            locationLink.href = `https://maps.google.com/?q=${exifData.gpsLatitude},${exifData.gpsLongitude}`;
            locationLink.target = '_blank';
            locationLink.textContent = locationValue;
            locationLink.className = 'metadata-link';
            
            const locationRow = document.createElement('div');
            locationRow.className = 'metadata-row';
            
            const label = document.createElement('span');
            label.className = 'metadata-label';
            label.textContent = 'Location';
            
            const value = document.createElement('span');
            value.className = 'metadata-value';
            value.appendChild(locationLink);
            
            locationRow.appendChild(label);
            locationRow.appendChild(value);
            group.appendChild(locationRow);
        }
        
        if (exifData.gpsAltitude !== undefined) {
            const altitude = typeof exifData.gpsAltitude === 'number' 
                ? `${exifData.gpsAltitude.toFixed(1)} meters` 
                : exifData.gpsAltitude;
            addMetadataRow(group, 'Altitude', altitude);
        }
        
        // Original date information from EXIF
        if (exifData.dateTimeOriginal) {
            const formattedDate = new Date(exifData.dateTimeOriginal).toLocaleString();
            addMetadataRow(group, 'Taken On', formattedDate);
        }
    } else {
        const note = document.createElement('div');
        note.className = 'metadata-note';
        note.textContent = 'No EXIF data available for this image';
        group.appendChild(note);
    }
    
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
    
    const metadata = item.metadata || {};
    
    // Try to extract video metadata if available
    if (metadata.duration) {
        addMetadataRow(group, 'Duration', formatDuration(metadata.duration));
    }
    
    // Resolution (if available but not already shown in the basic info)
    if (metadata.width && metadata.height) {
        addMetadataRow(group, 'Resolution', `${metadata.width} × ${metadata.height}`);
    }
    
    if (metadata.frameRate) {
        addMetadataRow(group, 'Frame Rate', `${metadata.frameRate} fps`);
    }
    
    if (metadata.videoCodec) {
        addMetadataRow(group, 'Codec', metadata.videoCodec);
    }
    
    if (metadata.audioCodec) {
        addMetadataRow(group, 'Audio', metadata.audioCodec);
    }
    
    // If we didn't add any rows, show a message
    if (group.querySelectorAll('.metadata-row').length === 0) {
        const note = document.createElement('div');
        note.className = 'metadata-note';
        note.textContent = 'Advanced video metadata extraction not available';
        group.appendChild(note);
    }
    
    container.appendChild(group);
    
    // Add Media Player section for interactive video display
    const mediaPlayerGroup = document.createElement('div');
    mediaPlayerGroup.className = 'metadata-group';
    
    const mediaPlayerTitle = document.createElement('h4');
    mediaPlayerTitle.textContent = 'Media Player';
    mediaPlayerGroup.appendChild(mediaPlayerTitle);
    
    const mediaPlayerNote = document.createElement('div');
    mediaPlayerNote.className = 'metadata-note';
    mediaPlayerNote.textContent = 'Use the video player controls to play, pause, and adjust volume.';
    mediaPlayerGroup.appendChild(mediaPlayerNote);
    
    container.appendChild(mediaPlayerGroup);
}

/**
 * Format exposure time to a readable fraction
 * @param {number} exposure - Exposure time in seconds
 * @returns {string} - Formatted exposure time as a fraction
 */
function formatExposureTime(exposure) {
    if (exposure >= 1) {
        return `${exposure}s`;
    }
    
    // Convert to fraction
    const denominator = Math.round(1 / exposure);
    return `1/${denominator}s`;
}

/**
 * Format duration in seconds to MM:SS format
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Helper function to add a metadata row to the group
 * @param {HTMLElement} group - The group element to add the row to
 * @param {string} label - The metadata label
 * @param {string} value - The metadata value
 */
function addMetadataRow(group, label, value) {
    if (value === undefined || value === null || value === '') {
        return;
    }
    
    const row = document.createElement('div');
    row.className = 'metadata-row';
    
    const labelElement = document.createElement('span');
    labelElement.className = 'metadata-label';
    labelElement.textContent = label;
    
    const valueElement = document.createElement('span');
    valueElement.className = 'metadata-value';
    valueElement.textContent = value;
    
    row.appendChild(labelElement);
    row.appendChild(valueElement);
    group.appendChild(row);
}
