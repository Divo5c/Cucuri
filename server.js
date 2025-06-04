const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

io.on('connection', (socket) => {
  socket.on('chat message', (msg) => {
    io.emit('chat message', msg); // Nachricht an alle senden
  });
});

http.listen(3000, () => {
  console.log('Server läuft auf http://localhost:3000');
});
