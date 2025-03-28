/**
 * EXIF metadata extraction utility
 * Uses pure JavaScript to extract EXIF data from image files
 */

/**
 * Extract EXIF metadata from an image file
 * 
 * @param {File} file - The image file to extract metadata from
 * @returns {Promise<Object>} - Promise resolving to an object containing EXIF metadata
 */
export async function extractExifMetadata(file) {
    // Check if file is an image
    if (!file || !file.type.startsWith('image/')) {
        return {
            originalTimestamp: file.lastModified,
            dateCreated: new Date(file.lastModified).toISOString()
        };
    }
    
    try {
        // Read the file data
        const arrayBuffer = await readFileAsArrayBuffer(file);
        
        // Extract EXIF data
        const exifData = parseExifData(arrayBuffer);
        
        // Format and return the parsed data with GPS coordinates parsed if available
        const metadata = processExifData(exifData);
        
        // Add original file timestamp to help preserve creation date
        metadata.originalTimestamp = file.lastModified;
        
        // Use EXIF date if available, otherwise fall back to file lastModified
        if (!metadata.dateCreated && file.lastModified) {
            metadata.dateCreated = new Date(file.lastModified).toISOString();
        }
        
        console.log(`Extracted metadata for ${file.name}:`, metadata);
        
        return metadata;
    } catch (error) {
        console.warn(`Error extracting EXIF metadata from ${file.name}:`, error);
        // Return minimal metadata with timestamp
        return {
            extractionError: error.message,
            originalTimestamp: file.lastModified,
            dateCreated: new Date(file.lastModified).toISOString()
        };
    }
}

/**
 * Read a file as ArrayBuffer
 * 
 * @param {File} file - The file to read
 * @returns {Promise<ArrayBuffer>} - Promise resolving to ArrayBuffer containing file data
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Parse EXIF data from ArrayBuffer
 * 
 * @param {ArrayBuffer} arrayBuffer - The file data to parse
 * @returns {Object} - Raw EXIF data
 */
function parseExifData(arrayBuffer) {
    const exifData = { _segments: [] };
    const view = new DataView(arrayBuffer);
    
    // Check for JPEG SOI marker (0xFFD8)
    if (view.getUint8(0) !== 0xFF || view.getUint8(1) !== 0xD8) {
        return exifData; // Not a JPEG file
    }
    
    try {
        let offset = 2;
        
        // Scan for JPEG segments
        while (offset < view.byteLength - 1) {
            if (view.getUint8(offset) !== 0xFF) {
                offset += 1; // Skip non-marker bytes
                continue;
            }
            
            const marker = view.getUint8(offset + 1);
            
            // End of image marker
            if (marker === 0xD9) {
                break;
            }
            
            // Skip standalone markers
            if (marker === 0xD0 || marker === 0xD1 || 
                marker === 0xD2 || marker === 0xD3 || 
                marker === 0xD4 || marker === 0xD5 || 
                marker === 0xD6 || marker === 0xD7 || 
                marker === 0xD8 || marker === 0xD9) {
                offset += 2;
                continue;
            }
            
            // Get segment size (includes the size bytes but not the marker)
            const segmentSize = view.getUint16(offset + 2);
            
            if (segmentSize < 2) {
                offset += 2; // Skip invalid segments
                continue;
            }
            
            // Found APP1 segment (Exif data)
            if (marker === 0xE1) {
                // Check for Exif identifier
                const exifHeader = getStringFromView(view, offset + 4, 6);
                if (exifHeader === "Exif\0\0") {
                    exifData._exifFound = true;
                    exifData._exifOffset = offset + 10; // After "Exif\0\0"
                    
                    // Parse TIFF header and IFDs
                    parseTiffData(view, exifData._exifOffset, exifData);
                }
            }
            
            // Store segment info for debugging
            exifData._segments.push({
                marker: marker.toString(16).toUpperCase(),
                offset: offset,
                size: segmentSize
            });
            
            // Move to the next segment
            offset += 2 + segmentSize;
        }
    } catch (error) {
        console.warn("Error parsing EXIF data:", error);
        exifData._parseError = error.message;
    }
    
    return exifData;
}

/**
 * Get a string from a DataView
 * 
 * @param {DataView} view - The data view
 * @param {number} offset - Starting byte offset
 * @param {number} length - Number of bytes to read
 * @returns {string} - The extracted string
 */
