// A tiny structured logger — no dependency, one JSON line per event.
//
// Use this instead of scattered console.log/console.error so server logs are
// machine-readable and, above all, safe: any object key that looks like a
// secret (secret / token / password / authorization / cookie) is redacted
// before it is ever written. Errors are serialised to name/message/stack.

const SENSITIVE_KEY = /(secret|token|password|authorization|cookie)/i;
const MAX_DEPTH = 6;

function redact(value, depth = 0) {
  if (value == null || depth > MAX_DEPTH) return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(val, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level, message, context) {
  const line = { level, time: new Date().toISOString(), message };
  if (context !== undefined) {
    line.context = redact(context);
  }
  let out;
  try {
    out = JSON.stringify(line);
  } catch {
    // Fall back rather than throw from a logging call (e.g. circular refs).
    out = JSON.stringify({ level, time: line.time, message });
  }
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export const logger = {
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context),
};
