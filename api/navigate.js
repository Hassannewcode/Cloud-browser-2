// api/navigate.js
// This file will handle navigating a specific browser session to a URL.

const { chromium } = require('playwright-chromium');

// IMPORTANT: This in-memory map will NOT persist across Vercel function invocations.
// Each API call (e.g., create-session, navigate, close-session) on Vercel
// runs in a new, isolated serverless function instance. Therefore,
// `activeBrowserSessions` will be empty at the start of each new invocation.
// For a truly persistent, multi-action browser session across Vercel invocations,
// you would need to manage the browser instance externally. This typically involves:
// 1. A long-running remote browser service (e.g., Browserless.io, Playwright Cloud, or your own dedicated server).
// 2. Storing the `browserWSEndpoint` (WebSocket URL to connect to the browser) in a persistent database
//    (like Redis, Firestore, or a simple key-value store) when a session is created.
// 3. In subsequent `navigate` or `close-session` calls, retrieving this `browserWSEndpoint`
//    from the database using the `sessionId` and then connecting to it using `chromium.connect()`.
const activeBrowserSessions = new Map(); // This map is primarily for local development with a persistent Node.js server.

export default async function handler(req, res) {
    // Set CORS headers to allow requests from any origin.
    // In a production environment, you would restrict this to specific origins for security.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle pre-flight OPTIONS requests.
    // Browsers send an OPTIONS request before the actual POST request
    // to check if the server allows the intended method and headers.
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Ensure only POST requests are processed for navigation.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { sessionId, url } = req.body;

    if (!sessionId || !url) {
        return res.status(400).json({ error: 'Session ID and URL are required in the request body.' });
    }

    // Attempt to retrieve session data from the in-memory map.
    // This will only work if running locally with a single, persistent Node.js server.
    // On Vercel, this will almost always be empty.
    const sessionData = activeBrowserSessions.get(sessionId);

    let browserInstance;
    let pageInstance;
    let browserWasNewlyLaunched = false; // Flag to track if we launched a browser in this function

    try {
        if (sessionData && sessionData.page) {
            // If running locally with a persistent server, reuse the existing browser and page instances.
            browserInstance = sessionData.browser;
            pageInstance = sessionData.page;
            console.log(`Reusing existing page for session ${sessionId}.`);
        } else {
            // This block is crucial for Vercel's stateless functions.
            // Since we cannot rely on the in-memory map for persistence,
            // we have to launch a new browser instance for this specific request.
            // In a production cloud browser, you would `chromium.connect()` to a
            // pre-existing remote browser instance using its WebSocket endpoint
            // (which would have been stored in a database during `create-session`).
            console.log(`No existing page found in memory for session ${sessionId}. Launching a new browser for this request.`);
            browserInstance = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080'
                ]
            });
            pageInstance = await browserInstance.newPage();
            await pageInstance.setViewportSize({ width: 1920, height: 1080 });
            browserWasNewlyLaunched = true; // Mark that we launched a browser here
        }

        console.log(`Navigating session ${sessionId} to ${url}...`);
        // Navigate the Playwright page to the specified URL.
        // `waitUntil: 'networkidle'` waits until there are no more than 0 network connections for at least 500 ms.
        // This is generally more reliable than 'domcontentloaded' or 'load' for single-page applications.
        // `timeout` sets a maximum time for navigation to prevent hanging.
        await pageInstance.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        console.log(`Successfully navigated session ${sessionId} to ${url}.`);

        // Respond with success. The frontend will update its display based on this.
        res.status(200).json({ success: true, message: `Navigated to ${url}` });

    } catch (error) {
        console.error(`Error navigating session ${sessionId} to ${url}:`, error);
        // Provide a more specific error message if it's a navigation timeout
        if (error.name === 'TimeoutError') {
            res.status(504).json({ error: `Navigation to ${url} timed out.` });
        } else {
            res.status(500).json({ error: error.message || 'Failed to navigate the browser.' });
        }
    } finally {
        // IMPORTANT FOR VERCEL: If we launched a new browser instance within this function
        // (because it's a stateless serverless environment and we couldn't connect to a persistent one),
        // we MUST close it here to prevent resource leaks and ensure the function completes cleanly.
        // If you were connecting to a persistent remote browser service, you would NOT close it here.
        if (browserWasNewlyLaunched && browserInstance) {
            await browserInstance.close().catch(e => console.error("Error closing newly launched browser after navigate:", e));
        }
    }
}
