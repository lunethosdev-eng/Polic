const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
require('dotenv').config();

// --- 1. CONFIGURACIÓN DE EXPRESS (API PARA TU APP) ---
const app = express();
app.use(express.json());

// Base de datos simulada en memoria (puedes cambiarla por MongoDB, PostgreSQL, etc.)
// Aquí guardamos los temas personalizados por userId que vienen desde tu app
const userThemes = new Map();

// Endpoint para que tu app actualice el tema de la card en tiempo real
app.put('/api/users/:userId/theme', (req, res) => {
    const { userId } = req.params;
    const themeConfig = req.body; // Ej: { backgroundColor, textColor, themeId }

    // Guardamos la configuración
    userThemes.set(userId, themeConfig);

    console.log(`[API] Tema actualizado en tiempo real para el usuario ${userId}:`, themeConfig);
    
    return res.status(200).json({ 
        success: true, 
        message: 'Tema actualizado correctamente', 
        theme: themeConfig 
    });
});

// Endpoint para que el bot u otros servicios consulten el tema actual
app.get('/api/users/:userId/theme', (req, res) => {
    const { userId } = req.params;
    const theme = userThemes.get(userId) || {
        themeId: 'default',
        backgroundColor: '#1e1e2e',
        textColor: '#cdd6f4'
    };
    return res.status(200).json(theme);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[API] Servidor corriendo en el puerto ${PORT}`);
});


// --- 2. CONFIGURACIÓN DEL BOT DE DISCORD (polic) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once('ready', () => {
    console.log(`[Bot] ¡${client.user.tag} (polic) está conectado y listo!`);
});

// Ejemplo de comando de texto o interacción que genera la card personalizada
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Comando básico: !polic card
    if (message.content === '!polic card') {
        const userId = message.author.id;

        // Obtenemos el tema personalizado (simulando la consulta a la API / base de datos)
        const currentTheme = userThemes.get(userId) || {
            backgroundColor: '#1e1e2e',
            textColor: '#cdd6f4',
            themeId: 'Clásico'
        };

        // Creamos una card usando Embeds de Discord adaptada al tema del usuario
        const cardEmbed = new EmbedBuilder()
            .setTitle(`🎵 Tarjeta de Reproducción - polic`)
            .setDescription(`Tema activo en tu app: **${currentTheme.themeId}**`)
            .addFields(
                { name: 'Canción Actual', value: 'Artista - Ejemplo de Canción' },
                { name: 'Estilo aplicado', value: `Fondo: ${currentTheme.backgroundColor}` }
            )
            .setColor(currentTheme.backgroundColor.startsWith('#') ? currentTheme.backgroundColor : '#5865F2')
            .setTimestamp();

        await message.reply({ embeds: [cardEmbed] });
    }
});

// Iniciar sesión del bot con el Token de Discord
client.login(process.env.DISCORD_BOT_TOKEN);
