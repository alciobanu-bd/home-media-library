/**
 * Upload module for handling file uploads
 */
import { formatFileSize } from '../utils/helpers.js';
import { extractExifMetadata } from '../utils/exif-extractor.js';

// Module-level variables
let uploadModal;
let closeUploadModal;
let modalOverlay;
let dragArea;
let fileInput;
let browseFilesBtn;
let fileList;
let uploadSubmitBtn;
let cancelUploadBtn;
let selectedFiles = [];
let loadMediaCallback;
let uploadInProgress = false;

// Initialize upload functionality
export function init(refreshCallback) {
    // Store reference to the media reload function
    loadMediaCallback = refreshCallback;

    // Get DOM elements
    uploadModal = document.getElementById('upload-modal');
    closeUploadModal = document.getElementById('close-upload-modal');
    modalOverlay = document.querySelector('.modal-overlay');
    dragArea = document.querySelector('.drag-area');
    fileInput = document.getElementById('file-input');
    browseFilesBtn = document.getElementById('browse-files');
    fileList = document.getElementById('file-list');
    uploadSubmitBtn = document.getElementById('upload-submit');
    cancelUploadBtn = document.getElementById('cancel-upload');
    
    // Set up event listeners
    initEventListeners();
    
    // Return the public API
    return {
        openUploadModal
    };
}

// Set up all event listeners
function initEventListeners() {
    // Modal controls
    closeUploadModal.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', closeModal);
    
    // Cancel button
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
    
    // File selection
    browseFilesBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', () => {
        console.log('Upload file input:', fileInput.files);
        const files = Array.from(fileInput.files);
        handleSelectedFiles(files);
    });
    
    // Drag and drop
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
    
    // File list interaction (remove files)
    fileList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-file')) {
            const fileName = e.target.dataset.name;
            selectedFiles = selectedFiles.filter(file => file.name !== fileName);
            e.target.closest('.file-item').remove();
            
            // Disable upload button if no files are selected
            uploadSubmitBtn.disabled = selectedFiles.length === 0;
        }
    });
    
    // Upload button
    uploadSubmitBtn.addEventListener('click', uploadFiles);
}

// Open upload modal
export function openUploadModal() {
    uploadModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent scrolling behind modal
}

// Close upload modal
function closeModal() {
    // If upload is in progress, confirm before closing
    if (uploadInProgress) {
        if (!confirm('Upload is in progress. Are you sure you want to cancel?')) {
            return;
        }
    }

    uploadModal.classList.add('hidden');
    document.body.style.overflow = '';
    
    // Check if any files were successfully uploaded
    const successfulUploads = document.querySelectorAll('.file-status.success');
    const hasUploads = successfulUploads.length > 0;
    
    // Reset the form
    resetUploadForm();
    
    // If files were successfully uploaded, refresh the media library
    if (hasUploads && loadMediaCallback) {
        loadMediaCallback();
    }
}

// Process selected files
function handleSelectedFiles(files) {
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
        
        // Create file item in UI with DOM methods
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        // Create file info section
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = file.name;
        fileInfo.appendChild(fileName);
        
        const fileSize = document.createElement('div');
        fileSize.className = 'file-size';
        fileSize.textContent = formatFileSize(file.size);
        fileInfo.appendChild(fileSize);
        
        fileItem.appendChild(fileInfo);
        
        // Create file controls section
        const fileControls = document.createElement('div');
        fileControls.className = 'file-controls';
        
        const fileStatus = document.createElement('div');
        fileStatus.className = 'file-status';
        fileControls.appendChild(fileStatus);
        
        const errorMessage = document.createElement('div');
        errorMessage.className = 'file-error-message';
        fileControls.appendChild(errorMessage);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-file';
        removeBtn.dataset.name = file.name;
        removeBtn.textContent = '×';
        fileControls.appendChild(removeBtn);
        
        fileItem.appendChild(fileControls);
        
        // Create progress bar
        const uploadProgress = document.createElement('div');
        uploadProgress.className = 'upload-progress';
        
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        uploadProgress.appendChild(progressBar);
        
        fileItem.appendChild(uploadProgress);
        
        fileList.appendChild(fileItem);
    });

    // Enable upload button if files are selected
    uploadSubmitBtn.disabled = selectedFiles.length === 0;
}

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

