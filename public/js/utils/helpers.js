/**
 * Helper utilities for the media gallery application
 */

/**
 * Format a file size in bytes to a human-readable string
 * 
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size (e.g., "2.5 MB")
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format a date for headers in the gallery view
 * 
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string (Today, Yesterday, Day of week, or full date)
 */
export function formatDateHeader(date) {
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
}

/**
 * Format a date in a more readable way for media item display
 * 
 * @param {string} dateString - Date string to format
 * @returns {string} - Formatted date string
 */
export function formatDate(dateString) {
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
}

/**
 * Detect if the device is mobile
 * 
 * @returns {boolean} - True if the device is mobile
 */
export function isMobileDevice() {
    return (window.innerWidth <= 768) || 
            ('ontouchstart' in window) || 
            (navigator.maxTouchPoints > 0) || 
            (navigator.msMaxTouchPoints > 0);
}

/**
 * Extract resolution string from media item
 * 
 * @param {Object} item - Media item
 * @returns {string|null} - Formatted resolution or null if not available
 */
export function getMediaResolution(item) {
    if (!item) return null;
    
    // Enhanced resolution extraction logic that handles more edge cases
    
    // First check direct properties on the item
    if (item.width && item.height) {
        return `${item.width} × ${item.height}`;
    }
    
    // Check metadata object
    if (item.metadata) {
        const metadata = item.metadata;
        
        // Direct width/height in metadata
        if (metadata.width && metadata.height) {
            return `${metadata.width} × ${metadata.height}`;
        }
        
        // Check EXIF data with various naming conventions
        const exif = metadata.exif || {};
        
        // Standard EXIF dimension fields
        if (exif.imageWidth && exif.imageHeight) {
            return `${exif.imageWidth} × ${exif.imageHeight}`;
        }
        
        if (exif.PixelXDimension && exif.PixelYDimension) {
            return `${exif.PixelXDimension} × ${exif.PixelYDimension}`;
        }
        
        // Try various other field names
        const dimensionFields = [
            ['width', 'height'],
            ['Width', 'Height'],
            ['ExifImageWidth', 'ExifImageHeight']
        ];
        
        for (const [widthField, heightField] of dimensionFields) {
            // Check in exif metadata
            if (exif[widthField] && exif[heightField]) {
                return `${exif[widthField]} × ${exif[heightField]}`;
            }
            
            // Check in base metadata
            if (metadata[widthField] && metadata[heightField]) {
                return `${metadata[widthField]} × ${metadata[heightField]}`;
            }
        }
    }
    
    return null;
}
