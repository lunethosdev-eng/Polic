const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Inicializar Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const app = express();
app.use(express.json());

// --- ENDPOINTS CON SUPABASE ---

// Actualizar tema en Supabase (Guardado en una tabla llamada 'user_themes')
app.put('/api/users/:userId/theme', async (req, res) => {
    const { userId } = req.params;
    const themeConfig = req.body; 

    // Guardar o actualizar en Supabase (asumiendo que tu tabla tiene columnas 'user_id' y 'theme_data')
    const { data, error } = await supabase
        .from('user_themes')
        .upsert({ user_id: userId, theme_data: themeConfig }, { onConflict: 'user_id' });

    if (error) {
        return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`[API] Tema actualizado en Supabase para el usuario ${userId}`);
    return res.status(200).json({ success: true, theme: themeConfig });
});

// Obtener tema desde Supabase
app.get('/api/users/:userId/theme', async (req, res) => {
    const { userId } = req.params;

    const { data, error } = await supabase
        .from('user_themes')
        .select('theme_data')
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        // Tema por defecto si no existe en la base de datos
        return res.status(200).json({
            themeId: 'default',
            backgroundColor: '#1e1e2e',
            textColor: '#cdd6f4'
        });
    }

    return res.status(200).json(data.theme_data);
});
