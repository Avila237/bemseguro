const express = require('express');
const healthRouter = require('../../src/routes/health');

function createTestApp() {
  const app = express();
  app.use(healthRouter);
  return app;
}

describe('GET /health', () => {
  test('retorna status ok', async () => {
    const app = createTestApp();

    const { createServer } = require('http');
    const server = createServer(app);

    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://localhost:${port}/health`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
