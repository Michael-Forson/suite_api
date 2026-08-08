export interface CreateBrandInput {
  name: string;
}

export interface UpdateBrandInput {
  name?: string;
}

export interface SerializedBrand {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
