import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto, UpdateSubjectDto, ListSubjectsQuery } from './dto/subject.dto';

const SELECT = {
  id:        true,
  code:      true,
  name:      true,
  isActive:  true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SubjectService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: ListSubjectsQuery) {
    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) where['isActive'] = query.isActive === 'true';
    if (query.search) {
      where['OR'] = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.subject.findMany({ where, select: SELECT, orderBy: { name: 'asc' }, skip: query.offset, take: query.limit }),
      this.prisma.subject.count({ where }),
    ]);

    return { data, total, limit: query.limit, offset: query.offset };
  }

  async create(dto: CreateSubjectDto) {
    const exists = await this.prisma.subject.findFirst({
      where: { OR: [{ code: dto.code }, { name: dto.name }] },
    });
    if (exists) {
      throw new ConflictException(
        exists.code === dto.code ? `Kode mapel '${dto.code}' sudah digunakan` : `Nama mapel '${dto.name}' sudah ada`,
      );
    }
    return this.prisma.subject.create({ data: dto, select: SELECT });
  }

  async update(id: string, dto: UpdateSubjectDto) {
    const subject = await this.prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new NotFoundException(`Mapel ${id} tidak ditemukan`);

    if (dto.code || dto.name) {
      const conflict = await this.prisma.subject.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(dto.code ? [{ code: dto.code }] : []),
            ...(dto.name ? [{ name: dto.name }] : []),
          ],
        },
      });
      if (conflict) {
        throw new ConflictException(
          conflict.code === dto.code ? `Kode '${dto.code}' sudah digunakan` : `Nama '${dto.name}' sudah ada`,
        );
      }
    }

    return this.prisma.subject.update({ where: { id }, data: dto, select: SELECT });
  }
}
