import {
  SuperAdminStatus,
  AppStatus,
  AuthProvider,
  InvitationStatus,
  MemberStatus,
  OrganizationAppAccessType,
  OrganizationAppStatus,
  OrganizationRole,
  AppPermissionStatus,
  RoleStatus,
} from "../generated/prisma/enums.js";
import { prisma } from "../prisma.js";
import crypto from "crypto";
import { hashPassword } from "../utils/password.js";

let sequence = 0;

function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function generateTestInvitationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function testInvitationExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  return expiresAt;
}

export async function createTestUser(overrides: Record<string, any> = {}) {
  const id = nextId("user");

  return prisma.user.create({
    data: {
      firstName: "Test",
      lastName: "User",
      email: `${id}@example.test`,
      authProvider: AuthProvider.EMAIL,
      emailVerifiedAt: new Date(),
      isActive: true,
      ...overrides,
    },
  });
}

export async function createTestSuperAdmin(overrides: Record<string, any> = {}) {
  const id = nextId("super-admin");

  return prisma.superAdmin.create({
    data: {
      firstName: "Suite",
      lastName: "Operator",
      email: `${id}@example.test`,
      password: await hashPassword("Password123!"),
      status: SuperAdminStatus.ACTIVE,
      ...overrides,
    },
  });
}

export async function createTestOrganization(
  owner: Awaited<ReturnType<typeof createTestUser>> | null = null,
  overrides: Record<string, any> = {},
) {
  const organizationOwner = owner || (await createTestUser());
  const id = nextId("org");

  const organization = await prisma.organization.create({
    data: {
      name: "Test Organization",
      slug: id,
      ownerId: organizationOwner.id,
      ...overrides,
    },
  });

  const ownerMember = await prisma.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: organizationOwner.id,
      organizationRole: OrganizationRole.OWNER,
      status: MemberStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });

  return { organization, owner: organizationOwner, ownerMember };
}

export async function createTestMember({
  organizationId,
  user,
  organizationRole = OrganizationRole.MEMBER,
  status = MemberStatus.ACTIVE,
  jobTitle = null,
  invitedBy = null,
}: {
  organizationId: bigint;
  user?: Awaited<ReturnType<typeof createTestUser>>;
  organizationRole?: OrganizationRole;
  status?: MemberStatus;
  jobTitle?: string | null;
  invitedBy?: bigint | null;
}) {
  const memberUser = user || (await createTestUser());

  const member = await prisma.organizationMember.create({
    data: {
      organizationId,
      userId: memberUser.id,
      organizationRole,
      status,
      jobTitle,
      invitedBy,
      joinedAt: status === MemberStatus.ACTIVE ? new Date() : null,
    },
  });

  return { user: memberUser, member };
}

export async function createTestApp(overrides: Record<string, any> = {}) {
  const id = nextId("app");

  return prisma.app.create({
    data: {
      name: "Test App",
      key: id,
      status: AppStatus.ACTIVE,
      ...overrides,
    },
  });
}

export async function createTestOrganizationApp({
  organizationId,
  app,
  enabledBy = null,
  status = OrganizationAppStatus.ACTIVE,
  accessType = OrganizationAppAccessType.FREE,
}: {
  organizationId: bigint;
  app?: Awaited<ReturnType<typeof createTestApp>>;
  enabledBy?: bigint | null;
  status?: OrganizationAppStatus;
  accessType?: OrganizationAppAccessType;
}) {
  const organizationApp = await prisma.organizationApp.create({
    data: {
      organizationId,
      appId: (app || (await createTestApp())).id,
      status,
      accessType,
      enabledBy,
      disabledAt: status === OrganizationAppStatus.DISABLED ? new Date() : null,
    },
    include: { app: true },
  });

  return organizationApp;
}

export async function createTestPermission({
  appId,
  key = nextId("permission"),
  label = "Test Permission",
  status = AppPermissionStatus.ACTIVE,
  ...overrides
}: {
  appId: bigint;
  key?: string;
  label?: string;
  status?: AppPermissionStatus;
  [key: string]: any;
}) {
  return prisma.appPermission.create({
    data: {
      appId,
      key,
      label,
      status,
      ...overrides,
    },
  });
}

export async function createTestAppRole({
  appId,
  key = nextId("role"),
  name = "Test Role",
  isDefault = false,
  status = RoleStatus.ACTIVE,
  appPermissionIds = [],
  ...overrides
}: {
  appId: bigint;
  key?: string;
  name?: string;
  isDefault?: boolean;
  status?: RoleStatus;
  appPermissionIds?: bigint[];
  [key: string]: any;
}) {
  return prisma.appRole.create({
    data: {
      appId,
      key,
      name,
      isDefault,
      status,
      ...overrides,
      appRolePermissions: {
        create: appPermissionIds.map((appPermissionId) => ({
          appPermissionId,
        })),
      },
    },
  });
}

export async function assignTestAppRole({
  organizationMemberId,
  appId,
  appRoleId,
  assignedBy = null,
}: {
  organizationMemberId: bigint;
  appId: bigint;
  appRoleId: bigint;
  assignedBy?: bigint | null;
}) {
  return prisma.memberAppRole.create({
    data: {
      organizationMemberId,
      appId,
      appRoleId,
      assignedBy,
    },
  });
}

export async function createTestInvitation({
  organizationId,
  invitedBy,
  email,
  organizationRole = OrganizationRole.MEMBER,
  status = InvitationStatus.PENDING,
  token = generateTestInvitationToken(),
  expiresAt = testInvitationExpiresAt(),
}: {
  organizationId: bigint;
  invitedBy: bigint;
  email?: string;
  organizationRole?: OrganizationRole;
  status?: InvitationStatus;
  token?: string;
  expiresAt?: Date;
}) {
  return prisma.organizationInvitation.create({
    data: {
      organizationId,
      email: email || `${nextId("invite")}@example.test`,
      invitedBy,
      organizationRole,
      status,
      token,
      expiresAt,
      acceptedAt: status === InvitationStatus.ACCEPTED ? new Date() : null,
    },
  });
}
