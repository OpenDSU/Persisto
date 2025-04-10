/**
 * WebCryptoUtils.cjs - Web Crypto API utilities for both Node.js and browser environments
 */

// Get the Web Crypto API
let crypto;
if (typeof window !== 'undefined') {
    // Browser environment
    crypto = window.crypto;
} else {
    // Node.js environment
    crypto = require('crypto').webcrypto;
}

/**
 * Creates a SHA-256 hash and returns it as base64
 * @param {string|ArrayBuffer|TypedArray} data - The data to hash
 * @returns {Promise<string>} - The base64-encoded hash
 */
async function sha256Base64(data) {
    // Handle empty data
    if (!data) data = '';

    // Convert string to ArrayBuffer
    let dataBuffer;
    if (typeof data === 'string') {
        const encoder = new TextEncoder();
        dataBuffer = encoder.encode(data);
    } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        dataBuffer = data;
    } else {
        // Handle other types by converting to string
        dataBuffer = new TextEncoder().encode(String(data));
    }

    // Generate the hash using the Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

    // Convert to Base64
    return arrayBufferToBase64(hashBuffer);
}

/**
 * Helper function to convert ArrayBuffer to Base64
 * @param {ArrayBuffer} buffer - The ArrayBuffer to convert
 * @returns {string} - The base64-encoded string
 */
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

module.exports = {
    sha256Base64
};