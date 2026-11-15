import { z } from "zod";

const deviceIdSchema = z.string().uuid();

export function validDeviceId(value: string) {
  return deviceIdSchema.safeParse(value).success ? value : null;
}
