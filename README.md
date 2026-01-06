# Prometheus Config Manager UI

A lightweight, user-friendly web interface to manage Prometheus configuration (`prometheus.yml` or `.conf`).

## Features
- **Dashboard**: Visualize Jobs and Targets.
- **Easy Management**: Add, Edit, and Remove Jobs and Targets via UI.
- **Validation**: Automatically validates configuration using `promtool` before saving.
- **Safety**: Prevents saving invalid configurations using a temporary file check.
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

## Tech Stack
- Backend: Node.js, Express, js-yaml
- Frontend: HTML5, CSS3 (Glassmorphism), Vanilla JavaScript, Phosphor Icons
- Integration: Axios (for Prometheus API)
