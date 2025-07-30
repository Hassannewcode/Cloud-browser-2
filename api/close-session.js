// api/close-session.js
// This file will handle closing a specific browser session.

const { chromium } = require('playwright-chromium');

// IMPORTANT: This in-memory map will NOT persist across Vercel function invocations.
// In a real Vercel setup, you would need to connect to an existing browser instance
// (e.g., via a remote browser service's WebSocket endpoint or API).
const activeBrowserSessions = new Map(); // Placeholder - will be empty on new invocations

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required.' });
    }

    // In a real Vercel deployment, you would typically connect to a remote browser
    // using the sessionId to identify the specific browser instance, then close it.
    const sessionData = activeBrowserSessions.get(sessionId);

    let browserInstance;

    try {
        if (sessionData && sessionData.browser) {
            // If running locally with a persistent server, use the existing browser.
            browserInstance = sessionData.browser;
            console.log(`Closing existing browser for session ${sessionId}.`);
        } else {
            // IMPORTANT FOR VERCEL: If not using a persistent remote service,
            // and the session was not found in memory, there's nothing to close here.
            // In a real scenario, you'd send a "close" command to your remote browser service.
            console.log(`No existing browser found for session ${sessionId}. Assuming it's already closed or remote.`);
            return res.status(200).json({ success: true, message: `Session ${sessionId} (possibly remote) considered closed.` });
        }

        await browserInstance.close();
        activeBrowserSessions.delete(sessionId); // Remove from local map
        console.log(`Session ${sessionId} closed successfully.`);
        res.status(200).json({ success: true, message: `Session ${sessionId} closed.` });

    } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
        res.status(500).json({ error: error.message || 'Failed to close session.' });
    }
}
