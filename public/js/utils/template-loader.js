/**
 * Template loader utility
 * Loads HTML templates and creates DOM elements from them
 */

// Cache for loaded templates
const templateCache = {};

/**
 * Load a template file
 * 
 * @param {string} path - Path to the template file
 * @returns {Promise<string>} - Template content
 */
export async function loadTemplate(path) {
    // Check cache first
    if (templateCache[path]) {
        return templateCache[path];
    }
    
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load template: ${path}`);
        }
        
        const templateContent = await response.text();
        // Cache the result
        templateCache[path] = templateContent;
        return templateContent;
    } catch (error) {
        console.error(`Error loading template ${path}:`, error);
        return '';
    }
}

/**
 * Creates a DOM element from HTML string
 * 
 * @param {string} html - HTML string
 * @returns {DocumentFragment} - Document fragment containing the DOM elements
 */
export function createElementFromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content;
}

/**
 * Fills a template with data
 * 
 * @param {string} templateContent - Template content with {{placeholders}}
 * @param {Object} data - Data to fill the template with
 * @returns {string} - Filled template
 */
export function fillTemplate(templateContent, data) {
    return templateContent.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
    });
}

/**
 * Loads a template and populates it with data
 * 
 * @param {string} path - Path to the template
 * @param {Object} data - Data to fill the template with
 * @returns {Promise<DocumentFragment>} - Document fragment with the populated template
 */
export async function loadAndFillTemplate(path, data = {}) {
    const templateContent = await loadTemplate(path);
    const filledTemplate = fillTemplate(templateContent, data);
    return createElementFromHTML(filledTemplate);
}
