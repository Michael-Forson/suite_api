export interface CreateCategoryInput {
  name: string;
  parentCategoryId?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
}

export interface SerializedCategory {
  id: string;
  organizationId: string;
  parentCategoryId: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CategoryTreeNode extends SerializedCategory {
  depth: number;
  children: CategoryTreeNode[];
}
