module.exports = {
  apps: [{
    name: 'metadash',
    script: 'tsx',
    args: 'server/index.ts',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: 5011,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    exp_backoff_restart_delay: 5000,
    max_restarts: 25,
    min_uptime: '30s',
  }],
};