/**
 * Extract metadata from a file
 * @param {File} file - The file to extract metadata from
 * @returns {Promise<Object>} - The extracted metadata
 */
async function extractFileMetadata(file) {
    let exifData = {};
    
    try {
        if (file.type.startsWith('image/')) {
            // For images, extract EXIF data
            exifData = await extractExifMetadata(file);
            console.log(`EXIF metadata extracted for ${file.name}:`, exifData);
        } else {
            // For other files, use basic metadata
            exifData = {
                originalTimestamp: file.lastModified,
                dateCreated: new Date(file.lastModified).toISOString()
            };
        }
    } catch (err) {
        console.warn(`Error extracting metadata from ${file.name}:`, err);
        exifData = {
            originalTimestamp: file.lastModified,
            dateCreated: new Date(file.lastModified).toISOString(),
            extractionError: err.message
        };
    }
    
    // Comprehensive metadata object without duplicate handling
    return {
        filename: file.name,
        originalName: file.name,
        lastModified: file.lastModified,
        lastModifiedDate: file.lastModifiedDate ? file.lastModifiedDate.toISOString() : null,
        createDate: exifData.dateCreated || new Date(file.lastModified).toISOString(),
        originalTimestamp: file.lastModified,
        type: file.type,
        size: file.size,
        extension: file.name.split('.').pop().toLowerCase(),
        exif: exifData,
        uploadedAt: new Date().toISOString()
    };
}

// Upload files to server - simplified without duplicate handling
async function uploadFiles() {
    if (selectedFiles.length === 0) return;
    
    uploadSubmitBtn.disabled = true;
    cancelUploadBtn.disabled = true;
    uploadSubmitBtn.textContent = 'Analyzing files...';
    uploadInProgress = true;
    
    let hasErrors = false;
    let completedUploads = 0;
    
    try {
        // Disable remove buttons during upload
        document.querySelectorAll('.remove-file').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
        
        // Get files that aren't already uploaded
        const filesToUpload = selectedFiles.filter(file => {
            const fileItem = findFileItemByName(file.name);
            return !(fileItem && fileItem.querySelector('.file-status.success'));
        });
        
        // Early return if no files to upload
        if (filesToUpload.length === 0) {
            alert('All files have already been uploaded successfully.');
            uploadSubmitBtn.textContent = 'Upload Files';
            uploadSubmitBtn.disabled = false;
            uploadInProgress = false;
            return;
        }
        
        // Process each file sequentially to avoid overwhelming the server
        for (const file of filesToUpload) {
            const fileItem = findFileItemByName(file.name);
            
            try {
                // Extract metadata first
                if (fileItem) {
                    updateFileStatus(fileItem, 'Extracting metadata', 'pending');
                    updateProgress(fileItem, 10);
                }
                
                // Extract metadata
                const metadata = await extractFileMetadata(file);
                console.log('Extracted metadata:', metadata);
                
                // Create a dedicated FormData for this single file
                const formData = new FormData();
                formData.append('file', file);
                
                // Stringify metadata to ensure proper transmission
                const metadataStr = JSON.stringify(metadata);
                formData.append('metadata', metadataStr);
                
                console.log('Uploading file with metadata:', metadataStr);
                
                // Start the upload
                if (fileItem) {
                    updateFileStatus(fileItem, 'Uploading', 'pending');
                    updateProgress(fileItem, 20);
                }
                
                // Upload the file
                try {
                    const uploadResult = await uploadSingleFile(formData, (progress) => {
                        if (fileItem) updateProgress(fileItem, 20 + Math.floor(progress * 0.6));
                    });
                    
                    console.log('Upload result:', uploadResult);
                    
                    if (uploadResult.success) {
                        if (fileItem) {
                            updateFileStatus(fileItem, 'Success', 'success');
                            updateProgress(fileItem, 100);
                        }
                        completedUploads++;
                    } else {
                        throw new Error(uploadResult.message || 'Upload failed');
                    }
                } catch (err) {
                    console.error('Upload error:', err);
                    
                    // Handle all errors the same way - no special duplicate handling
                    if (fileItem) {
                        updateFileStatus(fileItem, 'Error', 'error');
                        updateFileError(fileItem, err.message || 'Upload failed');
                        fileItem.classList.add('has-error');
                    }
                    hasErrors = true;
                }
            } catch (error) {
                hasErrors = true;
                console.error(`Error processing file ${file.name}:`, error);
                
                if (fileItem) {
                    updateFileStatus(fileItem, 'Error', 'error');
                    updateFileError(fileItem, error.message || 'Upload failed');
                    fileItem.classList.add('has-error');
                }
            }
        }
        
        // Update the overall status
        uploadSubmitBtn.textContent = hasErrors ? 'Retry Failed Uploads' : 'Upload Complete';
        
        // Auto close if all uploads completed successfully
        if (!hasErrors && completedUploads === filesToUpload.length) {
            setTimeout(() => {
                closeModal();
            }, 1500);
        }
        
        // Remove successfully uploaded files from the selection
        selectedFiles = selectedFiles.filter(file => {
            const fileItem = findFileItemByName(file.name);
            return !(fileItem && fileItem.querySelector('.file-status.success'));
        });
        
    } catch (error) {
        console.error('Overall upload process failed:', error);
        alert(`Upload failed: ${error.message || 'Unknown error'}`);
    } finally {
        uploadSubmitBtn.disabled = false;
        cancelUploadBtn.disabled = false;
        cancelUploadBtn.textContent = 'Close';
        uploadInProgress = false;
        
        // Re-enable remove buttons
        document.querySelectorAll('.remove-file').forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });
    }
}

