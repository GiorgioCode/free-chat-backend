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

// ===== BUFFER DE MENSAJES EN MEMORIA =====
// Almacenamos los últimos 50 mensajes en memoria para sincronización.
// NOTA: Estos se perderán si Vercel reinicia la función serverless.
const messageBuffer = [];
const MAX_BUFFER_SIZE = 50;
const MESSAGE_RETENTION_MS = 60 * 60 * 1000; // 1 hora

// Función para agregar un mensaje al buffer
function addToBuffer(message) {
    // Agregamos timestamp al mensaje
    const messageWithTimestamp = {
        ...message,
        timestamp: Date.now()
    };

    messageBuffer.push(messageWithTimestamp);

    // Mantenemos solo los últimos MAX_BUFFER_SIZE mensajes
    if (messageBuffer.length > MAX_BUFFER_SIZE) {
        messageBuffer.shift(); // Elimina el primero (más antiguo)
    }

    // Limpiamos mensajes antiguos (más de 1 hora)
    cleanOldMessages();
}

// Función para limpiar mensajes antiguos del buffer
function cleanOldMessages() {
    const now = Date.now();
    const validMessages = messageBuffer.filter(
        msg => (now - msg.timestamp) < MESSAGE_RETENTION_MS
    );
    messageBuffer.length = 0;
    messageBuffer.push(...validMessages);
}

// Función para obtener mensajes recientes (últimos 10 minutos)
function getRecentMessages() {
    const now = Date.now();
    const tenMinutesAgo = now - (10 * 60 * 1000);
    return messageBuffer.filter(msg => msg.timestamp > tenMinutesAgo);
}

// Inicializamos Socket.io con configuración optimizada para Vercel.
const io = new Server(server, {
    // Configuramos CORS específicamente para Socket.io.
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // Configuración de transporte: intentar WebSocket primero, luego polling como fallback.
    // Esto es importante para Vercel que puede tener limitaciones con WebSockets.
    transports: ['websocket', 'polling'],

    // Configuraciones de timeout para mantener la conexión estable.
    // pingTimeout: tiempo máximo sin respuesta antes de considerar la conexión muerta.
    pingTimeout: 60000, // 60 segundos

    // pingInterval: frecuencia de pings para verificar que la conexión sigue viva.
    pingInterval: 25000, // 25 segundos

    // allowUpgrades: permite actualizar de polling a websocket si es posible.
    allowUpgrades: true,

    // Configuraciones de reconexión más agresivas
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionAttempts: 10
});

// Escuchamos el evento 'connection'.
// Este evento se dispara CADA VEZ que un nuevo cliente (usuario) se conecta al servidor.
io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // Enviamos el conteo de usuarios conectados a todos.
    io.emit('user_count', io.engine.clientsCount);

    // ===== SINCRONIZACIÓN DE MENSAJES RECIENTES =====
    // Cuando un usuario se conecta, le enviamos los mensajes recientes.
    // Esto ayuda a que no se pierdan mensajes si hubo una desconexión temporal.
    const recentMessages = getRecentMessages();
    if (recentMessages.length > 0) {
        socket.emit('sync_messages', recentMessages);
        console.log(`Synced ${recentMessages.length} recent messages to ${socket.id}`);
    }

    // Escuchamos un evento personalizado llamado 'join_room'.
    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`User with ID: ${socket.id} joined room: ${room}`);
    });

    // ===== MANEJO DE MENSAJES CON ACKNOWLEDGMENT =====
    // Escuchamos el evento 'send_message' con callback para confirmación.
    // El tercer parámetro 'callback' es una función que se puede invocar para enviar
    // una confirmación (ACK) de vuelta al cliente que envió el mensaje.
    socket.on('send_message', (data, callback) => {
        console.log("Message Received:", data);

        try {
            // Agregamos el mensaje al buffer en memoria
            addToBuffer(data);

            // Transmitimos el mensaje a TODOS los clientes conectados
            io.emit('receive_message', data);

            // Enviamos confirmación (ACK) al remitente
            // Esto le indica que el mensaje fue recibido y procesado exitosamente
            if (callback && typeof callback === 'function') {
                callback({
                    success: true,
                    messageId: data.id,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('Error processing message:', error);

            // Si hay error, notificamos al remitente
            if (callback && typeof callback === 'function') {
                callback({
                    success: false,
                    error: 'Failed to process message'
                });
            }
        }
    });

    // Escuchamos el evento 'disconnect'.
    socket.on('disconnect', () => {
        console.log('User Disconnected', socket.id);

        // Actualizamos el conteo de usuarios
        io.emit('user_count', io.engine.clientsCount);
    });
});

// Ponemos el servidor a escuchar en el puerto especificado por Vercel o 3001 localmente.
server.listen(process.env.PORT || 3001, () => {
    console.log(`SERVER RUNNING ON PORT ${process.env.PORT || 3001}`);
});
