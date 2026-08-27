import { POSITION_CODES, PRIMARY_ROLES } from '@smk/auth';
import { z } from 'zod';

export const HelpPrimaryRoleSchema = z.enum(PRIMARY_ROLES);
export const HelpPositionCodeSchema = z.enum(POSITION_CODES);

export const HelpContextSchema = z.enum([
  'teaching-assignment',
  'wali-kelas',
  'selected-child',
  'multi-child',
  'kaprog-major',
]);

const PermissionSchema = z.string().regex(/^[a-z][a-z0-9.*-]*(?:\.[a-z0-9.*-]+)*$/);
const UpdatedAtSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const TextSchema = z.string().trim().min(1).max(2_000);
const InternalHrefSchema = z.string().trim().regex(/^\/(?:dashboard|login|privacy|consent)(?:[/?#].*)?$/);

const HeadingBlockSchema = z.object({
  kind: z.literal('heading'),
  level: z.union([z.literal(2), z.literal(3)]),
  text: TextSchema,
}).strict();

const ParagraphBlockSchema = z.object({
  kind: z.literal('paragraph'),
  text: TextSchema,
}).strict();

const StepsBlockSchema = z.object({
  kind: z.literal('steps'),
  title: TextSchema.optional(),
  items: z.array(TextSchema).min(1).max(12),
}).strict();

const ChecklistBlockSchema = z.object({
  kind: z.literal('checklist'),
  title: TextSchema.optional(),
  items: z.array(TextSchema).min(1).max(12),
}).strict();

const CalloutBlockSchema = z.object({
  kind: z.literal('callout'),
  tone: z.enum(['info', 'warning', 'privacy', 'success']),
  title: TextSchema,
  text: TextSchema,
}).strict();

const ScreenshotBlockSchema = z.object({
  kind: z.literal('screenshot'),
  screenshotId: z.string().regex(/^shot\.[a-z0-9.-]+$/),
  caption: TextSchema,
}).strict();

const FaqBlockSchema = z.object({
  kind: z.literal('faq'),
  question: TextSchema,
  answer: TextSchema,
}).strict();

const RelatedTopicBlockSchema = z.object({
  kind: z.literal('related-topic'),
  topicId: z.string().regex(/^topic\.[a-z0-9.-]+$/),
  label: TextSchema,
}).strict();

const CtaBlockSchema = z.object({
  kind: z.literal('cta'),
  label: TextSchema,
  href: InternalHrefSchema,
}).strict();

const AuthorityNoteBlockSchema = z.object({
  kind: z.literal('authority-note'),
  text: TextSchema,
}).strict();

export const HelpContentBlockSchema = z.discriminatedUnion('kind', [
  HeadingBlockSchema,
  ParagraphBlockSchema,
  StepsBlockSchema,
  ChecklistBlockSchema,
  CalloutBlockSchema,
  ScreenshotBlockSchema,
  FaqBlockSchema,
  RelatedTopicBlockSchema,
  CtaBlockSchema,
  AuthorityNoteBlockSchema,
]);

export const HelpTopicSchema = z.object({
  id: z.string().regex(/^topic\.[a-z0-9.-]+$/),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(3).max(100),
  summary: z.string().trim().min(10).max(240),
  route: z.string().regex(/^\/(?:dashboard|login)(?:\/[^?#\s]*)?$/),
  category: z.enum(['start', 'task', 'feature', 'recovery', 'governance', 'contact']),
  primaryRoles: z.array(HelpPrimaryRoleSchema).max(PRIMARY_ROLES.length).default([]),
  positionCodes: z.array(HelpPositionCodeSchema).max(POSITION_CODES.length).default([]),
  assignmentContexts: z.array(HelpContextSchema).max(5).default([]),
  permissionsAny: z.array(PermissionSchema).max(12).default([]),
  permissionsAll: z.array(PermissionSchema).max(12).default([]),
  featureStatus: z.enum(['available', 'limited', 'unavailable']),
  updatedAt: UpdatedAtSchema,
  keywords: z.array(z.string().trim().min(2).max(60)).min(1).max(20),
  version: z.string().regex(/^\d+\.\d+$/),
  screenshotIds: z.array(z.string().regex(/^shot\.[a-z0-9.-]+$/)).max(12).default([]),
  relatedTopicIds: z.array(z.string().regex(/^topic\.[a-z0-9.-]+$/)).max(8).default([]),
  contentOwner: z.enum(['product', 'academic', 'student-affairs', 'administration', 'finance', 'security']),
  blocks: z.array(HelpContentBlockSchema).min(3).max(30),
}).strict();

export const HelpCatalogSchema = z.array(HelpTopicSchema).min(1);

export const HelpScreenshotSchema = z.object({
  id: z.string().regex(/^shot\.[a-z0-9.-]+$/),
  topicId: z.string().regex(/^topic\.[a-z0-9.-]+$/),
  route: z.string().startsWith('/'),
  persona: z.string().trim().min(2).max(80),
  context: z.string().trim().min(2).max(120),
  viewport: z.enum(['desktop-1440x900', 'mobile-390x844']),
  state: z.string().trim().min(2).max(120),
  caption: z.string().trim().min(3).max(240),
  consumers: z.array(z.string().regex(/^(?:artifact|deck)\.[a-z0-9.-]+$/)).min(1),
  redactionRules: z.array(z.string().trim().min(3).max(160)).min(1),
  required: z.boolean(),
  assetStatus: z.enum(['pending', 'ready']),
  fileName: z.string().regex(/^[a-z0-9][a-z0-9._-]+\.(?:png|webp|jpg)$/).nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
  capturedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const HelpArtifactSchema = z.object({
  id: z.string().regex(/^artifact\.[a-z0-9.-]+$/),
  label: z.string().trim().min(3).max(120),
  fileName: z.string().regex(/^[a-z0-9][a-z0-9._-]+\.pdf$/),
  contentType: z.literal('application/pdf'),
  status: z.enum(['pending', 'ready', 'unavailable']),
  topicIds: z.array(z.string().regex(/^topic\.[a-z0-9.-]+$/)).min(1),
  primaryRoles: z.array(HelpPrimaryRoleSchema).max(PRIMARY_ROLES.length).default([]),
  positionCodes: z.array(HelpPositionCodeSchema).max(POSITION_CODES.length).default([]),
  assignmentContexts: z.array(HelpContextSchema).max(5).default([]),
  permissionsAny: z.array(PermissionSchema).max(12).default([]),
  permissionsAll: z.array(PermissionSchema).max(12).default([]),
  selectedChildRequired: z.boolean().default(false),
  allowSuperAdminRecovery: z.boolean().default(false),
}).strict();

export const HelpClaimSourceSchema = z.object({
  claimId: z.string().regex(/^claim\.[a-z0-9.-]+$/),
  topicId: z.string().regex(/^topic\.[a-z0-9.-]+$/),
  claim: TextSchema,
  ui: TextSchema,
  actionApi: TextSchema,
  service: TextSchema,
  stateAudit: TextSchema,
  source: z.string().trim().min(3).max(240),
  test: z.string().trim().min(3).max(240),
  report: z.string().trim().min(3).max(240),
}).strict();

export type HelpPrimaryRole = z.infer<typeof HelpPrimaryRoleSchema>;
export type HelpPositionCode = z.infer<typeof HelpPositionCodeSchema>;
export type HelpContext = z.infer<typeof HelpContextSchema>;
export type HelpContentBlock = z.infer<typeof HelpContentBlockSchema>;
export type HelpTopic = z.infer<typeof HelpTopicSchema>;
export type HelpScreenshot = z.infer<typeof HelpScreenshotSchema>;
export type HelpArtifact = z.infer<typeof HelpArtifactSchema>;
export type HelpClaimSource = z.infer<typeof HelpClaimSourceSchema>;
