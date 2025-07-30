// server.js
const express = require('express');
const cors = require('cors'); // Required for handling Cross-Origin Resource Sharing
const path = require('path'); // Required for path manipulation

const app = express();
const PORT = 3000; // The port your server will listen on

// Middleware to parse JSON request bodies
app.use(express.json());

// Enable CORS for all origins. In a production environment, you would restrict this
// to specific origins for security.
app.use(cors());

// Serve static files from the current directory (where index.html and browser-view.html will be)
app.use(express.static(__dirname));

/**
 * API endpoint to simulate creating a new browser session.
 * This mimics the behavior of the Anchor API session creation.
 */
app.post('/api/create-session', async (req, res) => {
    // Set CORS headers explicitly (though `cors()` middleware already handles this,
    // it's good practice to be aware of what it does).
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle pre-flight OPTIONS requests (handled by `cors()` middleware, but shown for clarity).
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Ensure only POST requests are processed for session creation.
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Simulate a network delay and potential timeout for realism
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout for simulation

    try {
        console.log('Simulating request for session creation...');

        // Simulate a delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500)); // 0.5 to 2.5 seconds delay

        // Check if the request was aborted during the simulated delay
        if (controller.signal.aborted) {
            throw new Error('Simulated request timed out');
        }

        // Generate a unique session ID
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Construct the live view URL pointing to our simulated browser view
        const liveViewUrl = `/browser-view.html?session_id=${sessionId}`;

        // Simulate a successful response
        const data = {
            data: {
                id: sessionId,
                live_view_url: liveViewUrl,
                // You can add other simulated browser properties here if needed
                browser_info: {
                    viewport: { width: 1920, height: 1080 },
                    headless: false
                }
            }
        };

        console.log('Simulated session created:', data);
        res.json(data);

    } catch (error) {
        clearTimeout(timeoutId); // Clear timeout in case of early error

        if (error.message === 'Simulated request timed out') {
            console.error('Simulated request timed out:', error.message);
            res.status(504).json({ error: 'Simulated session creation timed out.' }); // 504 Gateway Timeout
        } else {
            console.error('An unexpected error occurred during simulated session creation:', error);
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    } finally {
        clearTimeout(timeoutId); // Ensure timeout is always cleared
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Cloud Browser API simulation running on http://localhost:${PORT}`);
    console.log(`Access the frontend at http://localhost:${PORT}/index.html`);
});

