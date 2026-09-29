import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ProvisioningController } from '../provisioning/provisioning.controller';
import { ProvisioningService } from '../provisioning/provisioning.service';

describe('bulk provisioning HTTP validation boundary', () => {
  it.each([
    ['users', 'users', 'bulkProvisionUsers'],
    ['students', 'students', 'bulkProvisionStudents'],
  ] as const)('rejects 0 and 37 %s before invoking service', async (route, property, method) => {
    const service = {
      bulkProvisionUsers: jest.fn(),
      bulkProvisionStudents: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProvisioningController],
      providers: [{ provide: ProvisioningService, useValue: service }],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    await fastify.ready();

    try {
      for (const rows of [[], Array.from({ length: 37 }, () => ({}))]) {
        const response = await fastify.inject({
          method: 'POST',
          url: `/provision/${route}/bulk`,
          payload: { [property]: rows },
        });
        expect(response.statusCode).toBe(400);
      }
      expect(service[method]).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
