import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import {
  AuthenticatedThrottlerGuard,
  PreAuthThrottlerGuard,
  skipAiThrottle,
} from '../common/guards/api-throttler.guard';

class TestController {
  ordinary() {
    return true;
  }
  @Throttle({ aichat: { ttl: 60_000, limit: 2 } })
  ai() {
    return true;
  }
}

describe('dashboard request budgets', () => {
  async function setup() {
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { ttl: 60_000, limit: 4 },
          { name: 'aichat', ttl: 60_000, limit: 2, skipIf: skipAiThrottle },
        ]),
      ],
      providers: [AuthenticatedThrottlerGuard, PreAuthThrottlerGuard],
    }).compile();
    await module.init();
    return {
      module,
      guard: module.get(AuthenticatedThrottlerGuard),
      preauth: module.get(PreAuthThrottlerGuard),
    };
  }
  function context(user: string | null, handler = TestController.prototype.ordinary, ip = 'proxy') {
    return {
      getClass: () => TestController,
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          ip,
          user: user ? { keycloakId: user } : undefined,
          headers: { 'x-forwarded-for': 'spoofed' },
        }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as unknown as ExecutionContext;
  }
  it('does not spend an AI budget on normal reads and isolates verified users sharing a proxy', async () => {
    const { module, guard } = await setup();
    try {
      for (let i = 0; i < 4; i++) await expect(guard.canActivate(context('a'))).resolves.toBe(true);
      await expect(guard.canActivate(context('a'))).rejects.toMatchObject({ status: 429 });
      await expect(guard.canActivate(context('b'))).resolves.toBe(true);
    } finally {
      await module.close();
    }
  });
  it('keeps the explicit AI budget and does not reset a user quota when IP changes', async () => {
    const { module, guard } = await setup();
    try {
      await guard.canActivate(context('a', TestController.prototype.ai, 'one'));
      await guard.canActivate(context('a', TestController.prototype.ai, 'two'));
      await expect(
        guard.canActivate(context('a', TestController.prototype.ai, 'three')),
      ).rejects.toMatchObject({ status: 429 });
      await expect(guard.canActivate(context('b', TestController.prototype.ai))).resolves.toBe(
        true,
      );
    } finally {
      await module.close();
    }
  });
  it('retains public IP budgets and a separate pre-authentication ceiling', async () => {
    const { module, guard, preauth } = await setup();
    try {
      for (let i = 0; i < 4; i++) await guard.canActivate(context(null));
      await expect(guard.canActivate(context(null))).rejects.toMatchObject({ status: 429 });
      await expect(
        guard.canActivate(context(null, TestController.prototype.ordinary, 'different')),
      ).resolves.toBe(true);
      for (let i = 0; i < 1200; i++) await preauth.canActivate(context('arbitrary-' + i));
      await expect(preauth.canActivate(context('another'))).rejects.toMatchObject({ status: 429 });
    } finally {
      await module.close();
    }
  });
});
