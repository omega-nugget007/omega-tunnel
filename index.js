const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let localClient = null;
let requestIdCounter = 0;
const pendingRequests = new Map();

wss.on('connection', (ws) => {
    console.log('Serveur local connecté au tunnel multi-port !');
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

    // Exemple de routage : 
    // Si l'URL commence par /s1/, on cible le port 4000 et on retire /s1 du chemin
    // Si l'URL commence par /s2/, on cible le port 3000 et on retire /s2 du chemin
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
        targetPort: targetPort, // On envoie le port cible au script local
        method: req.method,
        url: cleanUrl,
        headers: req.headers,
        body: req.body
    }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Relais multi-port actif sur le port ${PORT}`);
});
