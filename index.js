const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);

// Augmente la limite de taille pour accepter les gros transferts (APK, photos)
app.use(express.raw({ type: '*/*', limit: '100mb' }));

const wss = new WebSocketServer({ server });

let localClient = null;
let requestIdCounter = 0;
const pendingRequests = new Map();

wss.on('connection', (ws) => {
    console.log('Serveur local connecté au tunnel !');
    localClient = ws;

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const resInfo = pendingRequests.get(data.id);
        if (resInfo) {
            resInfo.res.writeHead(data.status, data.headers);
            resInfo.res.end(Buffer.from(data.body, 'base64'));
            pendingRequests.delete(data.id);
        }
    });

    ws.on('close', () => {
        console.log('Serveur local déconnecté.');
        localClient = null;
    });
});

app.use((req, res) => {
    if (!localClient || localClient.readyState !== WebSocket.OPEN) {
        return res.status(502).send('Tunnel fermé : le serveur local ne répond pas.');
    }

    let targetPort = 4000;
    let cleanUrl = req.url;

    if (req.url.startsWith('/s1/')) {
        targetPort = 4000;
        cleanUrl = req.url.replace('/s1', '') || '/';
    } else if (req.url.startsWith('/s2/')) {
        targetPort = 3000;
        cleanUrl = req.url.replace('/s2', '') || '/';
    }

    const reqId = requestIdCounter++;
    pendingRequests.set(reqId, { res });

    localClient.send(JSON.stringify({
        id: reqId,
        targetPort: targetPort,
        method: req.method,
        url: cleanUrl,
        headers: req.headers,
        body: req.body ? Buffer.from(req.body).toString('base64') : null
    }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Relais tunnel actif sur le port ${PORT}`);
});
