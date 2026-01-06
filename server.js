const express = require('express');
const fs = require('fs');
const yaml = require('js-yaml');
const bodyParser = require('body-parser');
const cors = require('cors');
const { exec } = require('child_process');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = process.env.PROMETHEUS_CONFIG_PATH || './prometheus.conf';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Helper to read config
const readConfig = () => {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            const defaultConfig = { global: { scrape_interval: '15s' }, scrape_configs: [] };
            fs.writeFileSync(CONFIG_PATH, yaml.dump(defaultConfig));
            return defaultConfig;
        }
        const fileContents = fs.readFileSync(CONFIG_PATH, 'utf8');
        return yaml.load(fileContents) || {};
    } catch (e) {
        console.error("Error reading config:", e);
        throw e;
    }
};

// Helper: Run promtool check
const validateConfigWithTool = (tempPath) => {
    return new Promise((resolve, reject) => {
        // First check if promtool exists
        exec('promtool --version', (err) => {
            if (err) {
                console.warn("promtool not found, skipping strict validation.");
                // Fallback: If promtool is missing, assume valid if YAML parsed ok.
                resolve(true);
                return;
            }

            // Run check config
            exec(`promtool check config ${tempPath}`, (error, stdout, stderr) => {
                if (error) {
                    console.error("Validation failed:", stderr || stdout);
                    reject(stderr || stdout);
                } else {
                    resolve(true);
                }
            });
        });
    });
};

// Helper: Trigger Prometheus Reload
const reloadPrometheus = async () => {
    try {
        console.log(`Triggering reload at ${PROMETHEUS_URL}/-/reload`);
        await axios.post(`${PROMETHEUS_URL}/-/reload`);
        console.log("Prometheus reloaded successfully.");
    } catch (e) {
        console.error("Failed to reload Prometheus:", e.message);
        throw new Error(`Gagal reload Prometheus: ${e.message}`);
    }
};

// API: Get Config
app.get('/api/config', (req, res) => {
    try {
        const config = readConfig();
        res.json(config);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read configuration file', details: e.message });
    }
});

// API: Save Config
app.post('/api/config', async (req, res) => {
    const tempPath = `${CONFIG_PATH}.tmp`;
    try {
        // 1. Convert to YAML
        const yamlStr = yaml.dump(req.body, { lineWidth: -1 });

        // 2. Write to temp file
        fs.writeFileSync(tempPath, yamlStr, 'utf8');

        // 3. Validate
        await validateConfigWithTool(tempPath);

        // 4. Overwrite real config
        fs.renameSync(tempPath, CONFIG_PATH);

        // 5. Reload Prometheus
        await reloadPrometheus();

        res.json({ success: true, message: 'Configuration saved and reloaded.' });
    } catch (e) {
        // Clean up temp file
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

        res.status(500).json({ error: 'Gagal menyimpan/validasi konfigurasi', details: e.toString() });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Managing config at: ${CONFIG_PATH}`);
});
