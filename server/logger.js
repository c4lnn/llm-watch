// Prefix every console line with a timestamp so logs are readable everywhere
// (Docker, pm2, plain node) — not just under `concurrently` in dev.
// Uses sv-SE locale for a clean "YYYY-MM-DD HH:mm:ss" and respects the TZ env.
const ts = () => new Date().toLocaleString('sv-SE');

for (const method of ['log', 'info', 'warn', 'error']) {
  const original = console[method].bind(console);
  console[method] = (...args) => original(`[${ts()}]`, ...args);
}