function getStringFromView(view, offset, length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        const char = view.getUint8(offset + i);
        if (char === 0) break; // Stop at null terminator
        result += String.fromCharCode(char);
    }
    return result;
}

/**
 * Parse TIFF data including IFD0 and sub-IFDs
 * 
 * @param {DataView} view - The data view
 * @param {number} tiffStart - Offset to start of TIFF header
 * @param {Object} exifData - Object to store parsed EXIF data
 */
function parseTiffData(view, tiffStart, exifData) {
    // Check byte order
    const byteOrder = view.getUint16(tiffStart);
    const littleEndian = byteOrder === 0x4949; // "II" = Intel byte order (little endian)
    
    exifData._byteOrder = littleEndian ? "little-endian" : "big-endian";
    
    // Check TIFF identifier (should be 42)
    const tiffCheck = view.getUint16(tiffStart + 2, littleEndian);
    if (tiffCheck !== 42) {
        console.warn("Invalid TIFF identifier:", tiffCheck);
        return;
    }
    
    // Get offset to first IFD
    const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
    
    // Parse the main IFD (IFD0)
    exifData.ifd0 = {};
    const ifd0Entries = parseIfd(view, tiffStart + ifdOffset, tiffStart, littleEndian);
    exifData.ifd0 = ifd0Entries;
    
    // Look for sub-IFDs
    if (ifd0Entries[0x8769]) { // ExifIFD pointer
        const exifIfdOffset = ifd0Entries[0x8769].value;
        exifData.exif = parseIfd(view, tiffStart + exifIfdOffset, tiffStart, littleEndian);
    }
    
    if (ifd0Entries[0x8825]) { // GPS IFD pointer
        const gpsIfdOffset = ifd0Entries[0x8825].value;
        exifData.gps = parseIfd(view, tiffStart + gpsIfdOffset, tiffStart, littleEndian);
    }
}

/**
 * Parse an IFD (Image File Directory)
 * 
 * @param {DataView} view - The data view
 * @param {number} ifdOffset - Offset to the IFD
 * @param {number} tiffStart - The TIFF starting offset
 * @param {boolean} littleEndian - Whether the data is little endian
 * @returns {Object} - Parsed IFD entries
 */
function parseIfd(view, ifdOffset, tiffStart, littleEndian) {
    const entries = {};
    
    // Get number of entries in this IFD
    const entryCount = view.getUint16(ifdOffset, littleEndian);
    
    // Parse each entry
    for (let i = 0; i < entryCount; i++) {
        const entryOffset = ifdOffset + 2 + (i * 12); // 12 bytes per entry
        const tagId = view.getUint16(entryOffset, littleEndian);
        const dataType = view.getUint16(entryOffset + 2, littleEndian);
        const numValues = view.getUint32(entryOffset + 4, littleEndian);
        const valueOffset = view.getUint32(entryOffset + 8, littleEndian);
        
        try {
            const tagValue = readTagValue(view, dataType, numValues, valueOffset, tiffStart, entryOffset + 8, littleEndian);
            entries[tagId] = {
                id: tagId,
                type: dataType,
                count: numValues,
                value: tagValue
            };
        } catch (err) {
            console.warn(`Error parsing tag 0x${tagId.toString(16)}:`, err);
        }
    }
    
    return entries;
}

/**
 * Read a tag value based on its data type
 * 
 * @param {DataView} view - The data view
 * @param {number} dataType - EXIF data type ID
 * @param {number} numValues - Number of values
 * @param {number} valueOffset - Offset to the value
 * @param {number} tiffStart - The TIFF starting offset
 * @param {number} entryValueOffset - Offset within the IFD entry where the value is stored
 * @param {boolean} littleEndian - Whether the data is little endian
 * @returns {*} - The tag value
 */
