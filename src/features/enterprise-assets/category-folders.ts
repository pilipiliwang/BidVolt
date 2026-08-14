import type { EnterpriseAssetCategoryFolder } from './types';

export const ALL_ENTERPRISE_ASSETS_FOLDER_ID = 'all-enterprise-assets';
export const UNCATEGORIZED_ENTERPRISE_ASSETS_FOLDER_ID = 'uncategorized-enterprise-assets';

export type EnterpriseAssetFolder<T> = {
  categoryId: string | null;
  id: string;
  items: T[];
  kind: 'all' | 'category' | 'uncategorized';
  label: string;
  parentId: string | null;
};

type CategoryAssignedItem = {
  categoryId?: string | null;
};

export function buildEnterpriseAssetFolders<T extends CategoryAssignedItem>(
  categories: readonly EnterpriseAssetCategoryFolder[],
  items: readonly T[],
): EnterpriseAssetFolder<T>[] {
  const uniqueCategories = categories.filter((category, index) =>
    category.id.length > 0
    && categories.findIndex((candidate) => candidate.id === category.id) === index);
  const categoryIds = new Set(uniqueCategories.map((category) => category.id));
  const folders: EnterpriseAssetFolder<T>[] = [
    {
      categoryId: null,
      id: ALL_ENTERPRISE_ASSETS_FOLDER_ID,
      items: [...items],
      kind: 'all',
      label: '全部资料',
      parentId: null,
    },
    ...uniqueCategories.map((category) => ({
      categoryId: category.id,
      id: `enterprise-category:${category.id}`,
      items: items.filter((item) => item.categoryId === category.id),
      kind: 'category' as const,
      label: category.label.trim() || `分类 #${category.id}`,
      parentId: category.parentId,
    })),
  ];
  const uncategorizedItems = items.filter((item) =>
    !item.categoryId || !categoryIds.has(item.categoryId));

  if (uncategorizedItems.length > 0) {
    folders.push({
      categoryId: null,
      id: UNCATEGORIZED_ENTERPRISE_ASSETS_FOLDER_ID,
      items: uncategorizedItems,
      kind: 'uncategorized',
      label: '未分类资料',
      parentId: null,
    });
  }

  return folders;
}
