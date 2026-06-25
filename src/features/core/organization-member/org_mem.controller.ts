import { Response } from "express";
import asyncHandler from "express-async-handler";
import { AuthRequest } from "../../../middleware/users/auth.middleware.js";
import { prisma } from "../../../prisma.js";
import {
  authenticatedUserId,
  idFromParams,
} from "../../../utils/request.utils.js";
import { normalizeOptionalString } from "../../../utils/validation.utils.js";
import {
  canManageTargetMember,
  findTargetMember,
  isManageableMemberStatus,
  isManageableOrganizationRole,
  manageableMemberStatuses,
  manageableOrganizationRoles,
  MEMBER_SELECT,
  requireMemberManager,
  serializeMember,
} from "./org_mem.helpers.js";
import {
  ChangeMemberRoleRequestBody,
  ChangeMemberStatusRequestBody,
  UpdateMemberJobTitleRequestBody,
} from "./org_mem.types.js";

export const listOrganizationMembers = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizationId = idFromParams(req.params.organizationId);
    if (!organizationId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization id" });
      return;
    }

    if (!(await requireMemberManager(organizationId, userId, res))) return;

    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: MEMBER_SELECT,
    });

    res.status(200).json({
      success: true,
      data: {
        members: members.map(serializeMember),
      },
    });
  },
);

export const updateMemberJobTitle = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizationId = idFromParams(req.params.organizationId);
    const memberId = idFromParams(req.params.memberId);
    if (!organizationId || !memberId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization or member id" });
      return;
    }

    const actor = await requireMemberManager(organizationId, userId, res);
    if (!actor) return;

    const target = await findTargetMember(organizationId, memberId, res);
    if (!target || !canManageTargetMember(actor, target, res)) return;

    const { jobTitle }: UpdateMemberJobTitleRequestBody = req.body;
    const normalizedJobTitle = normalizeOptionalString(jobTitle) as
      | string
      | null
      | undefined;

    const member = await prisma.organizationMember.update({
      where: { id: memberId },
      data: { jobTitle: normalizedJobTitle ?? null },
      select: MEMBER_SELECT,
    });

    res.status(200).json({
      success: true,
      message: "Member job title updated successfully",
      data: { member: serializeMember(member) },
    });
  },
);

export const changeMemberRole = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizationId = idFromParams(req.params.organizationId);
    const memberId = idFromParams(req.params.memberId);
    if (!organizationId || !memberId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization or member id" });
      return;
    }

    const actor = await requireMemberManager(organizationId, userId, res);
    if (!actor) return;

    const target = await findTargetMember(organizationId, memberId, res);
    if (!target || !canManageTargetMember(actor, target, res)) return;

    const { organizationRole }: ChangeMemberRoleRequestBody = req.body;
    if (!isManageableOrganizationRole(organizationRole)) {
      res.status(400).json({
        success: false,
        message: `Organization role must be one of: ${manageableOrganizationRoles()}`,
      });
      return;
    }

    const member = await prisma.organizationMember.update({
      where: { id: memberId },
      data: { organizationRole },
      select: MEMBER_SELECT,
    });

    res.status(200).json({
      success: true,
      message: "Member organization role updated successfully",
      data: { member: serializeMember(member) },
    });
  },
);

export const changeMemberStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizationId = idFromParams(req.params.organizationId);
    const memberId = idFromParams(req.params.memberId);
    if (!organizationId || !memberId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization or member id" });
      return;
    }

    const actor = await requireMemberManager(organizationId, userId, res);
    if (!actor) return;

    const target = await findTargetMember(organizationId, memberId, res);
    if (!target || !canManageTargetMember(actor, target, res)) return;

    const { status }: ChangeMemberStatusRequestBody = req.body;
    if (!isManageableMemberStatus(status)) {
      res.status(400).json({
        success: false,
        message: `Member status must be one of: ${manageableMemberStatuses()}`,
      });
      return;
    }

    const member = await prisma.organizationMember.update({
      where: { id: memberId },
      data: { status },
      select: MEMBER_SELECT,
    });

    res.status(200).json({
      success: true,
      message: "Member status updated successfully",
      data: { member: serializeMember(member) },
    });
  },
);

export const removeOrganizationMember = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = authenticatedUserId(req, res);
    if (!userId) return;

    const organizationId = idFromParams(req.params.organizationId);
    const memberId = idFromParams(req.params.memberId);
    if (!organizationId || !memberId) {
      res
        .status(400)
        .json({ success: false, message: "Invalid organization or member id" });
      return;
    }

    const actor = await requireMemberManager(organizationId, userId, res);
    if (!actor) return;

    const target = await findTargetMember(organizationId, memberId, res);
    if (!target || !canManageTargetMember(actor, target, res)) return;

    await prisma.organizationMember.delete({
      where: { id: memberId },
    });

    res.status(200).json({
      success: true,
      message: "Organization member removed successfully",
    });
  },
);
