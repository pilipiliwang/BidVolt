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
    'image-describe-progress',
    '后台图片识别进度',
    '自动：登录后每 30 秒刷新后台识图进度',
    'GET',
    '/files/image-describe-progress',
  ),
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
      `/files?target=project&project_id=${encoded}&page={page}&size=100`,
      { matchPathname: '/files', matchQuery: { target: 'project', project_id: projectId, size: '100' } },
    ),
    operation(
      'project-materials-enriched',
      '加载项目材料解析详情',
      '自动：进入项目；与文件列表并发读取块统计、图片识别和压缩包来源',
      'GET',
      `/files/projects/${encoded}/materials`,
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
    operation(
      'project-file-image-descriptions',
      '读取材料图片结构化描述',
      '条件自动：查看包含图片的项目材料时',
      'GET',
      '/files/{fileId}/image-descriptions',
      { matchPathname: /^\/files\/[^/]+\/image-descriptions$/ },
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
    operation(
      'project-task-history',
      '恢复项目任务记录',
      '自动：进入项目；兼容恢复历史任务和任务进度',
      'GET',
      `${projectPath}/tasks`,
      { isTask: true },
    ),
  ];
};

const projectAgentOperations = (projectId: string): PageApiOperation[] => {
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;
  const projectPattern = escapeRegExp(projectPath);

  // `/assembly/*` and `POST .../asks` are tools used inside the Agent main
  // session. Browser pages consume the run, question, package, and artifact
  // contracts below, so the internal tool chain is intentionally not listed.
  return [
    operation(
      'agent-run-start',
      '启动 Agent 投标主任务',
      '操作：点击开始生成；重复提交由 idempotency_key 复用原任务',
      'POST',
      `${projectPath}/agent-run`,
      { isTask: true },
    ),
    operation(
      'agent-run-status',
      '读取 Agent 任务状态与真实进度',
      '自动：存在当前 Agent 任务时每 8 秒轮询，直至终态',
      'GET',
      `${projectPath}/agent-run/{taskId}`,
      {
        isTask: true,
        matchPathname: new RegExp(`^${projectPattern}/agent-run/[^/]+$`),
      },
    ),
    operation(
      'agent-run-stream',
      '订阅 Agent 主会话实时消息',
      '自动：存在当前 Agent 任务时订阅 SSE；重连时通过 since 续传',
      'GET',
      `${projectPath}/agent-run/{taskId}/stream?since={seq}`,
      {
        isTask: true,
        matchPathname: new RegExp(`^${projectPattern}/agent-run/[^/]+/stream$`),
      },
    ),
    operation(
      'agent-run-questions',
      '读取 Agent 客户问卡',
      '自动：任务运行期间刷新待回答问题、倒计时和行动清单',
      'GET',
      `${projectPath}/agent-run/{taskId}/questions`,
      {
        isTask: true,
        matchPathname: new RegExp(`^${projectPattern}/agent-run/[^/]+/questions$`),
      },
    ),
    operation(
      'agent-run-answer',
      '回答 Agent 客户问卡',
      '操作：提交某组问卡答案',
      'POST',
      `${projectPath}/agent-run/{taskId}/asks/{askId}/answer`,
      {
        isTask: true,
        matchPathname: new RegExp(`^${projectPattern}/agent-run/[^/]+/asks/[^/]+/answer$`),
      },
    ),
    operation(
      'agent-run-chat',
      '向 Agent 主会话发送消息',
      '操作：在任务控制台排队消息或调整后续方向',
      'POST',
      `${projectPath}/agent-run/{taskId}/chat`,
      {
        isTask: true,
        matchPathname: new RegExp(`^${projectPattern}/agent-run/[^/]+/chat$`),
      },
    ),
    operation(
      'agent-pre-chat',
      '任务开始前咨询项目资料',
      '操作：尚未启动 Agent 任务时发送项目助手消息',
      'POST',
      `${projectPath}/pre-chat`,
    ),
    operation(
      'project-response-package',
      '下载 Agent 响应文件包',
      '操作：Agent 完成打包后点击下载响应文件包',
      'GET',
      `${projectPath}/response-package`,
    ),
    operation(
      'agent-artifact-download',
      '下载 Agent 单项成果文件',
      '操作：在成果清单点击下载单项文件',
      'GET',
      `${projectPath}/agent-artifact/{artifactId}/download`,
      { matchPathname: new RegExp(`^${projectPattern}/agent-artifact/[^/]+/download$`) },
    ),
  ];
};

