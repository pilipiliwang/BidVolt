import type { EnterpriseAssetCategoryFolder } from './types';

export const ALL_ENTERPRISE_ASSETS_FOLDER_ID = 'all-enterprise-assets';
export const SOURCE_ENTERPRISE_ASSETS_FOLDER_ID = 'source-enterprise-assets';
export const UNCATEGORIZED_ENTERPRISE_ASSETS_FOLDER_ID = 'uncategorized-enterprise-assets';

export type EnterpriseAssetFolder<T> = {
  categoryId: string | null;
  id: string;
  items: T[];
  kind: 'all' | 'category' | 'source' | 'uncategorized';
  label: string;
  parentId: string | null;
};

type CategoryAssignedItem = {
  categoryId?: string | null;
  name: string;
};

type EnterpriseAssetFolderOptions = {
  allLabel?: string;
  separateSourceArchives?: boolean;
};

const archiveExtensions = new Set(['7z', 'rar', 'zip']);

export function isEnterpriseSourceArchive(item: CategoryAssignedItem) {
  const extension = item.name.split('.').at(-1)?.trim().toLocaleLowerCase();
  return extension ? archiveExtensions.has(extension) : false;
}

export function buildEnterpriseAssetFolders<T extends CategoryAssignedItem>(
  categories: readonly EnterpriseAssetCategoryFolder[],
  items: readonly T[],
  options: EnterpriseAssetFolderOptions = {},
): EnterpriseAssetFolder<T>[] {
  const uniqueCategories = categories.filter((category, index) =>
    category.id.length > 0
    && categories.findIndex((candidate) => candidate.id === category.id) === index);
  const sourceCategoryIds = new Set(
    options.separateSourceArchives
      ? uniqueCategories
        .filter((category) => category.label.trim() === '源文件')
        .map((category) => category.id)
      : [],
  );
  const businessCategories = uniqueCategories.filter(
    (category) => !sourceCategoryIds.has(category.id),
  );
  const categoryIds = new Set(businessCategories.map((category) => category.id));
  const isSourceItem = (item: CategoryAssignedItem) =>
    isEnterpriseSourceArchive(item)
    || (item.categoryId ? sourceCategoryIds.has(item.categoryId) : false);
  const sourceArchives = options.separateSourceArchives ? items.filter(isSourceItem) : [];
  const businessItems = options.separateSourceArchives
    ? items.filter((item) => !isSourceItem(item))
    : [...items];
  const folders: EnterpriseAssetFolder<T>[] = [
    {
      categoryId: null,
      id: ALL_ENTERPRISE_ASSETS_FOLDER_ID,
      items: [...items],
      kind: 'all',
      label: options.allLabel ?? '全部资料',
      parentId: null,
    },
    ...(options.separateSourceArchives ? [{
      categoryId: null,
      id: SOURCE_ENTERPRISE_ASSETS_FOLDER_ID,
      items: sourceArchives,
      kind: 'source' as const,
      label: '源文件',
      parentId: null,
    }] : []),
    ...businessCategories.map((category) => ({
      categoryId: category.id,
      id: `enterprise-category:${category.id}`,
      items: businessItems.filter((item) => item.categoryId === category.id),
      kind: 'category' as const,
      label: category.label.trim() || `分类 #${category.id}`,
      parentId: category.parentId,
    })),
  ];
  const uncategorizedItems = businessItems.filter((item) =>
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
