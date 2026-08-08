export interface CreateUnitInput {
  name: string;
  symbol: string;
}

export interface UpdateUnitInput {
  name?: string;
  symbol?: string;
}

export interface SerializedUnit {
  id: string;
  organizationId: string;
  name: string;
  symbol: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
