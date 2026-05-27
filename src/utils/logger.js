const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function getLevel() {
  return LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;
}

function formatPrefix(ctx) {
  const parts = [];
  if (ctx.scope) parts.push(ctx.scope);
  if (ctx.placa) parts.push(ctx.placa);
  const prefix = parts.length > 0 ? `[${parts.join('|')}]` : '';
  const extra = [];
  if (ctx.os_id) extra.push(`OS=${ctx.os_id}`);
  return [prefix, extra.join(' ')].filter(Boolean).join(' ');
}

function createLogger(ctx = {}) {
  const prefix = formatPrefix(ctx);

  return {
    info(msg, data) {
      if (getLevel() < LOG_LEVELS.info) return;
      console.log(`${prefix} ${msg}`, data !== undefined ? data : '');
    },
    warn(msg, data) {
      if (getLevel() < LOG_LEVELS.warn) return;
      console.warn(`${prefix} ${msg}`, data !== undefined ? data : '');
    },
    error(msg, data) {
      console.error(`${prefix} ${msg}`, data !== undefined ? data : '');
    },
    debug(msg, data) {
      if (getLevel() < LOG_LEVELS.debug) return;
      console.log(`${prefix} ${msg}`, data !== undefined ? data : '');
    },
    child(extra) {
      return createLogger({ ...ctx, ...extra });
    },
  };
}

module.exports = { createLogger };