/**
 * Update the status message for a file
 * @param {HTMLElement} fileItem - The file item element
 * @param {string} status - The status message
 * @param {string} className - The status class name (success, error, pending, warning)
 */
function updateFileStatus(fileItem, status, className) {
    const statusEl = fileItem.querySelector('.file-status');
    if (statusEl) {
        statusEl.textContent = status;
        statusEl.className = `file-status ${className}`;
    }
}

/**
 * Update the error message for a file
 * @param {HTMLElement} fileItem - The file item element
 * @param {string} error - The error message
 */
function updateFileError(fileItem, error) {
    const errorEl = fileItem.querySelector('.file-error-message');
    if (errorEl) {
        errorEl.textContent = error;
        errorEl.style.display = 'block';
    }
}

/**
 * Update the progress bar for a file
 * @param {HTMLElement} fileItem - The file item element
 * @param {number} percent - The progress percentage (0-100)
 */
function updateProgress(fileItem, percent) {
    const progressBar = fileItem.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
}

/**
 * Upload a single file with progress tracking
 * @param {FormData} formData - The form data containing the file
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Promise<Object>} - The upload result
 */
function uploadSingleFile(formData, progressCallback) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Set up progress tracking
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = event.loaded / event.total;
                progressCallback(percentComplete);
            }
        });
        
        // Handle completion
        xhr.addEventListener('load', () => {
            try {
                const response = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                console.log('XHR response:', xhr.status, response);
                
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(response);
                } else if (xhr.status === 409) {
                    // Duplicate file detected - silently use the existing file
                    // without prompting the user
                    console.log('Duplicate file detected, using existing file:', response.duplicate);
                    resolve({
                        success: true,
                        message: 'Using existing file',
                        file: response.duplicate,
                        isDuplicate: true
                    });
                } else {
                    // Standard error handling
                    const errorMessage = response.message || response.error || `Server error (${xhr.status})`;
                    reject(new Error(errorMessage));
                }
            } catch (e) {
                console.error('Error parsing response:', e, xhr.responseText);
                reject(new Error(`Invalid server response: ${xhr.status} ${xhr.statusText}`));
            }
        });
        
        // Handle errors
        xhr.addEventListener('error', () => {
            console.error('Network error occurred');
            reject(new Error('Network error occurred'));
        });
        
        xhr.addEventListener('abort', () => {
            console.error('Upload aborted');
            reject(new Error('Upload aborted'));
        });
        
        // Send the request
        xhr.open('POST', '/api/media/upload');
        xhr.send(formData);
    });
}

// Reset upload form to initial state
function resetUploadForm() {
    fileInput.value = '';
    selectedFiles = [];
    fileList.innerHTML = '';
    uploadSubmitBtn.disabled = true;
    uploadSubmitBtn.textContent = 'Upload Files';
    cancelUploadBtn.textContent = 'Cancel';
    cancelUploadBtn.disabled = false;
}
