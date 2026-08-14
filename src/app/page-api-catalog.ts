import type { AppRoute } from './router';

export type PageApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type PageApiOperation = {
  id: string;
  feature: string;
  trigger: string;
  method: PageApiMethod;
  path: string;
  matchPathname: string | RegExp;
  matchQuery?: Record<string, string>;
  isTask: boolean;
  notIntegratedReason?: string;
  unavailableReason?: string;
};

export type PageApiRequestLike = {
  method: string;
  path: string;
  pathname?: string;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const operation = (
  id: string,
  feature: string,
  trigger: string,
  method: PageApiMethod,
  path: string,
  options: {
    matchPathname?: string | RegExp;
    matchQuery?: Record<string, string>;
    isTask?: boolean;
    notIntegratedReason?: string;
    unavailableReason?: string;
  } = {},
): PageApiOperation => ({
  id,
  feature,
  trigger,
  method,
  path,
  matchPathname: options.matchPathname ?? path.split('?', 1)[0],
  matchQuery: options.matchQuery,
  isTask: options.isTask ?? false,
  notIntegratedReason: options.notIntegratedReason,
  unavailableReason: options.unavailableReason,
});

const commonAuthenticatedOperations = (): PageApiOperation[] => [
  operation('auth-me', '登录身份校验', '自动：恢复或校验登录状态', 'GET', '/auth/me'),
  operation('auth-refresh', '刷新访问令牌', '自动：访问令牌过期时', 'POST', '/auth/refresh'),
  operation('auth-logout', '退出登录', '操作：点击退出登录', 'POST', '/auth/logout'),
  operation(
    'bootstrap-projects',
    '全局预加载：项目列表',
    '自动：登录成功后',
    'GET',
    '/projects?page=1&size=100',
    { matchQuery: { page: '1', size: '100' } },
  ),
  operation('bootstrap-enterprise-categories', '全局预加载：企业分类', '自动：登录成功后；企业资料页刷新时', 'GET', '/enterprise/categories'),
  operation('bootstrap-enterprise-assets', '全局预加载：企业资料列表', '自动：登录成功后；企业资料页刷新或上传后', 'GET', '/enterprise/assets'),
  operation('bootstrap-enterprise-ingestions', '全局预加载：企业归类任务', '自动：登录成功后；企业资料页刷新或上传后', 'GET', '/enterprise/ingest'),
  operation(
    'bootstrap-enterprise-asset-detail',
    '全局预加载：企业资料详情',
    '自动：每份企业资料加载详情',
    'GET',
    '/enterprise/assets/{assetId}',
    { matchPathname: /^\/enterprise\/assets\/[^/]+$/ },
  ),
  operation(
    'bootstrap-enterprise-asset-revisions',
    '全局预加载：企业资料版本',
    '自动：每份企业资料加载版本记录',
    'GET',
    '/enterprise/assets/{assetId}/revisions',
    { matchPathname: /^\/enterprise\/assets\/[^/]+\/revisions$/ },
  ),
  operation('bootstrap-history-quotes', '全局预加载：历史报价', '自动：登录成功后', 'GET', '/quotes/history'),
  operation('bootstrap-review-providers', '全局预加载：评审机制', '自动：登录成功后', 'GET', '/review-providers'),
];

const projectAutomaticOperations = (projectId: string): PageApiOperation[] => {
  const encoded = encodeURIComponent(projectId);
  const projectPath = `/projects/${encoded}`;
  const projectPattern = escapeRegExp(projectPath);
  return [
    operation('project-detail', '读取当前项目', '自动：进入项目路由', 'GET', projectPath),
    operation(
      'project-materials',
      '加载当前项目材料',
      '自动：进入项目；上传或任务完成后刷新',
      'GET',
      `/files?target=project&project_id=${encoded}&page=1&size=100`,
      { matchPathname: '/files', matchQuery: { target: 'project', project_id: projectId, page: '1', size: '100' } },
    ),
    operation(
      'project-requirements',
      '加载招标要求',
      '自动：进入项目；上传或任务完成后刷新',
      'GET',
      `/requirements?project_id=${encoded}`,
      { matchPathname: '/requirements', matchQuery: { project_id: projectId } },
    ),
    operation('project-snapshots', '加载项目快照', '自动：进入项目；任务完成后刷新', 'GET', `${projectPath}/snapshots`),
    operation('project-tasks', '加载及轮询任务进度', '自动：进入项目；有运行中任务时每 2.5 秒', 'GET', `${projectPath}/tasks`, {
      isTask: true,
    }),
    operation(
      'task-status',
      '查询单任务状态与结果',
      '自动：发现待执行或执行中任务时，每 2.5 秒查询最近 8 个活动任务',
      'GET',
      '/tasks/{taskId}',
      {
        isTask: true,
        matchPathname: /^\/tasks\/[^/]+$/,
      },
    ),
    operation(
      'task-stream',
      '订阅单任务实时进度',
      '自动：当前项目存在执行中的成果生成任务时，以 Bearer 鉴权订阅；断流后回退轮询',
      'GET',
      '/tasks/{taskId}/stream',
      {
        isTask: true,
        matchPathname: /^\/tasks\/[^/]+\/stream$/,
      },
    ),
    operation(
      'project-deliverables',
      '加载成果列表',
      '自动：进入项目；生成或保存后刷新',
      'GET',
      `/deliverables?project_id=${encoded}`,
      { matchPathname: '/deliverables', matchQuery: { project_id: projectId } },
    ),
    operation(
      'project-deliverable-versions',
      '加载每项成果的真实版本列表',
      '条件自动：成果列表返回后，并发读取各成果版本',
      'GET',
      '/deliverables/{deliverableId}/versions',
      { matchPathname: /^\/deliverables\/[^/]+\/versions$/ },
    ),
    operation('project-review-runs', '加载评审记录', '自动：进入项目；评审后刷新', 'GET', `${projectPath}/reviews`),
    operation('project-latest-score', '加载最新评分', '自动：进入项目；评审后刷新', 'GET', `${projectPath}/scores`),
    operation(
      'project-review-run-detail',
      '加载最新评审详情',
      '条件自动：存在评审记录时',
      'GET',
      `${projectPath}/reviews/{runId}`,
      { matchPathname: new RegExp(`^${projectPattern}/reviews/[^/]+$`) },
    ),
    operation(
      'project-quotes',
      '加载项目报价测算列表',
      '自动：进入项目；应用策略后刷新',
      'GET',
      `/quotes?project_id=${encoded}`,
      { matchPathname: '/quotes', matchQuery: { project_id: projectId } },
    ),
    operation(
      'project-quote-detail',
      '加载当前报价测算详情',
      '条件自动：项目存在报价测算时',
      'GET',
      '/quotes/{calcId}',
      { matchPathname: /^\/quotes\/(?!history(?:\/|$)|calculate$|recalc$|strategies$|apply$)[^/]+$/ },
    ),
  ];
};

const sharedProjectActions = (projectId: string): PageApiOperation[] => {
  const encoded = encodeURIComponent(projectId);
  const projectPath = `/projects/${encoded}`;
  const projectPattern = escapeRegExp(projectPath);
  return [
    operation('project-upload', '上传项目材料或企业资料', '操作：点击任一上传文件按钮', 'POST', '/files/upload'),
    operation('project-archive', '解包上传的 ZIP/RAR/7Z', '条件操作：上传压缩包成功后', 'POST', '/files/archive'),
    operation('project-enterprise-ingest', '提交企业资料自动归类', '条件操作：企业资料上传并关联成功后', 'POST', '/enterprise/ingest'),
    operation('assistant-conversations', '查询项目助手会话', '操作：发送项目助手问题', 'GET', `${projectPath}/conversations`),
    operation('assistant-create-conversation', '创建项目助手会话', '条件操作：首次发送且没有现有会话', 'POST', `${projectPath}/conversations`),
    operation(
      'assistant-send-message',
      '发送项目助手消息',
      '操作：发送项目助手问题',
      'POST',
      `${projectPath}/conversations/{conversationId}/messages`,
      { matchPathname: new RegExp(`^${projectPattern}/conversations/[^/]+/messages$`) },
    ),
  ];
};

const downloadDeliverableOperation = (): PageApiOperation => operation(
  'deliverable-download',
  '下载成果文件',
  '操作：点击下载或导出',
  'GET',
  '/deliverables/{deliverableId}/versions/{versionNo}/download',
  { matchPathname: /^\/deliverables\/[^/]+\/versions\/[^/]+\/download$/ },
);

const loginOperations = (): PageApiOperation[] => [
  operation('auth-login', '账号登录', '操作：提交登录表单', 'POST', '/auth/login'),
  operation('auth-register', '注册企业账号', '操作：提交注册表单', 'POST', '/auth/register'),
  operation('auth-me-after-login', '读取登录身份', '自动：登录或注册成功后', 'GET', '/auth/me'),
  operation('auth-forgot-password', '找回密码', '操作：点击忘记密码', 'POST', '/auth/forgot-password', {
    unavailableReason: '当前后端尚未提供找回密码接口。',
  }),
];

export function pageApiCatalog(route: AppRoute): PageApiOperation[] {
  if (route.name === 'login') return loginOperations();
  if (route.name === 'landing' || route.name === 'not-found') return [];

  const operations = commonAuthenticatedOperations();

  if (route.name === 'projects') {
    return [
      ...operations,
      operation('projects-create', '新增投标项目', '操作：提交新增项目表单', 'POST', '/projects'),
      operation('projects-archive', '归档投标项目', '操作：点击归档项目', 'POST', '/projects/{projectId}/archive', {
        matchPathname: /^\/projects\/[^/]+\/archive$/,
      }),
    ];
  }

  if (route.name === 'enterprise-assets') {
    return [
      ...operations,
      operation('enterprise-upload', '上传企业资料', '操作：选择或拖入企业文件', 'POST', '/files/upload'),
      operation('enterprise-ingest', '提交企业资料自动归类', '条件操作：上传文件已关联为企业资料', 'POST', '/enterprise/ingest'),
      operation('enterprise-update-fact', '纠正企业资料字段', '操作：编辑字段并确认', 'PUT', '/enterprise/facts/{factId}', {
        matchPathname: /^\/enterprise\/facts\/[^/]+$/,
      }),
      operation('enterprise-revision-content', '读取企业资料历史版本内容', '操作：选择某个历史版本', 'GET', '/enterprise/assets/{assetId}/revisions/{revisionId}', {
        unavailableReason: '当前后端只返回版本摘要，尚未提供历史版本内容读取接口。',
      }),
    ];
  }

  if (route.name === 'history-prices') return operations;

  const projectId = route.projectId;
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;
  const base = [
    ...operations,
    ...projectAutomaticOperations(projectId),
    ...sharedProjectActions(projectId),
  ];

  if (route.name === 'project-overview') {
    return [...base, downloadDeliverableOperation()];
  }

  if (route.name === 'project-materials') {
    return [
      ...base,
      operation('tender-notice-import', '从网址导入招标公告', '操作：粘贴网址并提交', 'POST', `${projectPath}/tender-notices/import-url`),
      operation('tender-notice-import-status', '查询招标公告导入状态', '条件自动：网址导入尚未完成时每 2 秒', 'GET', `${projectPath}/tender-notices/imports/{importId}`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/tender-notices/imports/[^/]+$`),
      }),
      operation('snapshot-detail', '查看冻结快照详情', '操作：点击快照记录', 'GET', `${projectPath}/snapshots/{snapshotId}`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/snapshots/[^/]+$`),
      }),
      operation('task-create', '提交任务（仅入队）', '操作：点击开始生成或开始校核', 'POST', `${projectPath}/tasks`, {
        isTask: true,
      }),
      operation('requirement-confirm', '确认招标要求原文', '操作：点击确认原文', 'POST', `${projectPath}/requirements/{requirementId}/confirm`, {
        unavailableReason: '当前后端尚未提供 Requirement 确认接口。',
      }),
      operation('completed-bid-purpose', '按“已完成标书”用途持久化上传文件', '操作：上传已制作完成的标书', 'POST', `${projectPath}/completed-bids/uploads`, {
        unavailableReason: '当前只能复用普通项目材料上传，后端没有已完成标书的用途或类型字段，刷新后无法恢复该分类。',
      }),
      operation('completed-bid-summary', '读取已上传标书数量', '自动：进入材料页看板', 'GET', `${projectPath}/completed-bids/summary`, {
        unavailableReason: '文件列表和上传响应没有持久化 document_role/purpose 字段，后端尚未提供可读取的已完成标书数量。',
      }),
      operation('pending-check-summary', '读取待校核内容数量', '自动：进入材料页看板', 'GET', `${projectPath}/check/latest`, {
        unavailableReason: '后端只有创建 check 和按 checkId 读取，尚未提供项目 latest/list 汇总；前端不会为读取数量触发 POST check。',
      }),
    ];
  }

  if (route.name === 'review-center') {
    return [
      ...base,
      operation('review-evaluate', '运行外部评审', '操作：选择评审机制并运行', 'POST', `${projectPath}/evaluate`),
      operation('review-update-suggestion', '保存编辑后的评审建议', '操作：确认编辑建议', 'PUT', `${projectPath}/scores/{scoreId}/items/{findingId}/suggestion`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/scores/[^/]+/items/[^/]+/suggestion$`),
      }),
    ];
  }

  if (route.name === 'pricing-center') {
    return [
      ...base,
      operation('quote-strategy', '生成确定性报价策略', '操作：确认应用报价策略', 'POST', '/quotes/strategies'),
      operation('quote-apply', '应用策略并生成报价新版本', '操作：策略测算成功后', 'POST', '/quotes/apply'),
    ];
  }

  return [
    ...base,
    operation('deliverable-version', '加载指定成果版本', '自动：进入成果编辑页', 'GET', '/deliverables/{deliverableId}/versions/{versionNo}', {
      matchPathname: /^\/deliverables\/[^/]+\/versions\/[^/]+$/,
    }),
    operation('editor-create-session', '创建成果编辑会话', '条件自动：打开当前最新版', 'POST', '/deliverables/{deliverableId}/editor-sessions', {
      matchPathname: /^\/deliverables\/[^/]+\/editor-sessions$/,
    }),
    operation('editor-list-sessions', '查询已有编辑会话', '条件自动：创建会话返回冲突', 'GET', '/deliverables/{deliverableId}/editor-sessions', {
      matchPathname: /^\/deliverables\/[^/]+\/editor-sessions$/,
    }),
    operation('editor-get-session', '读取已有会话检查点', '条件自动：发现可读取的活动会话', 'GET', '/deliverables/{deliverableId}/editor-sessions/{sessionId}', {
      matchPathname: /^\/deliverables\/[^/]+\/editor-sessions\/[^/]+$/,
    }),
    operation('editor-checkpoint', '保存编辑检查点', '操作：点击保存成果', 'PUT', '/deliverables/{deliverableId}/editor-sessions/{sessionId}/checkpoint', {
      matchPathname: /^\/deliverables\/[^/]+\/editor-sessions\/[^/]+\/checkpoint$/,
    }),
    operation('editor-complete', '完成编辑并生成新版本', '操作：检查点保存成功后', 'POST', '/deliverables/{deliverableId}/editor-sessions/{sessionId}/complete', {
      matchPathname: /^\/deliverables\/[^/]+\/editor-sessions\/[^/]+\/complete$/,
    }),
    operation('editor-cancel', '取消或释放编辑会话', '条件操作：离开页面或租约不匹配', 'POST', '/deliverables/{deliverableId}/editor-sessions/{sessionId}/cancel', {
      matchPathname: /^\/deliverables\/[^/]+\/editor-sessions\/[^/]+\/cancel$/,
    }),
    downloadDeliverableOperation(),
  ];
}

function requestUrl(path: string) {
  return new URL(path, 'https://api-status.invalid');
}

export function pageApiOperationMatches(
  operationDefinition: PageApiOperation,
  request: PageApiRequestLike,
) {
  if (request.method.toUpperCase() !== operationDefinition.method) return false;

  const url = requestUrl(request.path);
  const pathname = request.pathname ?? url.pathname;
  const pathMatches = typeof operationDefinition.matchPathname === 'string'
    ? pathname === operationDefinition.matchPathname
    : operationDefinition.matchPathname.test(pathname);
  if (!pathMatches) return false;

  return Object.entries(operationDefinition.matchQuery ?? {}).every(
    ([key, value]) => url.searchParams.get(key) === value,
  );
}
