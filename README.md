# Prometheus Config Manager UI

A lightweight, user-friendly web interface to manage Prometheus configuration (`prometheus.yml` or `.conf`).

## Features
- **Dashboard**: Visualize Jobs and Targets.
- **Easy Management**: Add, Edit, and Remove Jobs and Targets via UI.
- **Validation**: Automatically validates configuration using `promtool` before saving.
- **Safety**: Prevents saving invalid configurations using a temporary file check.
- **Security**:
    - **Basic Authentication**: Simple but effective protection.
    - **Rate Limiting**: Protects against brute-force attacks.
    - **Secure Headers**: Uses `helmet` for HTTP security headers.
    - **Timing Attack Protection**: Safe password comparison.
- **Auto-Reload**: Triggers Prometheus reload (`/-/reload`) upon successful save.
- **Lightweight**: Built with Vanilla JS and Node.js. No heavy frontend build steps.

## Requirements
- Node.js
- Prometheus (running locally or accessible via network)
- `promtool` (optional, for validation)

## Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Environment Setup**
    Create a `.env` file (see `.env.example` if available, or use the one provided):
    ```env
    PORT=3000
    PROMETHEUS_CONFIG_PATH=./prometheus.conf
    PROMETHEUS_URL=http://localhost:9090
    AUTH_USER=admin
    AUTH_PASS=password
    ```

3.  **Run Application**
    ```bash
    npm start
    ```
    Access the UI at [http://localhost:3000](http://localhost:3000).

## Usage
- **Add Job**: Click the floating "+" button.
- **Edit Job**: Click on any job card.
- **Targets**: Enter IP and Port separately.
- **Advanced**: Enable "Pengaturan Lanjutan" to add `relabel_configs` (JSON format).

### Relabel Config Example
To use relabeling, enable "Pengaturan Lanjutan" and paste the JSON configuration. Example:
```json
[
  {
    "source_labels": [
      "__address__"
    ],
    "target_label": "instance"
  },
  {
    "source_labels": [
      "__address__"
    ],
    "target_label": "__address__",
    "replacement": "${1}:9100"
  }
]
```

## Running with PM2
To keep the application running in the background and start automatically on boot:

1.  **Install PM2**
    ```bash
    npm install pm2 -g
    ```

2.  **Start Application**
    ```bash
    pm2 start server.js --name prometheus-ui
    ```

3.  **Save & Startup**
    ```bash
    pm2 save
    pm2 startup
    ```

## Tech Stack
- Backend: Node.js, Express, js-yaml
- Frontend: HTML5, CSS3 (Material Design), Vanilla JavaScript, Phosphor Icons
- Integration: Axios (for Prometheus API)
