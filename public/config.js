// Optional hosted Node.js origin, e.g. https://your-live-train.example.com
// Leave empty for an unconnected static preview. Node serves its own empty config.
// NEVER put an API key in this public file.
// Hosted builds read RAILGO_BACKEND_URL and generate this file in the output.
// Hosted frontends call this backend with credentials. Browsers that block
// cross-site cookies can continue on the backend's own /profile page.
window.LIVE_TRAIN_CONFIG = { apiBase: '' };