function readTagValue(view, dataType, numValues, valueOffset, tiffStart, entryValueOffset, littleEndian) {
    // Data types:
    // 1 = byte, 2 = ascii, 3 = short (2 bytes), 4 = long (4 bytes),
    // 5 = rational (8 bytes), 7 = undefined, 9 = signed long, 10 = signed rational
    
    let valueBytes = 0;
    let getValue = null;
    
    switch (dataType) {
        case 1: // BYTE
            valueBytes = 1;
            getValue = (offset) => view.getUint8(offset);
            break;
        case 2: // ASCII
            valueBytes = 1;
            getValue = (offset, length) => {
                let result = '';
                for (let i = 0; i < length; i++) {
                    const char = view.getUint8(offset + i);
                    if (char === 0) break; // Stop at null terminator
                    result += String.fromCharCode(char);
                }
                return result.trim();
            };
            break;
        case 3: // SHORT
            valueBytes = 2;
            getValue = (offset) => view.getUint16(offset, littleEndian);
            break;
        case 4: // LONG
            valueBytes = 4;
            getValue = (offset) => view.getUint32(offset, littleEndian);
            break;
        case 5: // RATIONAL
            valueBytes = 8;
            getValue = (offset) => {
                const num = view.getUint32(offset, littleEndian);
                const den = view.getUint32(offset + 4, littleEndian);
                return den === 0 ? 0 : num / den;
            };
            break;
        case 7: // UNDEFINED
            valueBytes = 1;
            getValue = (offset) => view.getUint8(offset);
            break;
        case 9: // SLONG
            valueBytes = 4;
            getValue = (offset) => view.getInt32(offset, littleEndian);
            break;
        case 10: // SRATIONAL
            valueBytes = 8;
            getValue = (offset) => {
                const num = view.getInt32(offset, littleEndian);
                const den = view.getInt32(offset + 4, littleEndian);
                return den === 0 ? 0 : num / den;
            };
            break;
        default:
            return undefined;
    }
    
    // If the total value size is <= 4 bytes, the value is stored directly in the IFD entry
    if (numValues * valueBytes <= 4) {
        if (dataType === 2) { // ASCII string
            return getValue(entryValueOffset, numValues);
        }
        
        if (numValues === 1) {
            return getValue(entryValueOffset);
        } else {
            const result = [];
            for (let i = 0; i < numValues; i++) {
                result.push(getValue(entryValueOffset + (i * valueBytes)));
            }
            return result;
        }
    } else {
        // Otherwise, it's stored at the offset position
        const offset = tiffStart + valueOffset;
        
        if (dataType === 2) { // ASCII string
            return getValue(offset, numValues);
        }
        
        if (numValues === 1) {
            return getValue(offset);
        } else {
            const result = [];
            for (let i = 0; i < numValues; i++) {
                result.push(getValue(offset + (i * valueBytes)));
            }
            return result;
        }
    }
}

/**
 * Convert tag value to its human-readable form
 * 
 * @param {*} value - The raw tag value
 * @param {number} tagId - The tag ID
 * @param {Object} ifd - The IFD containing the tag
 * @returns {*} - The processed tag value
 */
function formatTagValue(value, tagId, ifd) {
    // Return undefined if value is undefined
    if (value === undefined) return undefined;
    
    // Format based on tag ID
    switch (tagId) {
        case 0x0132: // DateTime
        case 0x9003: // DateTimeOriginal
        case 0x9004: // DateTimeDigitized
            // Format: "YYYY:MM:DD HH:MM:SS"
            if (typeof value === 'string' && value.match(/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/)) {
                const [date, time] = value.split(' ');
                const [year, month, day] = date.split(':');
                const [hour, minute, second] = time.split(':');
                
                // JavaScript months are 0-indexed
                const jsDate = new Date(year, month - 1, day, hour, minute, second);
                return jsDate.toISOString();
            }
            return value;
        default:
            return value;
    }
}

/**
 * Process extracted EXIF data into a structured metadata object
 * 
 * @param {Object} exifData - Raw EXIF data
 * @returns {Object} - Processed metadata
 */
