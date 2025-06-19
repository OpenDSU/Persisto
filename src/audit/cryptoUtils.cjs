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
 * Creates a SHA-256 hash and returns it as base58 (truncated to 20 characters)
 * @param {string|ArrayBuffer|TypedArray} data - The data to hash
 * @returns {Promise<string>} - The base58-encoded hash (20 characters)
 */
async function sha256Base58(data) {
    const fullHash = await sha256Base58Full(data);
    return fullHash.substring(0, 20);
}

/**
 * Creates a SHA-256 hash and returns the full base58 encoding
 * @param {string|ArrayBuffer|TypedArray} data - The data to hash
 * @returns {Promise<string>} - The full base58-encoded hash
 */
async function sha256Base58Full(data) {
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

    // Convert to Base58
    return arrayBufferToBase58(hashBuffer);
}

/**
 * Helper function to convert ArrayBuffer to Base58
 * @param {ArrayBuffer} buffer - The ArrayBuffer to convert
 * @returns {string} - The base58-encoded string
 */
function arrayBufferToBase58(buffer) {
    const base58 = require('./achillesUtils/base58-node.js');
    const bytes = new Uint8Array(buffer);
    return base58.encode(bytes);
}

module.exports = {
    sha256Base58,
    sha256Base58Full
};
