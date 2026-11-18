const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

if (!process.env.DISCORD_BOT_TOKEN) {
    console.error("[Error crítico] Falta la variable DISCORD_BOT_TOKEN en el entorno.");
}

const supabase = createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co', 
    process.env.SUPABASE_KEY || 'placeholder'
);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 1. ENDPOINTS DE AUTENTICACIÓN (DISCORD OAUTH2) ---

app.get('/api/auth/discord', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI);
    const discordOAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify`;
    
    return res.redirect(discordOAuthUrl);
});

app.get('/api/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).json({ success: false, error: 'No se proporcionó el código de autorización' });
    }

    try {
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

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                authorization: `Bearer ${tokenData.access_token}`,
            },
        });

        const discordUser = await userResponse.json();

        const { error } = await supabase
            .from('user_profiles')
            .upsert({ 
                user_id: discordUser.id, 
                username: discordUser.username,
                avatar: discordUser.avatar,
                updated_at: new Date()
            }, { onConflict: 'user_id' });

        if (error) throw error;

        // Devuelve JSON puro para que tu app cliente lo maneje como prefiera
        return res.status(200).json({
            success: true,
            message: 'Cuenta vinculada correctamente',
            user: {
                id: discordUser.id,
                username: discordUser.username,
                avatar: discordUser.avatar
            }
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});


// --- 2. ENDPOINTS DE MÚSICA Y LETRAS (NOW PLAYING) ---

app.post('/api/users/:userId/now-playing', async (req, res) => {
    try {
        const { userId } = req.params;
        const { song, artist, lyrics, albumArt } = req.body;

        const { error } = await supabase
            .from('user_now_playing')
            .upsert({ 
                user_id: userId, 
                song_data: { song, artist, lyrics, albumArt },
                updated_at: new Date()
            }, { onConflict: 'user_id' });

        if (error) throw error;

        return res.status(200).json({ success: true, message: 'Reproducción actualizada' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/users/:userId/now-playing', async (req, res) => {
    try {
        const { userId } = req.params;

        const { data, error } = await supabase
            .from('user_now_playing')
            .select('song_data')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            return res.status(200).json({
                song: 'Sin reproducción',
                artist: 'Desconocido',
                lyrics: '',
                albumArt: ''
            });
        }

        return res.status(200).json(data.song_data);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});


// --- 3. ENDPOINTS DE TEMAS Y DISEÑO DE LA CARD ---

// NUEVO: Devuelve la lista de todos los temas disponibles para la card en JSON
app.get('/api/themes/available', (req, res) => {
    const themes = [
        {
            themeId: 'classic',
            name: 'Clásico Oscuro',
            backgroundColor: '#1e1e2e',
            textColor: '#cdd6f4',
            accentColor: '#5865F2'
        },
        {
            themeId: 'cyberpunk',
            name: 'Cyberpunk Neon',
            backgroundColor: '#0f172a',
            textColor: '#38bdf8',
            accentColor: '#10b981'
        },
        {
            themeId: 'sunset',
            name: 'Sunset Vibe',
            backgroundColor: '#2e1065',
            textColor: '#f472b6',
            accentColor: '#fb923c'
        },
        {
            themeId: 'midnight',
            name: 'Midnight Minimal',
            backgroundColor: '#09090b',
            textColor: '#a1a1aa',
            accentColor: '#ffffff'
        }
    ];

    return res.status(200).json({ success: true, themes });
});

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
                themeId: 'classic',
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


// --- 4. CONFIGURACIÓN DEL BOT DE DISCORD ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
    console.log(`[Bot] ¡${client.user.tag} (polic) está conectado y listo!`);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    console.error("[Error de Discord] No se pudo iniciar sesión:", err.message);
});
