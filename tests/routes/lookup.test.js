describe('POST /lookup/placa', () => {
  test('modulo lookup carrega sem erros', () => {
    // Apenas verifica que o modulo e valido
    expect(() => require('../../src/routes/lookup')).not.toThrow();
  });

  test('rota esta registrada como POST /lookup/placa', () => {
    const router = require('../../src/routes/lookup');
    const routes = router.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0],
      }));
    expect(routes).toContainEqual({ path: '/lookup/placa', method: 'post' });
  });
});
