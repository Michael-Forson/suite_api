export type ManageableOrganizationRole = "ADMIN" | "MEMBER";

export type ManageableMemberStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface UpdateMemberJobTitleRequestBody {
  jobTitle?: string | null;
}

export interface ChangeMemberRoleRequestBody {
  organizationRole: ManageableOrganizationRole;
}

export interface ChangeMemberStatusRequestBody {
  status: ManageableMemberStatus;
}
