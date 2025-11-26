import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Sanitize credentials like Django backend does
function sanitizeToken(token) {
    if (!token) return '';
    let sanitized = token.trim();
    if (sanitized.toLowerCase().startsWith('bearer ')) {
        sanitized = sanitized.split(' ', 1)[1].trim();
    }
    sanitized = sanitized.replace(/\n/g, '').replace(/\r/g, '').replace(/\t/g, '').replace(/ /g, '');
    sanitized = sanitized.replace(/"/g, '').replace(/'/g, '');
    return sanitized;
}

// JWT regex validation like Django
const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const PINATA_JWT = sanitizeToken(process.env.PINATA_JWT);
const PINATA_API_KEY = sanitizeToken(process.env.PINATA_API_KEY);
const PINATA_SECRET = sanitizeToken(process.env.PINATA_API_SECRET);

// Configuration
const CONFIG = {
    maxRetries: 3,
    retryDelay: 1000, // ms
    timeout: 60000,
    testTimeout: 10000
};

// Validate credentials on module load
const hasJWT = PINATA_JWT && JWT_REGEX.test(PINATA_JWT);
const hasApiKey = !!(PINATA_API_KEY && PINATA_SECRET);

if (!hasJWT && !hasApiKey) {
    console.error('[IPFS] ERROR: No Pinata credentials found in environment variables!');
    console.error('[IPFS] Please set either PINATA_JWT or both PINATA_API_KEY and PINATA_SECRET');
}

console.log('[IPFS] Credentials check:', {
    jwt: hasJWT,
    apiKey: hasApiKey,
    preferred: hasJWT ? 'JWT' : hasApiKey ? 'API Key' : 'None'
});

/**
 * Format error for better debugging
 */
function formatError(error) {
    if (error.response) {
        return {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            message: error.message
        };
    }
    return {
        message: error.message,
        name: error.name,
        stack: error.stack
    };
}

/**
 * Delay helper for retries
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload to Pinata using JWT authentication
 */
async function uploadToPinataJWT(fileBuffer, filename) {
    console.log('[IPFS] Uploading with JWT method...');
    
    if (!PINATA_JWT) {
        throw new Error('PINATA_JWT is not configured');
    }
    
    const formData = new FormData();
    formData.append('file', fileBuffer, {
        filename: filename,
        contentType: 'application/octet-stream'
    });

    const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        {
            headers: {
                'Authorization': `Bearer ${PINATA_JWT}`,
                ...formData.getHeaders()
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: CONFIG.timeout
        }
    );

    return response.data.IpfsHash;
}

/**
 * Upload to Pinata using API Key/Secret authentication
 */
async function uploadToPinataApiKey(fileBuffer, filename) {
    console.log('[IPFS] Uploading with API Key method...');
    
    if (!PINATA_API_KEY || !PINATA_SECRET) {
        throw new Error('PINATA_API_KEY and PINATA_SECRET are not configured');
    }
    
    const formData = new FormData();
    formData.append('file', fileBuffer, {
        filename: filename,
        contentType: 'application/octet-stream'
    });

    const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        {
            headers: {
                'pinata_api_key': PINATA_API_KEY,
                'pinata_secret_api_key': PINATA_SECRET,
                ...formData.getHeaders()
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: CONFIG.timeout
        }
    );

    return response.data.IpfsHash;
}

/**
 * Test Pinata authentication
 */
export async function testPinataConnection() {
    console.log('[IPFS] Testing Pinata connection...');
    
    if (!hasJWT && !hasApiKey) {
        return { 
            success: false, 
            error: 'No Pinata credentials configured' 
        };
    }
    
    try {
        const testUrl = 'https://api.pinata.cloud/data/testAuthentication';
        
        // Try JWT first (recommended by Pinata)
        if (hasJWT) {
            console.log('[IPFS] Testing with JWT...');
            const response = await axios.get(testUrl, {
                headers: {
                    'Authorization': `Bearer ${PINATA_JWT}`
                },
                timeout: CONFIG.testTimeout
            });
            console.log('[IPFS] JWT authentication successful');
            return { success: true, method: 'JWT', data: response.data };
        }
        
        // Fallback to API Key
        if (hasApiKey) {
            console.log('[IPFS] Testing with API Key...');
            const response = await axios.get(testUrl, {
                headers: {
                    'pinata_api_key': PINATA_API_KEY,
                    'pinata_secret_api_key': PINATA_SECRET
                },
                timeout: CONFIG.testTimeout
            });
            console.log('[IPFS] API Key authentication successful');
            return { success: true, method: 'API_KEY', data: response.data };
        }
        
        return { success: false, error: 'No valid credentials found' };
    } catch (error) {
        const formattedError = formatError(error);
        console.error('[IPFS] Authentication test failed:', formattedError);
        return { 
            success: false, 
            error: error.response?.data?.error || error.message,
            status: error.response?.status,
            details: formattedError
        };
    }
}

/**
 * Upload with retry logic
 */
async function uploadWithRetry(uploadFn, fileBuffer, filename, methodName) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
        try {
            console.log(`[IPFS] Upload attempt ${attempt}/${CONFIG.maxRetries} with ${methodName}...`);
            const hash = await uploadFn(fileBuffer, filename);
            console.log(`[IPFS] Upload successful on attempt ${attempt}:`, hash);
            return hash;
        } catch (error) {
            lastError = error;
            const isLastAttempt = attempt === CONFIG.maxRetries;
            
            // Check if error is retryable
            const isRetryable = !error.response || 
                               error.response.status >= 500 || 
                               error.code === 'ECONNRESET' ||
                               error.code === 'ETIMEDOUT';
            
            if (!isRetryable || isLastAttempt) {
                console.error(`[IPFS] ${methodName} upload failed:`, formatError(error));
                throw error;
            }
            
            const retryDelay = CONFIG.retryDelay * attempt;
            console.warn(`[IPFS] ${methodName} attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
            await delay(retryDelay);
        }
    }
    
    throw lastError;
}

/**
 * Main upload function with automatic fallback and retry
 */
export async function uploadToIPFS(fileBuffer, filename, options = {}) {
    const startTime = Date.now();
    console.log('[IPFS] Starting upload process...', {
        fileSize: fileBuffer?.length,
        filename,
        skipAuthTest: options.skipAuthTest
    });

    // Validate input
    if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('File buffer is empty or invalid');
    }

    if (!filename || typeof filename !== 'string') {
        throw new Error('Invalid filename provided');
    }

    // Check credentials
    if (!hasJWT && !hasApiKey) {
        throw new Error('No Pinata credentials configured. Please set PINATA_JWT or PINATA_API_KEY/PINATA_SECRET');
    }

    // Optional: Skip auth test for faster uploads (useful after first successful upload)
    if (!options.skipAuthTest) {
        const authTest = await testPinataConnection();
        if (!authTest.success) {
            throw new Error(`Pinata authentication failed: ${authTest.error}`);
        }
        console.log('[IPFS] Pre-upload authentication successful');
    }

    const errors = [];

    // Try JWT first (recommended by Pinata)
    if (hasJWT) {
        try {
            const hash = await uploadWithRetry(uploadToPinataJWT, fileBuffer, filename, 'JWT');
            const duration = Date.now() - startTime;
            console.log(`[IPFS] Upload completed in ${duration}ms`);
            return hash;
        } catch (error) {
            errors.push({ method: 'JWT', error: formatError(error) });
        }
    }

    // Try API Key as fallback
    if (hasApiKey) {
        try {
            const hash = await uploadWithRetry(uploadToPinataApiKey, fileBuffer, filename, 'API Key');
            const duration = Date.now() - startTime;
            console.log(`[IPFS] Upload completed in ${duration}ms`);
            return hash;
        } catch (error) {
            errors.push({ method: 'API_KEY', error: formatError(error) });
        }
    }

    // All methods failed
    console.error('[IPFS] All upload methods failed:', errors);
    throw new Error(
        `All IPFS upload methods failed after ${CONFIG.maxRetries} retries. ` +
        `Errors: ${errors.map(e => `${e.method}: ${e.error.message}`).join('; ')}`
    );
}

/**
 * Upload with metadata (optional Pinata feature)
 */
export async function uploadToIPFSWithMetadata(fileBuffer, filename, metadata = {}) {
    console.log('[IPFS] Uploading with metadata:', metadata);
    
    const formData = new FormData();
    formData.append('file', fileBuffer, {
        filename: filename,
        contentType: 'application/octet-stream'
    });
    
    // Add metadata if provided
    if (Object.keys(metadata).length > 0) {
        formData.append('pinataMetadata', JSON.stringify({
            name: metadata.name || filename,
            keyvalues: metadata.keyvalues || {}
        }));
    }
    
    // Add pinata options if provided
    if (metadata.pinataOptions) {
        formData.append('pinataOptions', JSON.stringify(metadata.pinataOptions));
    }

    const headers = hasJWT 
        ? { 'Authorization': `Bearer ${PINATA_JWT}`, ...formData.getHeaders() }
        : { 
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET,
            ...formData.getHeaders()
        };

    const response = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        formData,
        {
            headers,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: CONFIG.timeout
        }
    );

    return response.data;
}

// Export functions
export default { 
    uploadToIPFS, 
    uploadToIPFSWithMetadata,
    testPinataConnection,
    uploadToPinataJWT,
    uploadToPinataApiKey,
    CONFIG
};