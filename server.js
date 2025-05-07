/**
 * Simple Express server for the AI Chat Agent
 * Serves the web app on localhost:3005
 */

const express = require('express');
const path = require('path');
const axios = require('axios');
const app = express();
const PORT = 3005;

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '/')));

// Local proxy to bypass CORS: GET /proxy?url=<encodedURL>
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }
    try {
        const response = await axios.get(targetUrl, { responseType: 'text' });
        // Allow cross-origin access
        res.set('Access-Control-Allow-Origin', '*');
        res.send(response.data);
    } catch (err) {
        console.error('Proxy error:', err.toString());
        res.status(500).send(`Proxy error: ${err.message}`);
    }
});

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`
=================================================
  AI Chat Agent server running!
  
  → Access the app at: http://localhost:${PORT}
  → Press Ctrl+C to stop the server
=================================================
  `);
}); 