const projectCheckAndExportOperations = (projectId: string): PageApiOperation[] => {
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;
  const projectPattern = escapeRegExp(projectPath);
  return [
    operation('project-final-check', '提交成果终检', '操作：在导出或交付前运行终检', 'POST', `${projectPath}/check`, {
      isTask: true,
    }),
    operation(
      'project-final-check-detail',
      '读取成果终检结果',
      '条件自动：提交终检后按 checkId 查询结果',
      'GET',
      `${projectPath}/check/{checkId}`,
      {
        isTask: true,
        matchPathname: new RegExp(`^${projectPattern}/check/[^/]+$`),
      },
    ),
    operation('project-export', '提交项目导出任务', '操作：选择导出配置并提交', 'POST', `${projectPath}/export`, {
      isTask: true,
    }),
    operation(
      'project-export-status',
      '读取项目导出状态',
      '条件自动：导出任务运行期间按 jobId 轮询',
      'GET',
      `${projectPath}/export/{jobId}`,
      {
        isTask: true,
        matchPathname: new RegExp(`^${projectPattern}/export/[^/]+$`),
      },
    ),
    operation('project-delivery-package', '下载项目交付包', '操作：导出任务完成后下载交付包', 'GET', `${projectPath}/delivery-package`),
  ];
};

const sharedProjectActions = (): PageApiOperation[] => [
  operation(
    'project-upload',
    '上传项目材料或企业资料',
    '操作：上传时传入 document_role；ZIP 由上传接口自动解包',
    'POST',
    '/files/upload',
  ),
  operation('project-archive', '存量 ZIP 补解包', '操作：对已入库但未展开的 ZIP 点击解包入库', 'POST', '/files/archive'),
  operation('project-enterprise-ingest', '重新执行企业资料归类', '操作：手动重新处理存量企业资料', 'POST', '/enterprise/ingest'),
];

