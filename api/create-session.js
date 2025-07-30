// api/create-session.js
// This file will handle the creation of a new browser session.

// Import Playwright's core library
const { chromium } = require('playwright-core');
// Import @sparticuz/chromium for Vercel compatibility
const chromiumLambda = require('@sparticuz/chromium');

// IMPORTANT: This in-memory map will NOT persist across Vercel function invocations.
// Each API call is a new execution environment. For a persistent solution,
// you would need to manage sessions externally (e.g., a database, or
// by connecting to a long-running remote browser service that manages browser instances).
const activeBrowserSessions = new Map();

// Helper function to launch a browser instance.
// This is extracted to potentially be reusable or modified for remote browser services.
async function launchBrowser() {
    // Determine the executable path for Chromium.
    // On Vercel, @sparticuz/chromium provides the path to the bundled executable.
    // Locally, playwright-core might find it automatically, or you can specify it.
    const executablePath = await chromiumLambda.executablePath();
    console.log('Chromium Executable Path:', executablePath); // Log the path

    const launchArgs = chromiumLambda.args; // Get recommended args from @sparticuz/chromium
    console.log('Chromium Launch Arguments:', launchArgs); // Log the arguments

    // Launch a new headless Chromium browser instance using Playwright.
    // We pass the executablePath from @sparticuz/chromium and specific args
    // for serverless environments.
    const browser = await chromium.launch({
        executablePath: executablePath, // Use the executable path provided by @sparticuz/chromium
        headless: true, // Explicitly true for headless mode
        args: launchArgs // Use recommended args from @sparticuz/chromium for serverless
    });
    return browser;
}

// Main handler for the Vercel API route.
export default async function handler(req, res) {
    // Set CORS headers to allow requests from any origin.
    // In a production environment, you would restrict this to specific origins.
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

    let browserInstance;
    let pageInstance;

    try {
        console.log('Attempting to create a new browser session...');

        // Launch a new browser instance for this session.
        // In a real Vercel setup with persistent sessions, you'd connect to an existing browser.
        browserInstance = await launchBrowser();
        pageInstance = await browserInstance.newPage();
        await pageInstance.setViewportSize({ width: 1920, height: 1080 }); // Playwright uses setViewportSize

        // Generate a unique session ID.
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // IMPORTANT: For Vercel, this in-memory map will NOT work across requests.
        // This is primarily for local testing where the Node.js server is persistent.
        // For Vercel, you would typically use a remote browser service's session ID
        // and manage its lifecycle via their API.
        activeBrowserSessions.set(sessionId, { browser: browserInstance, page: pageInstance });

        console.log(`Browser session created with ID: ${sessionId}`);

        // Return the session ID to the client. The client will use this ID
        // for subsequent interactions (navigate, close).
        res.status(200).json({
            data: {
                id: sessionId,
                // The live_view_url is now purely conceptual for the frontend.
                // Without screenshot or direct streaming, the frontend will just know a session exists.
                live_view_url: `/browser-view-placeholder.html?session_id=${sessionId}`,
                browser_info: {
                    viewport: { width: 1920, height: 1080 },
                    headless: true
                }
            }
        });

    } catch (error) {
        console.error('Error creating browser session:', error);
        // Check for the specific libnss3.so error message in the error stack
        if (error.message && error.message.includes('libnss3.so')) {
            res.status(500).json({
                error: 'Failed to launch browser: Missing system dependency (libnss3.so). This often requires specific Vercel build configurations or a remote browser service.',
                details: error.message
            });
        } else {
            // Attempt to close the browser if it was launched but an error occurred.
            if (browserInstance) {
                await browserInstance.close().catch(e => console.error("Error closing browser during error handling:", e));
            }
            res.status(500).json({ error: error.message || 'Internal server error during session creation.' });
        }
    }
    // Note: In a true serverless function, the browser instance should ideally be closed
    // after its use if it's not being managed by an external service.
    // However, for a multi-action session, this implies a more complex state management.
}
