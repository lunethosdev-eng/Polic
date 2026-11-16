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

// --- ENDPOINTS DE LA API ---
app.put('/api/users/:userId/theme', async (req, res) => {
    try {
        const { userId } = req.params;
        const themeConfig = req.body; 

        const { data, error } = await supabase
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

// --- CONFIGURACIÓN DEL BOT DE DISCORD (polic) ---
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
            // Usa el tema por defecto si hay error de consulta
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

// Iniciar sesión de forma segura atrapando errores
client.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    console.error("[Error de Discord] No se pudo iniciar sesión con el token proporcionado:", err.message);
});
