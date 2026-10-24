import { z } from "zod";
// Shared contract for future adapters; no provider calls in the frontend.
export const mediaAssetSchema = z.object({
  schemaVersion: z.literal(1),
  assetId: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: z.enum(["hook", "demo", "composition"]),
  storageKey: z.string().min(1),
  width: z.literal(1080),
  height: z.literal(1920),
  fps: z.literal(30),
  codec: z.literal("h264"),
  durationMs: z.number().positive(),
  audioIncluded: z.boolean(),
  subtitleStorageKey: z.string().optional(),
  sourceAssetIds: z.array(z.string().uuid()),
  createdAt: z.string().datetime(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export interface HookProvider {
  submit(input: {
    organizationId: string;
    brief: string;
    idempotencyKey: string;
  }): Promise<{ providerJobId: string }>;
}
export interface DemoEditor {
  submit(input: {
    organizationId: string;
    recordingAssetId: string;
    idempotencyKey: string;
  }): Promise<{ jobId: string }>;
}