function processExifData(exifData) {
    // Base metadata object
    const metadata = {
        hasExif: !!exifData._exifFound
    };
    
    if (!metadata.hasExif) {
        return metadata;
    }
    
    try {
        const ifd0 = exifData.ifd0 || {};
        const exif = exifData.exif || {};
        const gps = exifData.gps || {};
        
        // Basic image info
        if (ifd0[0x010F]) metadata.make = formatTagValue(ifd0[0x010F].value, 0x010F, ifd0);
        if (ifd0[0x0110]) metadata.model = formatTagValue(ifd0[0x0110].value, 0x0110, ifd0);
        if (ifd0[0x0132]) metadata.dateModified = formatTagValue(ifd0[0x0132].value, 0x0132, ifd0);
        if (ifd0[0x010E]) metadata.imageDescription = formatTagValue(ifd0[0x010E].value, 0x010E, ifd0);
        if (ifd0[0x8298]) metadata.copyright = formatTagValue(ifd0[0x8298].value, 0x8298, ifd0);
        
        // Camera settings
        if (exif[0x829A]) metadata.exposureTime = formatTagValue(exif[0x829A].value, 0x829A, exif);
        if (exif[0x829D]) metadata.fNumber = formatTagValue(exif[0x829D].value, 0x829D, exif);
        if (exif[0x8827]) metadata.isoSpeedRatings = formatTagValue(exif[0x8827].value, 0x8827, exif);
        if (exif[0x9003]) metadata.dateTimeOriginal = formatTagValue(exif[0x9003].value, 0x9003, exif);
        if (exif[0x9004]) metadata.dateTimeDigitized = formatTagValue(exif[0x9004].value, 0x9004, exif);
        if (exif[0x9204]) metadata.exposureBiasValue = formatTagValue(exif[0x9204].value, 0x9204, exif);
        if (exif[0x9207]) metadata.meteringMode = formatTagValue(exif[0x9207].value, 0x9207, exif);
        if (exif[0x9209]) metadata.flash = formatTagValue(exif[0x9209].value, 0x9209, exif);
        if (exif[0x920A]) metadata.focalLength = formatTagValue(exif[0x920A].value, 0x920A, exif);
        
        // Set dateCreated from the available date fields
        metadata.dateCreated = metadata.dateTimeOriginal || metadata.dateTimeDigitized || metadata.dateModified;
        
        // GPS data
        if (gps && Object.keys(gps).length > 0) {
            metadata.hasGpsData = true;
            
            // Extract GPS coordinates if available
            if (gps[0x0001] && gps[0x0002] && gps[0x0003] && gps[0x0004]) {
                // GPS coordinates are stored as rational arrays [degrees, minutes, seconds]
                const latRef = gps[0x0001].value; // 'N' or 'S'
                const latValue = gps[0x0002].value;
                const lonRef = gps[0x0003].value; // 'E' or 'W'
                const lonValue = gps[0x0004].value;
                
                let latitude = 0;
                let longitude = 0;
                
                // Convert to decimal degrees
                if (Array.isArray(latValue) && latValue.length >= 2) {
                    latitude = latValue[0] + (latValue[1] / 60);
                    if (latValue.length >= 3) {
                        latitude += latValue[2] / 3600;
                    }
                    if (latRef === 'S') latitude = -latitude;
                } else if (typeof latValue === 'number') {
                    latitude = latValue;
                    if (latRef === 'S') latitude = -latitude;
                }
                
                if (Array.isArray(lonValue) && lonValue.length >= 2) {
                    longitude = lonValue[0] + (lonValue[1] / 60);
                    if (lonValue.length >= 3) {
                        longitude += lonValue[2] / 3600;
                    }
                    if (lonRef === 'W') longitude = -longitude;
                } else if (typeof lonValue === 'number') {
                    longitude = lonValue;
                    if (lonRef === 'W') longitude = -longitude;
                }
                
                metadata.gpsLatitude = latitude;
                metadata.gpsLongitude = longitude;
                
                // Extract altitude if available
                if (gps[0x0006]) {
                    let altitude = gps[0x0006].value;
                    const altRef = gps[0x0005] ? gps[0x0005].value : 0;
                    
                    // If altRef is 1, altitude is below sea level (negative)
                    if (altRef === 1) altitude = -altitude;
                    
                    metadata.gpsAltitude = altitude;
                }
                
                // Extract GPS timestamp if available
                if (gps[0x0007] && gps[0x001D]) {
                    const timeValue = gps[0x0007].value; // Hours, minutes, seconds
                    const dateStamp = gps[0x001D].value; // Date in "YYYY:MM:DD" format
                    
                    if (Array.isArray(timeValue) && timeValue.length === 3 && dateStamp) {
                        const [year, month, day] = dateStamp.split(':').map(Number);
                        const [hours, minutes, seconds] = timeValue;
                        
                        const gpsDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
                        metadata.gpsTimestamp = gpsDate.getTime();
                        metadata.gpsDateTime = gpsDate.toISOString();
                    }
                }
            }
        }
    } catch (error) {
        console.warn("Error processing EXIF data:", error);
        metadata.processingError = error.message;
    }
    
    return metadata;
}
