// server.js
const express = require('express');
const cors = require('cors'); // Required for handling Cross-Origin Resource Sharing
const path = require('path'); // Required for path manipulation
const puppeteer = require('puppeteer'); // Import Puppeteer library

const app = express();
const PORT = 3000; // The port your server will listen on

// Middleware to parse JSON request bodies
app.use(express.json());

// Enable CORS for all origins. In a production environment, you would restrict this
// to specific origins for security (e.g., to your frontend's domain).
app.use(cors());

// Serve static files from the current directory (where index.html and browser-view-placeholder.html will be)
app.use(express.static(__dirname));

// Global map to store active browser sessions (each session holds a Puppeteer browser and page instance)
// Key: sessionId (string), Value: { browser: Puppeteer.Browser, page: Puppeteer.Page }
const activeBrowserSessions = new Map();

/**
 * API endpoint to create a new browser session using Puppeteer.
 * This will launch a real browser instance (or a new page in an existing browser pool).
 * For simplicity, each session currently launches a new browser instance.
 */
app.post('/api/create-session', async (req, res) => {
    // Set CORS headers explicitly (though `cors()` middleware already handles this).
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle pre-flight OPTIONS requests.
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Ensure only POST requests are processed for session creation.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const controller = new AbortController();
    // Set a longer timeout for real browser launch, as it can take time.
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

    let browserInstance; // Declare browserInstance outside try-catch for finally block access
    let pageInstance;    // Declare pageInstance outside try-catch for finally block access

    try {
        console.log('Initiating real browser launch for session creation...');

        // Launch a new headless browser instance using Puppeteer.
        // `headless: true` means the browser runs in the background without a visible UI.
        // `args` are important for running Puppeteer reliably in various environments (e.g., Docker).
        browserInstance = await puppeteer.launch({
            headless: true, // Set to false for debugging to see the browser UI
            args: [
                '--no-sandbox', // Essential for running as root in some environments
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Overcomes limited /dev/shm usage in some Docker setups
                '--disable-accelerated-2d-canvas', // Disables hardware acceleration for 2D canvas
                '--disable-gpu', // Disables GPU hardware acceleration
                '--window-size=1920,1080' // Set default browser window size
            ]
        });

        // Create a new page within the launched browser instance.
        pageInstance = await browserInstance.newPage();
        // Set the viewport size for the new page.
        await pageInstance.setViewport({ width: 1920, height: 1080 });

        // Generate a unique session ID for this browser instance.
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        // Store the browser and page instances in our global map, associated with the session ID.
        activeBrowserSessions.set(sessionId, { browser: browserInstance, page: pageInstance });

        // For now, the `live_view_url` will be a placeholder.
        // A truly "live view" would involve streaming technologies (WebSockets, WebRTC)
        // which are significantly more complex to implement.
        // The frontend will use this sessionId to request screenshots.
        const liveViewUrl = `/browser-view-placeholder.html?session_id=${sessionId}`; // Points to a simple placeholder page

        console.log(`Real browser session created with ID: ${sessionId}`);
        res.json({
            data: {
                id: sessionId,
                live_view_url: liveViewUrl, // This URL will be used by the frontend to identify the session
                browser_info: {
                    viewport: { width: 1920, height: 1080 },
                    headless: true // Reflects the actual headless state of the browser
                }
            }
        });

    } catch (error) {
        clearTimeout(timeoutId); // Clear timeout in case of an error before completion
        // If a browser instance was launched but an error occurred later, try to close it.
        if (browserInstance) {
            await browserInstance.close().catch(e => console.error("Error closing browser during error handling:", e));
        }

        if (error.name === 'AbortError') {
            console.error('Request for browser launch timed out:', error.message);
            res.status(504).json({ error: 'Browser launch timed out.' }); // 504 Gateway Timeout
        } else {
            console.error('An unexpected error occurred during browser launch:', error);
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    } finally {
        clearTimeout(timeoutId); // Ensure timeout is always cleared
    }
});

/**
 * API endpoint to navigate a specific browser session to a given URL.
 * Requires `sessionId` and `url` in the request body.
 */
app.post('/api/navigate', async (req, res) => {
    const { sessionId, url } = req.body;

    if (!sessionId || !url) {
        return res.status(400).json({ error: 'Session ID and URL are required.' });
    }

    const sessionData = activeBrowserSessions.get(sessionId);
    if (!sessionData || !sessionData.page) {
        return res.status(404).json({ error: 'Session not found or invalid. Please create a new session.' });
    }

    try {
        console.log(`Navigating session ${sessionId} to ${url}...`);
        // Navigate the Puppeteer page to the specified URL.
        // `waitUntil: 'networkidle2'` waits until there are no more than 2 network connections for at least 500 ms.
        // `timeout` sets a maximum time for navigation.
        await sessionData.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        console.log(`Successfully navigated session ${sessionId} to ${url}.`);
        res.json({ success: true, message: `Navigated to ${url}` });
    } catch (error) {
        console.error(`Error navigating session ${sessionId} to ${url}:`, error);
        res.status(500).json({ error: error.message || 'Failed to navigate.' });
    }
});

/**
 * API endpoint to get a screenshot of the current content of a specific browser page.
 * Requires `sessionId` as a URL parameter.
 * Returns a base64 encoded image.
 */
app.get('/api/screenshot/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    const sessionData = activeBrowserSessions.get(sessionId);
    if (!sessionData || !sessionData.page) {
        return res.status(404).json({ error: 'Session not found or invalid. Please create a new session.' });
    }

    try {
        console.log(`Taking screenshot for session ${sessionId}...`);
        // Take a screenshot of the Puppeteer page and encode it as base64.
        const screenshotBuffer = await sessionData.page.screenshot({ encoding: 'base64' });
        console.log(`Screenshot taken for session ${sessionId}.`);
        // Send the base64 image data and its MIME type in the response.
        res.json({ success: true, image: screenshotBuffer, mimeType: 'image/png' });
    } catch (error) {
        console.error(`Error taking screenshot for session ${sessionId}:`, error);
        res.status(500).json({ error: error.message || 'Failed to take screenshot.' });
    }
});

/**
 * API endpoint to close a specific browser session.
 * Requires `sessionId` in the request body.
 */
app.post('/api/close-session', async (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required.' });
    }

    const sessionData = activeBrowserSessions.get(sessionId);
    if (!sessionData) {
        return res.status(404).json({ error: 'Session not found.' });
    }

    try {
        console.log(`Closing session ${sessionId}...`);
        // Close the entire Puppeteer browser instance associated with the session.
        await sessionData.browser.close();
        // Remove the session from our active sessions map.
        activeBrowserSessions.delete(sessionId);
        console.log(`Session ${sessionId} closed successfully.`);
        res.json({ success: true, message: `Session ${sessionId} closed.` });
    } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
        res.status(500).json({ error: error.message || 'Failed to close session.' });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Cloud Browser API running on http://localhost:${PORT}`);
    console.log(`Access the frontend at http://localhost:${PORT}/index.html`);
});

// Graceful shutdown: Close all active browser sessions when the server is stopped.
process.on('SIGINT', async () => {
    console.log('Server shutting down. Closing all active browser sessions...');
    for (const [sessionId, sessionData] of activeBrowserSessions.entries()) {
        try {
            // Ensure each browser instance is properly closed.
            await sessionData.browser.close();
            console.log(`Closed session ${sessionId}`);
        } catch (e) {
            console.error(`Error closing session ${sessionId} during shutdown:`, e);
        }
    }
    console.log('All browser sessions closed. Exiting process.');
    process.exit(0); // Exit the Node.js process
});
