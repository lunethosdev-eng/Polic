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

// --- 0. PÁGINA PRINCIPAL (UI DASHBOARD) ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Polic - API & Dashboard</title>
            <style>
                body { background: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 40px; display: flex; justify-content: center; }
                .container { max-width: 700px; width: 100%; }
                .card { background: #1e293b; padding: 30px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); border: 1px solid #334155; margin-bottom: 20px; }
                h1 { color: #38bdf8; margin-top: 0; display: flex; align-items: center; gap: 10px; }
                p { color: #94a3b8; line-height: 1.6; }
                .badge { background: #10b981; color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
                .btn-group { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
                .btn { background: #5865F2; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-flex; align-items: center; gap: 8px; transition: background 0.2s; }
                .btn:hover { background: #4752c4; }
                .btn-green { background: #10b981; }
                .btn-green:hover { background: #059669; }
                code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; font-size: 14px; }
                ul { padding-left: 20px; color: #cbd5e1; }
                li { margin-bottom: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h1>🎵 Polic API <span class="badge">ONLINE</span></h1>
                    <p>Bienvenido al núcleo de sincronización de reproducción, letras y perfiles de Discord para tu aplicación.</p>
                    
                    <div class="btn-group">
                        <a href="/api/auth/discord" class="btn">🚀 Vincular con Discord</a>
                        <a href="/customize" class="btn btn-green">🎨 Personalizar Tarjeta</a>
                    </div>
                </div>

                <div class="card">
                    <h3>📚 Endpoints Principales</h3>
                    <ul>
                        <li><code>GET /api/auth/discord</code> - Iniciar sesión OAuth2</li>
                        <li><code>GET /api/themes/available</code> - Listar temas disponibles (JSON)</li>
                        <li><code>POST /api/users/:userId/now-playing</code> - Enviar música y letras</li>
                        <li><code>GET /api/users/:userId/now-playing</code> - Obtener reproducción actual</li>
                        <li><code>PUT /api/users/:userId/theme</code> - Guardar diseño de tarjeta</li>
                    </ul>
                </div>
            </div>
        </body>
        </html>
    `);
});

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

        // Redirige directamente a la UI de personalización con su ID de usuario
        return res.redirect(`/customize?userId=${discordUser.id}`);

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


// --- 3. ENDPOINTS DE TEMAS Y UI DE PERSONALIZACIÓN WEB ---
app.get('/api/themes/available', (req, res) => {
    const themes = [
        { themeId: 'classic', name: 'Clásico Oscuro', backgroundColor: '#1e1e2e', textColor: '#cdd6f4', accentColor: '#5865F2' },
        { themeId: 'cyberpunk', name: 'Cyberpunk Neon', backgroundColor: '#0f172a', textColor: '#38bdf8', accentColor: '#10b981' },
        { themeId: 'sunset', name: 'Sunset Vibe', backgroundColor: '#2e1065', textColor: '#f472b6', accentColor: '#fb923c' },
        { themeId: 'midnight', name: 'Midnight Minimal', backgroundColor: '#09090b', textColor: '#a1a1aa', accentColor: '#ffffff' }
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
            return res.status(200).json({ themeId: 'classic', backgroundColor: '#1e1e2e', textColor: '#cdd6f4' });
        }

        return res.status(200).json(data.theme_data);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Interfaz Web Interactiva para personalizar la tarjeta visualmente
app.get('/customize', (req, res) => {
    const userId = req.query.userId || '';
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Personalizar Tarjeta - Polic</title>
            <style>
                body { background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                .container { background: #1e293b; padding: 30px; border-radius: 16px; width: 100%; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); border: 1px solid #334155; }
                h2 { text-align: center; color: #38bdf8; margin-top: 0; }
                label { display: block; margin-top: 15px; font-size: 14px; color: #94a3b8; font-weight: 500; }
                input, select { width: 100%; padding: 10px; margin-top: 5px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; box-sizing: border-box; font-size: 14px; }
                button { width: 100%; margin-top: 25px; background: #10b981; color: white; padding: 12px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 15px; transition: background 0.2s; }
                button:hover { background: #059669; }
                .msg { text-align: center; margin-top: 15px; font-size: 14px; font-weight: 500; }
                .back { display: block; text-align: center; margin-top: 15px; color: #38bdf8; text-decoration: none; font-size: 14px; }
                .back:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🎨 Personalizar Card</h2>
                <form id="themeForm">
                    <label>ID de Usuario Discord:</label>
                    <input type="text" id="userId" value="${userId}" required placeholder="Ej. 10882845..." />

                    <label>Nombre del Tema:</label>
                    <input type="text" id="themeId" value="Cyberpunk" required />

                    <label>Color de Fondo:</label>
                    <input type="color" id="backgroundColor" value="#1e1e2e" style="height: 45px; padding: 0; cursor: pointer;" />

                    <label>Color de Texto:</label>
                    <input type="color" id="textColor" value="#cdd6f4" style="height: 45px; padding: 0; cursor: pointer;" />

                    <button type="submit">Guardar Cambios</button>
                </form>
                <div id="responseMsg" class="msg"></div>
                <a href="/" class="back">← Volver al inicio</a>
            </div>

            <script>
                document.getElementById('themeForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const userId = document.getElementById('userId').value;
                    const themeId = document.getElementById('themeId').value;
                    const backgroundColor = document.getElementById('backgroundColor').value;
                    const textColor = document.getElementById('textColor').value;

                    const res = await fetch('/api/users/' + userId + '/theme', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ themeId, backgroundColor, textColor })
                    });

                    const data = await res.json();
                    const msgDiv = document.getElementById('responseMsg');
                    if (data.success) {
                        msgDiv.style.color = '#34d399';
                        msgDiv.innerText = '¡Cambios guardados con éxito!';
                    } else {
                        msgDiv.style.color = '#f87171';
                        msgDiv.innerText = 'Error al guardar.';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[API] Servidor corriendo en el puerto ${PORT}`);
});

// --- 4. CONFIGURACIÓN DEL BOT DE DISCORD ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
    console.log(`[Bot] ¡${client.user.tag} (polic) está conectado y listo!`);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    console.error("[Error de Discord] No se pudo iniciar sesión:", err.message);
});
