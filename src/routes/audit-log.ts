import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Errors } from "../errors";
import { requireUser } from "../plugins/auth";
import { requireMembership } from "../services/access";
import { getGroupAuditLogs } from "../services/auditLogService";
import { serializeAuditLogEntry } from "../serializers";

const querySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().min(1).max(100).optional(),
  actorUserId: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export default async function auditLogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Group administrators only — audit history is a privileged view into
  // membership, expense, treasury, and settlement changes for the group.
  app.get("/groups/:groupId/audit-logs", async (req) => {
    const auth = requireUser(req);
    const { groupId } = z.object({ groupId: z.string().min(1).max(64) }).parse(req.params);
    await requireMembership(groupId, auth.id);

    const query = querySchema.parse(req.query);
    const from = query.startDate ? new Date(query.startDate) : undefined;
    const to = query.endDate ? new Date(query.endDate) : undefined;
    if (from && to && from > to) {
      throw Errors.badRequest("invalid_range", "`startDate` must not be after `endDate`");
    }

    const { events, nextCursor } = await getGroupAuditLogs(
      groupId,
      { action: query.action, actorUserId: query.actorUserId, from, to },
      query.cursor,
      query.limit
    );

    return {
      events: events.map(serializeAuditLogEntry),
      nextCursor,
    };
  });
}
