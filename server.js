const express = require('express');
const fs = require('fs');
const yaml = require('js-yaml');
const bodyParser = require('body-parser');
const cors = require('cors');
const { exec } = require('child_process');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = process.env.PROMETHEUS_CONFIG_PATH || './prometheus.conf';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASS = process.env.AUTH_PASS || 'password';

// Security Headers
// Security Headers
// Disable CSP and HSTS to allow plain HTTP usage (prevent 'upgrade-insecure-requests')
app.use(helmet({
    contentSecurityPolicy: false,
    hsts: false,
}));

// CORS (Allow self)
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Rate Limiting (General)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', limiter);

// Login Rate Limiting (Strict)
const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 attempts per minute
    message: { error: "Terlalu banyak percobaan login. Coba lagi dalam 1 menit." }
});

// Auth Middleware
const checkAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized: No credentials provided' });
    }

    try {
        const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
        const user = auth[0];
        const pass = auth[1];

        // Safe Compare
        const inputUserHash = crypto.createHash('sha256').update(user).digest();
        const storedUserHash = crypto.createHash('sha256').update(AUTH_USER).digest();
        const inputPassHash = crypto.createHash('sha256').update(pass).digest();
        const storedPassHash = crypto.createHash('sha256').update(AUTH_PASS).digest();

        if (crypto.timingSafeEqual(inputUserHash, storedUserHash) && crypto.timingSafeEqual(inputPassHash, storedPassHash)) {
            next();
        } else {
            // Fake delay to further mitigate timing attacks (optional, but good practice)
            setTimeout(() => res.status(401).json({ error: 'Invalid Credentials' }), 100);
        }
    } catch (e) {
        res.status(401).json({ error: 'Invalid Auth Header' });
    }
};

// API: Login Check
app.post('/api/login', loginLimiter, checkAuth, (req, res) => {
    res.json({ success: true, message: 'Login berhasil' });
});

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

// Helper: Internal JavaScript Validation
const validateConfigInternal = (config) => {
    const errors = [];

    // 1. Check Root Structure
    if (typeof config !== 'object' || config === null) {
        return ["Konfigurasi harus berupa objek YAML yang valid."];
    }

    // 2. Check Global (Optional but good to check format if exists)
    if (config.global) {
        if (config.global.scrape_interval && !/^\d+[smhdwy]$/.test(config.global.scrape_interval)) {
            errors.push("Global: scrape_interval tidak valid (contoh: 15s).");
        }
    }

    // 3. Check Scrape Configs
    if (config.scrape_configs) {
        if (!Array.isArray(config.scrape_configs)) {
            errors.push("scrape_configs harus berupa array/list.");
        } else {
            const jobNames = new Set();
            config.scrape_configs.forEach((job, index) => {
                const prefix = `Job #${index + 1}`;

                // Job Name
                if (!job.job_name) {
                    errors.push(`${prefix}: job_name wajib diisi.`);
                } else if (jobNames.has(job.job_name)) {
                    errors.push(`${prefix}: job_name '${job.job_name}' duplikat.`);
                } else {
                    jobNames.add(job.job_name);
                }

                // Scrape Interval
                if (job.scrape_interval && !/^\d+[smhdwy]$/.test(job.scrape_interval)) {
                    errors.push(`${prefix} (${job.job_name}): scrape_interval format salah (contoh: 15s).`);
                }

                // Metrics Path
                if (job.metrics_path && !job.metrics_path.startsWith('/')) {
                    errors.push(`${prefix} (${job.job_name}): metrics_path harus diawali dengan '/' (contoh: /metrics).`);
                }

                // Static Configs
                if (job.static_configs) {
                    if (!Array.isArray(job.static_configs)) {
                        errors.push(`${prefix} (${job.job_name}): static_configs harus berupa array.`);
                    } else {
                        job.static_configs.forEach((sc, scIndex) => {
                            if (sc.targets && !Array.isArray(sc.targets)) {
                                errors.push(`${prefix} (${job.job_name}): targets pada index ${scIndex} harus berupa array.`);
                            }
                        });
                    }
                }
            });
        }
    }

    return errors;
};

// Helper: Run promtool check
const validateConfigWithTool = (tempPath, configObject) => {
    return new Promise((resolve, reject) => {
        // STEP 1: Internal Validation (Fast & Always Available)
        const internalErrors = validateConfigInternal(configObject);
        if (internalErrors.length > 0) {
            console.error("Internal Validation Failed:", internalErrors);
            reject("Validasi Internal Gagal:\n- " + internalErrors.join("\n- "));
            return;
        }

        // STEP 2: External Validation via promtool (If available)
        exec('promtool --version', (err) => {
            if (err) {
                console.warn("promtool not found, skipping strict validation. Internal validation passed.");
                // Since internal validation passed, we consider it safe enough.
                resolve(true);
                return;
            }

            // Run check config
            exec(`promtool check config ${tempPath}`, (error, stdout, stderr) => {
                if (error) {
                    // console.error("Promtool Validation failed:", stderr || stdout);
                    // Simplify error message for user
                    reject("Promtool Validation Error:\n" + (stderr || stdout));
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
app.get('/api/config', checkAuth, (req, res) => {
    try {
        const config = readConfig();
        res.json(config);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read configuration file', details: e.message });
    }
});

// API: Save Config
app.post('/api/config', checkAuth, async (req, res) => {
    const tempPath = `${CONFIG_PATH}.tmp`;
    try {
        // 1. Convert to YAML
        const yamlStr = yaml.dump(req.body, { lineWidth: -1 });

        // 2. Write to temp file
        fs.writeFileSync(tempPath, yamlStr, 'utf8');

        // 3. Validate
        await validateConfigWithTool(tempPath, req.body);

        // 4. Overwrite real config
        fs.renameSync(tempPath, CONFIG_PATH);

        // 5. Reload Prometheus (Soft Fail)
        let message = 'Konfigurasi berhasil disimpan dan Prometheus direload.';
        try {
            await reloadPrometheus();
        } catch (reloadError) {
            console.warn("Reload warning:", reloadError.message);
            message = `Konfigurasi disimpan, namun GAGAL reload Prometheus: ${reloadError.message}`;
            // We do NOT throw here, so the user gets a success response.
        }

        res.json({ success: true, message: message });
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
