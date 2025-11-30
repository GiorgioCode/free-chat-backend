// Importamos el framework Express para manejar rutas y configuraciones básicas del servidor HTTP.
const express = require('express');

// Importamos el módulo nativo 'http' de Node.js. 
// Es necesario para crear el servidor que Socket.io utilizará.
const http = require('http');

// Importamos la clase 'Server' de la librería 'socket.io'.
// Esta clase es la que nos permite crear un servidor de WebSockets.
const { Server } = require('socket.io');

// Importamos 'cors' (Cross-Origin Resource Sharing).
// Esto es vital para permitir que nuestro frontend (que corre en otro puerto) se comunique con este backend.
const cors = require('cors');

// Inicializamos la aplicación de Express.
const app = express();

// Usamos el middleware de CORS en Express.
// Esto permite peticiones HTTP desde otros orígenes.
app.use(cors());

// Creamos el servidor HTTP usando nuestra app de Express.
// Socket.io necesita un servidor HTTP nativo para "montarse" sobre él.
const server = http.createServer(app);

// Inicializamos Socket.io pasándole nuestro servidor HTTP.
// Aquí es donde ocurre la magia de la conexión en tiempo real.
const io = new Server(server, {
    // Configuramos CORS específicamente para Socket.io.
    cors: {
        // 'origin: "*"' significa que permitimos conexiones desde CUALQUIER dirección web.
        // En producción, deberías poner aquí la URL específica de tu frontend (ej: "http://localhost:5173") por seguridad.
        origin: "*",
        // Permitimos los métodos HTTP básicos GET y POST para el handshake inicial de Socket.io.
        methods: ["GET", "POST"]
    }
});

// Escuchamos el evento 'connection'.
// Este evento se dispara CADA VEZ que un nuevo cliente (usuario) se conecta al servidor.
// 'socket' es un objeto que representa la conexión única con ESE usuario específico.
io.on('connection', (socket) => {
    // Imprimimos en la consola del servidor el ID único de la conexión.
    // Cada vez que refrescas la página, obtienes un nuevo ID.
    console.log(`User Connected: ${socket.id}`);

    // 'io.emit' envía un mensaje a TODOS los clientes conectados, incluyendo al que acaba de entrar.
    // Aquí enviamos el evento 'user_count' con el número total de clientes conectados actualmente.
    // 'io.engine.clientsCount' es una propiedad interna que nos da ese número.
    io.emit('user_count', io.engine.clientsCount);

    // Escuchamos un evento personalizado llamado 'join_room'.
    // Esto permite agrupar usuarios en "salas" separadas (como canales de chat).
    socket.on('join_room', (room) => {
        // El método 'join' mete a este socket específico en la sala indicada.
        socket.join(room);
        console.log(`User with ID: ${socket.id} joined room: ${room}`);
    });

    // Escuchamos el evento 'send_message' que viene del frontend.
    // 'data' es la información que nos envía el usuario (el texto del mensaje, su ID, etc.).
    socket.on('send_message', (data) => {
        console.log("Message Received:", data);

        // Cuando recibimos un mensaje, queremos reenviarlo a TODOS los demás para que lo vean.
        // Usamos 'io.emit' para transmitir el evento 'receive_message' con los mismos datos a todo el mundo.
        // Si usáramos 'socket.emit', solo le responderíamos al usuario que envió el mensaje.
        // Si usáramos 'socket.broadcast.emit', se lo enviaríamos a todos MENOS al que lo envió.
        io.emit('receive_message', data);
    });

    // Escuchamos el evento 'disconnect'.
    // Se dispara cuando un usuario cierra la pestaña o pierde la conexión.
    socket.on('disconnect', () => {
        console.log('User Disconnected', socket.id);

        // Como alguien se fue, el contador de usuarios ha cambiado.
        // Volvemos a emitir el conteo actualizado a todos los que quedan conectados.
        io.emit('user_count', io.engine.clientsCount);
    });
});

// Ponemos el servidor a escuchar en el puerto 3001.
// Es importante que este puerto sea diferente al del frontend (que suele ser 5173 con Vite).
server.listen(3001, () => {
    console.log('SERVER RUNNING ON PORT 3001');
});
