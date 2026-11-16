const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Verificar variables de entorno esenciales
if (!process.env.DISCORD_BOT_TOKEN) {
    console.error("[Error crítico] Falta la variable DISCORD_BOT_TOKEN en el entorno.");
}

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co', 
    process.env.SUPABASE_KEY || 'placeholder'
);

const app = express();
app.use(express.json());

// --- 1. ENDPOINTS DE AUTENTICACIÓN (DISCORD OAUTH2) ---

// Redirige al usuario a la página de inicio de sesión de Discord
app.get('/api/auth/discord', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
    const discordOAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify`;
    
    return res.redirect(discordOAuthUrl);
});

// Recibe el código de Discord, obtiene el perfil y lo vincula en Supabase
app.get('/api/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).json({ success: false, error: 'No se proporcionó el código de autorización' });
    }

    try {
        // Intercambiar el código por un token de acceso de Discord
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.DISCORD_REDIRECT_URI,
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            return res.status(400).json({ success: false, error: 'Fallo al autenticar con Discord', details: tokenData });
        }

        // Obtener los datos del usuario de Discord
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                authorization: `Bearer ${tokenData.access_token}`,
            },
        });

        const discordUser = await userResponse.json();

        // Guardar o vincular el usuario en Supabase
        const { error } = await supabase
            .from('user_profiles')
            .upsert({ 
                user_id: discordUser.id, 
                username: discordUser.username,
                avatar: discordUser.avatar,
                updated_at: new Date()
            }, { onConflict: 'user_id' });

        if (error) throw error;

        // Aquí puedes redirigir al usuario de vuelta a tu app móvil/web con éxito
        return res.status(200).json({ 
            success: true, 
            message: 'Cuenta vinculada correctamente con polic',
            user: { id: discordUser.id, username: discordUser.username } 
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});


// --- 2. ENDPOINTS DE TEMAS DE LA CARD ---

app.put('/api/users/:userId/theme', async (req, res) => {
    try {
        const { userId } = req.params;
        const themeConfig = req.body; 

        const { error } = await supabase
            .from('user_themes')
            .upsert({ user_id: userId, theme_data: themeConfig }, { onConflict: 'user_id' });

        if (error) throw error;

        return res.status(200).json({ success: true, theme: themeConfig });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/users/:userId/theme', async (req, res) => {
    try {
        const { userId } = req.params;

        const { data, error } = await supabase
            .from('user_themes')
            .select('theme_data')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return res.status(200).json({
                themeId: 'default',
                backgroundColor: '#1e1e2e',
                textColor: '#cdd6f4'
            });
        }

        return res.status(200).json(data.theme_data);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[API] Servidor corriendo en el puerto ${PORT}`);
});


// --- 3. CONFIGURACIÓN DEL BOT DE DISCORD (polic) ---
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

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!polic card') {
        const userId = message.author.id;

        let currentTheme = { backgroundColor: '#1e1e2e', textColor: '#cdd6f4', themeId: 'Clásico' };
        
        try {
            const { data } = await supabase
                .from('user_themes')
                .select('theme_data')
                .eq('user_id', userId)
                .single();
            if (data) currentTheme = data.theme_data;
        } catch (e) {
            // Usa el tema por defecto si hay error
        }

        const cardEmbed = new EmbedBuilder()
            .setTitle(`🎵 Tarjeta de Reproducción - polic`)
            .setDescription(`Tema activo en tu app: **${currentTheme.themeId || 'Personalizado'}**`)
            .addFields(
                { name: 'Canción Actual', value: 'Artista - Ejemplo de Canción' },
                { name: 'Estilo aplicado', value: `Fondo: ${currentTheme.backgroundColor || '#1e1e2e'}` }
            )
            .setColor(currentTheme.backgroundColor?.startsWith('#') ? currentTheme.backgroundColor : '#5865F2')
            .setTimestamp();

        await message.reply({ embeds: [cardEmbed] });
    }
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    console.error("[Error de Discord] No se pudo iniciar sesión con el token proporcionado:", err.message);
});