const historyQuoteOperations = (): PageApiOperation[] => [
  operation(
    'quote-history-source-metadata',
    '读取行情库来源元数据',
    '自动：进入历史报价页时加载可筛选的数据来源',
    'GET',
    '/quotes/history/source-metadata',
  ),
  operation('quote-history-import', '导入历史报价样本', '操作：上传公共库或企业私有库 XLSX', 'POST', '/quotes/history/import'),
  operation(
    'quote-history-material-samples',
    '读取物料历史样本',
    '操作：展开某个物料的逐条可复核样本',
    'GET',
    '/quotes/history/{materialRef}/samples',
    { matchPathname: /^\/quotes\/history\/(?!samples(?:\/|$)|source-metadata$)[^/]+\/samples$/ },
  ),
  operation(
    'quote-history-sample-detail',
    '读取单条历史报价样本',
    '操作：查看某条历史报价的来源与明细',
    'GET',
    '/quotes/history/samples/{sampleId}',
    { matchPathname: /^\/quotes\/history\/samples\/[^/]+$/ },
  ),
  operation(
    'quote-history-material-trend',
    '读取物料报价趋势',
    '操作：查看物料趋势和可比样本统计',
    'GET',
    '/quotes/history/{materialRef}/trend',
    { matchPathname: /^\/quotes\/history\/(?!samples(?:\/|$)|source-metadata$)[^/]+\/trend$/ },
  ),
];

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
      operation('enterprise-ingest', '重新执行企业资料归类', '操作：手动重新处理存量企业资料', 'POST', '/enterprise/ingest'),
      operation(
        'enterprise-file-image-descriptions',
        '读取企业资料图片结构化描述',
        '条件自动：查看包含图片的企业资料时',
        'GET',
        '/files/{fileId}/image-descriptions',
        { matchPathname: /^\/files\/[^/]+\/image-descriptions$/ },
      ),
      operation('enterprise-update-fact', '纠正企业资料字段', '操作：编辑字段并确认', 'PUT', '/enterprise/facts/{factId}', {
        matchPathname: /^\/enterprise\/facts\/[^/]+$/,
      }),
      operation('enterprise-revision-content', '读取企业资料历史版本内容', '操作：选择某个历史版本', 'GET', '/enterprise/assets/{assetId}/revisions/{revisionId}', {
        unavailableReason: '当前后端只返回版本摘要，尚未提供历史版本内容读取接口。',
      }),
    ];
  }

  if (route.name === 'history-prices') return [
    ...operations,
    ...historyQuoteOperations(),
  ];

  const projectId = route.projectId;
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;
  const base = [
    ...operations,
    ...projectAutomaticOperations(projectId),
    ...projectAgentOperations(projectId),
    ...projectCheckAndExportOperations(projectId),
    ...sharedProjectActions(),
  ];

  if (route.name === 'project-overview') {
    return [...base, downloadDeliverableOperation()];
  }

  if (route.name === 'project-materials') {
    return [
      ...base,
      operation('tender-notice-import', '从网址导入招标公告', '操作：粘贴公开网址并提交', 'POST', `${projectPath}/tender-notices/import-url`),
      operation('tender-notice-list', '读取招标公告导入记录', '自动：进入材料页；网址导入后刷新', 'GET', `${projectPath}/tender-notices`),
      operation('tender-notice-detail', '查询单条招标公告导入状态', '条件自动：网址导入尚未完成时按 noticeId 轮询', 'GET', `${projectPath}/tender-notices/{noticeId}`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/tender-notices/[^/]+$`),
      }),
      operation('snapshot-detail', '查看冻结快照详情', '操作：点击快照记录', 'GET', `${projectPath}/snapshots/{snapshotId}`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/snapshots/[^/]+$`),
      }),
      operation('requirement-detail', '读取单条招标要求', '操作：展开某条招标要求', 'GET', '/requirements/{requirementId}', {
        matchPathname: /^\/requirements\/[^/]+$/,
      }),
      operation('requirements-upsert', '写入招标要求识别结果', '条件操作：解析或人工整理后提交要求', 'POST', `${projectPath}/requirements/upsert`),
      operation('requirement-confirm', '确认招标要求原文', '操作：携带 expected_revision 确认要求', 'PUT', `${projectPath}/requirements/{requirementId}/confirm`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/requirements/[^/]+/confirm$`),
      }),
      operation('requirement-correct', '纠正招标要求内容', '操作：携带 expected_revision 保存人工纠正', 'PUT', `${projectPath}/requirements/{requirementId}/correct`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/requirements/[^/]+/correct$`),
      }),
    ];
  }

  if (route.name === 'review-center') {
    return [
      ...base,
      operation('review-evaluate', '运行模拟评审', '操作：选择已启用 Provider（或使用后端默认项）并运行', 'POST', `${projectPath}/evaluate`),
      operation('review-update-suggestion', '保存编辑后的评审建议', '操作：确认编辑建议', 'PUT', `${projectPath}/scores/{scoreId}/items/{findingId}/suggestion`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/scores/[^/]+/items/[^/]+/suggestion$`),
      }),
    ];
  }

  if (route.name === 'pricing-center') {
    return [
      ...base,
      operation('quote-calculate', '执行确定性报价测算', '操作：提交材料、成本和报价参数', 'POST', '/quotes/calculate'),
      operation('quote-recalculate', '按冻结样本复算报价', '操作：点击复算并校验历史测算', 'POST', '/quotes/recalc'),
      operation('quote-strategy', '生成确定性报价策略', '操作：确认应用报价策略', 'POST', '/quotes/strategies'),
      operation('quote-ai-suggest', '生成有依据的 AI 报价建议区间', '操作：请求 AI 辅助分析；正式报价仍走确定性链路', 'POST', '/quotes/ai-suggest'),
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
