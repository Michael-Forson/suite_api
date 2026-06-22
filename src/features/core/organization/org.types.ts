export type OrganizationStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "DISABLED";

export interface CreateOrganizationRequestBody {
  name: string;
  slug?: string;
  businessType?: string;
  industry?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  country?: string;
  city?: string;
  address?: string;
}

export interface UpdateOrganizationProfileRequestBody {
  name?: string;
  slug?: string;
  businessType?: string | null;
  industry?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
}

export interface ChangeOrganizationStatusRequestBody {
  status: OrganizationStatus;
}
