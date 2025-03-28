/**
 * Utility to load SVG files and insert them inline
 */

// Cache for loaded SVGs
const svgCache = {};

/**
 * Loads an SVG file and returns its content
 * 
 * @param {string} path - Path to the SVG file
 * @returns {Promise<string>} - SVG content
 */
export async function loadSvg(path) {
    // Check cache first
    if (svgCache[path]) {
        return svgCache[path];
    }
    
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load SVG: ${path}`);
        }
        
        const svgContent = await response.text();
        // Cache the result
        svgCache[path] = svgContent;
        return svgContent;
    } catch (error) {
        console.error(`Error loading SVG ${path}:`, error);
        // Return an empty SVG as fallback
        return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"></svg>';
    }
}

/**
 * Inserts an SVG into a DOM element
 * 
 * @param {string} path - Path to the SVG file 
 * @param {HTMLElement} element - Element to insert the SVG into
 * @param {Object} attributes - Optional attributes to set on the SVG
 * @returns {Promise<SVGElement>} - Promise that resolves with the SVG element
 */
export async function insertSvg(path, element, attributes = {}) {
    // Check if element exists
    if (!element) {
        console.error('Cannot insert SVG: Target element is null');
        return null;
    }
    
    try {
        const svgContent = await loadSvg(path);
        element.innerHTML = svgContent;
        
        // Find the SVG element we just inserted
        const svgElement = element.querySelector('svg');
        if (svgElement && attributes) {
            // Apply any custom attributes
            Object.entries(attributes).forEach(([key, value]) => {
                svgElement.setAttribute(key, value);
            });
        }
        
        return svgElement;
    } catch (error) {
        console.error(`Error inserting SVG into element:`, error);
        return null;
    }
}
