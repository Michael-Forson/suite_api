export type InvitationOrganizationRole = "ADMIN" | "MEMBER";

export interface CreateStaffInvitationRequestBody {
  email: string;
  organizationRole?: InvitationOrganizationRole;
  jobTitle?: string | null;
}

export interface AcceptInvitationRequestBody {
  token: string;
}
