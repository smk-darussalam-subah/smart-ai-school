'use strict';
// Disposable-lab instrumentation only. Never imported by the application entry point.
const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');

exports.install = function install({ db, load, enabled = true }) {
  if (!process.env.LAB_DATABASE_URL?.includes('/diis_test_725?') || !process.env.LAB_KEY)
    throw Error('Telemetry is restricted to the disposable mixed725 lab');
  const context = new AsyncLocalStorage();
  const counts = { received: 0, responded: 0, traced: 0, traceDropped: 0, streamErrors: 0 };
  const aggregate = new Map();
  const stream = enabled ? fs.createWriteStream('/tmp/mixed725-telemetry.jsonl') : null;
  stream?.on('error', () => {
    counts.streamErrors++;
  });
  const safeCode = (error) =>
    /^P\d{4}$/.test(error?.code)
      ? error.code
      : error?.getResponse?.()?.code === 'AUTHORITY_UNAVAILABLE'
        ? 'AUTHORITY_UNAVAILABLE'
        : undefined;
  const safePath = (value) => value.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
  function observe(key, ms) {
    let item = aggregate.get(key);
    if (!item) {
      item = { count: 0, totalMs: 0, maxMs: 0, buckets: Array(18).fill(0) };
      aggregate.set(key, item);
    }
    item.count++;
    item.totalMs += ms;
    item.maxMs = Math.max(item.maxMs, ms);
    item.buckets[Math.min(17, Math.max(0, Math.ceil(Math.log2(Math.max(1, ms)))))]++;
  }
  const add = (row, key, n) => {
    row[key] = (row[key] ?? 0) + n;
  };
  if (enabled) {
    db.$on('query', (event) => {
      // Query template hash only: never SQL parameters, names or identifiers.
      const key = require('node:crypto')
        .createHash('sha256')
        .update(event.query)
        .digest('hex')
        .slice(0, 16);
      observe('statement:' + key, event.duration);
    });
    db.$use(async (params, next) => {
      const row = context.getStore(),
        started = performance.now();
      try {
        return await next(params);
      } catch (error) {
        if (row) row.persistenceError = safeCode(error);
        throw error;
      } finally {
        const elapsed = performance.now() - started;
        if (row) {
          add(row, 'ormMs', elapsed);
          add(row, 'ormCalls', 1);
          if (params.model === 'User' && params.action === 'findFirst')
            add(row, 'userFindFirst', 1);
          observe('orm:' + (params.model ?? 'raw') + '.' + params.action, elapsed);
        }
      }
    });
    const transaction = db.$transaction.bind(db);
    db.$transaction = (work, options) => {
      if (typeof work !== 'function') return transaction(work, options);
      const row = context.getStore(),
        requested = performance.now();
      return transaction(async (tx) => {
        const acquired = performance.now();
        if (row) {
          add(row, 'txCount', 1);
          add(row, 'txAcquireMs', acquired - requested);
        }
        try {
          return await work(tx);
        } finally {
          if (row) add(row, 'txActiveMs', performance.now() - acquired);
        }
      }, options).catch((error) => {
        if (row) row.persistenceError = safeCode(error);
        throw error;
      });
    };
    for (const [file, symbol] of [
      ['auth/guards/keycloak.guard', 'KeycloakGuard'],
      ['permissions/permissions.guard', 'PermissionGuard'],
      ['auth/guards/roles.guard', 'RolesGuard'],
    ]) {
      const proto = load(file, symbol).prototype,
        original = proto.canActivate;
      proto.canActivate = async function (ctx) {
        const row = context.getStore(),
          started = performance.now();
        try {
          return await original.call(this, ctx);
        } catch (error) {
          if (row) {
            row.guardError = error.getStatus?.() ?? 500;
            row.safeCode = safeCode(error);
          }
          throw error;
        } finally {
          if (row) {
            add(row, 'guardMs', performance.now() - started);
            row.guardFinishedAt = performance.now();
            const roles = ctx.switchToHttp().getRequest().user?.roles;
            row.role = Array.isArray(roles)
              ? roles
                  .filter((r) => /^[A-Z_]{2,32}$/.test(r))
                  .sort()
                  .join('+')
              : 'unauthenticated';
          }
        }
      };
    }
    for (const [file, symbol, lane, quotaField] of [
      ['attendance/jp-read-admission', 'JpReadAdmission', 'jp', 'perPrincipal'],
      ['assessment/assessment-write-admission', 'AssessmentWriteAdmission', 'write', 'perKey'],
    ]) {
      const proto = load(file, symbol).prototype,
        original = proto.run;
      proto.run = async function (key, work) {
        const row = context.getStore(),
          queuedAt = performance.now();
        let started = false;
        const reason =
          (this[quotaField]?.get(key) ?? 0) >= (this.maxPerPrincipal ?? this.maxPerKey)
            ? 'per-principal'
            : this.active >= this.concurrency && this.waiting.length >= this.maxWaiting
              ? 'queue-full'
              : 'expired';
        if (row) {
          row.lane = lane;
          row.enqueuedAt = queuedAt;
          row.activeAtAdmission = this.active;
          row.depthAtAdmission = this.waiting.length;
        }
        try {
          return await original.call(this, key, async () => {
            started = true;
            const workAt = performance.now();
            if (row) {
              row.workStartedAt = workAt;
              add(row, 'queueWaitMs', workAt - queuedAt);
            }
            try {
              return await work();
            } finally {
              if (row) {
                row.workFinishedAt = performance.now();
                add(row, 'workMs', performance.now() - workAt);
              }
            }
          });
        } catch (error) {
          if (row && !started && error.getStatus?.() === 503) {
            row.busyReason = reason;
            add(row, 'queueWaitMs', performance.now() - queuedAt);
          }
          throw error;
        }
      };
    }
  }
  return {
    attach(fastify) {
      fastify.addHook('onRequest', (q, _r, done) => {
        if (!q.url.startsWith('/api/v1/')) return done();
        counts.received++;
        if (!enabled) return done();
        const row = {
          id: /^[a-f0-9-]{36}$/.test(q.headers['x-lab-request-id'])
            ? q.headers['x-lab-request-id']
            : randomUUID(),
          phase:
            typeof q.headers['x-lab-phase'] === 'string' &&
            /^[a-z0-9-]{1,80}$/.test(q.headers['x-lab-phase'])
              ? q.headers['x-lab-phase']
              : 'unspecified',
          method: q.method,
          path: safePath(q.url),
          receivedAt: performance.now(),
        };
        q.labTelemetry = row;
        context.run(row, done);
      });
      fastify.addHook('onResponse', (q, r, done) => {
        if (!q.url.startsWith('/api/v1/')) return done();
        counts.responded++;
        const row = q.labTelemetry;
        if (row) {
          row.responseAt = performance.now();
          row.ms = row.responseAt - row.receivedAt;
          row.status = r.statusCode;
          observe(row.phase + ':' + row.method + ':' + row.path + ':' + r.statusCode, row.ms);
          // Bounded async buffering; loss is explicit and invalidates complete trace claims.
          if (!counts.streamErrors && stream.writableLength < 4 * 1024 * 1024) {
            stream.write(JSON.stringify(row) + '\n');
            counts.traced++;
          } else counts.traceDropped++;
        }
        done();
      });
    },
    snapshot() {
      return {
        enabled,
        counts: { ...counts },
        aggregate: Object.fromEntries(aggregate),
        histogram:
          'ceil(log2(ms)),18 buckets; exact request percentiles come from raw trace, not bucket estimates',
        caution:
          'ORM elapsed includes client scheduling/pool/native/SQL; txAcquire is callback-entry delay, not a pure SQL or pool-wait measurement.',
      };
    },
    flush() {
      return stream ? new Promise((resolve) => stream.write('', resolve)) : Promise.resolve();
    },
    close() {
      return stream ? new Promise((resolve) => stream.end(resolve)) : Promise.resolve();
    },
  };
};
