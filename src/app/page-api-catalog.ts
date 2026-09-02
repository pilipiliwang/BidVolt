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
  trackRuntime: boolean;
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
    trackRuntime?: boolean;
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
  trackRuntime: options.trackRuntime ?? true,
  notIntegratedReason: options.notIntegratedReason,
  unavailableReason: options.unavailableReason,
});

const commonAuthenticatedOperations = (): PageApiOperation[] => [
  operation('auth-me', '登录身份校验', '自动：恢复或校验登录状态', 'GET', '/auth/me'),
  operation('auth-refresh', '刷新访问令牌', '自动：访问令牌过期时', 'POST', '/auth/refresh'),
  operation('auth-logout', '退出登录', '操作：点击退出登录', 'POST', '/auth/logout'),
  operation(
    'bootstrap-projects',
    '全局加载：项目列表与服务端搜索',
    '自动：登录成功后；在项目列表输入关键词时携带 q 查询并完整分页',
    'GET',
    '/projects?page=1&size=100',
    { matchQuery: { page: '1', size: '100' } },
  ),
  operation('bootstrap-enterprise-categories', '全局预加载：企业分类', '自动：登录成功后；企业资料页刷新时', 'GET', '/enterprise/categories'),
  operation('bootstrap-enterprise-assets', '全局预加载：企业资料列表', '自动：登录成功后；企业资料页刷新或上传后', 'GET', '/enterprise/assets'),
  operation(
    'image-describe-progress',
    '后台图片识别进度',
    '自动：登录后每 30 秒刷新后台识图进度',
    'GET',
    '/files/image-describe-progress',
  ),
  operation(
    'bootstrap-enterprise-asset-detail',
    '企业资料详情',
    '操作：点击单条企业资料时按需加载',
    'GET',
    '/enterprise/assets/{assetId}',
    { matchPathname: /^\/enterprise\/assets\/[^/]+$/ },
  ),
  operation(
    'bootstrap-enterprise-asset-revisions',
    '企业资料版本',
    '操作：点击单条企业资料时按需加载',
    'GET',
    '/enterprise/assets/{assetId}/revisions',
    { matchPathname: /^\/enterprise\/assets\/[^/]+\/revisions$/ },
  ),
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
      '操作：点击包含图片材料的“读取图片识别详情”',
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
      'project-review-items',
      '加载逐条评审建议',
      '条件自动：最新评审包含评分记录时；确认或重审后刷新',
      'GET',
      `${projectPath}/scores/{scoreId}/items`,
      { matchPathname: new RegExp(`^${projectPattern}/scores/[^/]+/items$`) },
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
    operation(
      'project-task-detail',
      '读取后台任务状态',
      '条件自动：项目存在上传、解析、评审等后台任务时轮询',
      'GET',
      '/tasks/{taskId}',
      { isTask: true, matchPathname: /^\/tasks\/[^/]+$/ },
    ),
    operation(
      'project-task-stream',
      '订阅后台任务实时进度',
      '条件自动：项目后台任务执行时订阅 SSE，断流后回退状态轮询',
      'GET',
      '/tasks/{taskId}/stream',
      { isTask: true, matchPathname: /^\/tasks\/[^/]+\/stream$/ },
    ),
    operation(
      'tender-notice-list',
      '读取招标公告导入记录',
      '自动：进入任一项目页面；网址导入后刷新',
      'GET',
      `${projectPath}/tender-notices`,
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
      '当前公开任务响应没有单项成果清单入口',
      'GET',
      `${projectPath}/agent-artifact/{artifactId}/download`,
      {
        matchPathname: new RegExp(`^${projectPattern}/agent-artifact/[^/]+/download$`),
        notIntegratedReason: '后端提供按 artifactId 下载，但公开任务响应没有可供页面列举的单项成果清单；当前使用响应文件包下载。',
      },
    ),
  ];
};

const projectCheckAndExportOperations = (projectId: string): PageApiOperation[] => {
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;
  const projectPattern = escapeRegExp(projectPath);
  return [
    operation('project-final-check', '提交成果终检', '当前页面暂无终检产品入口', 'POST', `${projectPath}/check`, {
      notIntegratedReason: '后端已提供成果终检接口，但当前产品页面没有终检入口，前端不会自动制造调用。',
    }),
    operation(
      'project-final-check-detail',
      '读取成果终检结果',
      '当前页面暂无终检结果入口',
      'GET',
      `${projectPath}/check/{checkId}`,
      {
        matchPathname: new RegExp(`^${projectPattern}/check/[^/]+$`),
        notIntegratedReason: '需先确定终检产品流程后再接入；当前页面没有 checkId 来源。',
      },
    ),
    operation('project-export', '提交项目导出任务', '当前页面暂无项目导出入口', 'POST', `${projectPath}/export`, {
      notIntegratedReason: '后端已提供项目导出接口，但当前仅有单项成果下载，没有项目导出产品入口。',
    }),
    operation(
      'project-export-status',
      '读取项目导出状态',
      '当前页面暂无项目导出状态入口',
      'GET',
      `${projectPath}/export/{jobId}`,
      {
        matchPathname: new RegExp(`^${projectPattern}/export/[^/]+$`),
        notIntegratedReason: '当前页面不会创建 export job，因此没有可安全轮询的 jobId。',
      },
    ),
    operation('project-delivery-package', '下载项目交付包', '当前页面暂无交付包下载入口', 'GET', `${projectPath}/delivery-package`, {
      notIntegratedReason: '当前页面提供 Agent 响应文件包和单项成果下载，尚无传统 delivery-package 产品入口。',
    }),
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
  operation('project-archive', '存量 ZIP 补解包', '当前页面暂无存量压缩包重处理入口', 'POST', '/files/archive', {
    notIntegratedReason: '最新上传接口会自动展开 ZIP；当前页面没有针对历史存量文件的手动补解包入口。',
  }),
  operation('project-enterprise-ingest', '重新执行企业资料归类', '当前页面暂无手动重归类入口', 'POST', '/enterprise/ingest', {
    notIntegratedReason: '上传后端会按文件名关键词自动归类；当前页面不重复执行同一规则，基于正文或 OCR 内容的归类及确认闭环尚未提供。',
  }),
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

const bidMarketLibraryOperations = (): PageApiOperation[] => [
  operation(
    'bid-market-content-list-search',
    '加载与搜索投标行情内容',
    '计划：进入页面或调整关键词、分类、类型及分页条件时加载',
    'GET',
    '后端未定义',
    {
      trackRuntime: false,
      unavailableReason: '后端尚未提供文章、视频和文档统一内容列表，以及配套的搜索、筛选和分页接口。',
    },
  ),
  operation(
    'bid-market-content-categories',
    '加载投标行情内容分类',
    '计划：进入投标行情库时加载可用分类及数量',
    'GET',
    '后端未定义',
    {
      trackRuntime: false,
      unavailableReason: '后端尚未提供投标行情内容分类目录接口。',
    },
  ),
  operation(
    'bid-market-content-detail',
    '读取投标行情内容详情',
    '计划：打开文章、视频或文档资料时加载',
    'GET',
    '后端未定义',
    {
      trackRuntime: false,
      unavailableReason: '后端尚未提供统一的投标行情内容详情接口。',
    },
  ),
  operation(
    'bid-market-content-preview',
    '预览投标行情内容',
    '计划：在详情弹窗中预览正文、视频或文档',
    'GET',
    '后端未定义',
    {
      trackRuntime: false,
      unavailableReason: '后端尚未提供文章正文、视频流或文档预览内容接口。',
    },
  ),
  operation(
    'bid-market-content-upload',
    '上传投标行情内容',
    '计划：上传文章、视频或文档并归入所选分类',
    'POST',
    '后端未定义',
    {
      trackRuntime: false,
      unavailableReason: '后端尚未提供投标行情内容上传及分类入库接口；通用文件上传不能替代内容库契约。',
    },
  ),
  operation(
    'bid-market-content-import-url',
    '从网址导入投标行情内容',
    '计划：粘贴公众号文章或视频公开地址并归入所选分类',
    'POST',
    '后端未定义',
    {
      trackRuntime: false,
      unavailableReason: '后端尚未提供公开 URL 下载、解析及分类入库接口；该过程不能由浏览器直接代替后端持久化。',
    },
  ),
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
      operation(
        'enterprise-rar-7z-extract',
        '解包 RAR/7Z 压缩包',
        '计划：上传 RAR/7Z 后由服务端安全解包并逐件入库',
        'POST',
        '/files/upload',
        {
          trackRuntime: false,
          unavailableReason: '当前文件上传接口仅支持 ZIP 自动解包；后端会拒绝 RAR/7Z，需先转换为 ZIP。',
        },
      ),
      operation(
        'enterprise-history-bid-extract',
        '历史标书成果智能提取企业资料',
        '计划：上传历史标书成果，异步解析并将可复用企业资料分类入库',
        'POST',
        '后端未定义',
        {
          isTask: true,
          trackRuntime: false,
          unavailableReason: '后端尚未提供历史标书成果解析、企业资料抽取及分类入库接口；现有企业资料归类仅依据文件名。',
        },
      ),
      operation('enterprise-ingest', '重新执行企业资料归类', '当前页面暂无手动重归类入口', 'POST', '/enterprise/ingest', {
        notIntegratedReason: '上传后端会按文件名关键词自动归类；当前页面不重复执行同一规则，基于正文或 OCR 内容的归类及确认闭环尚未提供。',
      }),
      operation('enterprise-update-fact', '纠正企业资料字段', '操作：编辑字段并确认', 'PUT', '/enterprise/facts/{factId}', {
        matchPathname: /^\/enterprise\/facts\/[^/]+$/,
      }),
      operation('enterprise-file-preview-download', '读取企业资料原文件预览', '操作：打开图片、PDF或下载原文件', 'GET', '/files/{fileId}/download', {
        matchPathname: /^\/files\/[^/]+\/download$/,
      }),
      operation('enterprise-file-preview-blocks', '读取企业资料解析文本', '操作：预览 Word、Excel、PPT 等文档', 'GET', '/files/{fileId}/blocks', {
        matchPathname: /^\/files\/[^/]+\/blocks$/,
      }),
      operation('enterprise-rename-asset', '重命名企业资料', '计划：双击资料名称并保存', 'PATCH', '/enterprise/assets/{assetId}', {
        unavailableReason: '当前后端仅提供资料详情读取和分类修改接口，尚未提供企业资料名称更新接口。',
      }),
    ];
  }

  if (route.name === 'bid-market-library') {
    return [...operations, ...bidMarketLibraryOperations()];
  }

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
      operation('tender-notice-detail', '查询单条招标公告导入状态', '条件自动：网址导入尚未完成时按 noticeId 轮询', 'GET', `${projectPath}/tender-notices/{noticeId}`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/tender-notices/[^/]+$`),
      }),
      operation('snapshot-detail', '查看冻结快照详情', '操作：点击快照记录', 'GET', `${projectPath}/snapshots/{snapshotId}`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/snapshots/[^/]+$`),
      }),
      operation('requirement-detail', '读取单条招标要求', '操作：展开某条招标要求', 'GET', '/requirements/{requirementId}', {
        matchPathname: /^\/requirements\/[^/]+$/,
        notIntegratedReason: '当前招标要求列表响应已包含页面展示和纠正所需字段，展开操作不会重复读取单条详情。',
      }),
      operation('requirements-upsert', '写入招标要求识别结果', '当前页面暂无人工新建 Requirement 入口', 'POST', `${projectPath}/requirements/upsert`, {
        notIntegratedReason: '解析结果由后端任务写入；前端现有人工操作使用 confirm/correct，不制造 upsert 调用。',
      }),
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
      operation('review-confirm-item', '确认或不采纳单条评审建议', '操作：点击单条建议的“确认”或“不采纳”', 'PUT', `${projectPath}/scores/{scoreId}/items/{findingId}/confirm`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/scores/[^/]+/items/[^/]+/confirm$`),
      }),
      operation('review-confirm-items', '批量确认待处理评审建议', '操作：点击“确认全部待处理建议”', 'POST', `${projectPath}/scores/{scoreId}/items/confirm`, {
        matchPathname: new RegExp(`^${escapeRegExp(projectPath)}/scores/[^/]+/items/confirm$`),
      }),
      operation('review-re-evaluate', '重新评审已确认建议', '操作：点击“重新评审已确认建议”', 'POST', `${projectPath}/re-evaluate`),
    ];
  }

  if (route.name === 'pricing-center') {
    return [
      ...base,
      operation('quote-calculate', '执行确定性报价测算', '操作：填写物料标识、成本和约束后开始真实测算', 'POST', '/quotes/calculate'),
      operation('quote-recalculate', '按冻结样本复算报价', '条件操作：已有后端测算时点击冻结样本复算', 'POST', '/quotes/recalc'),
      operation('quote-strategy', '生成确定性报价策略', '操作：确认应用报价策略', 'POST', '/quotes/strategies'),
      operation('quote-ai-suggest', '生成有依据的 AI 报价建议区间', '条件操作：已有后端测算时提交可追溯依据；页面仅作为参考区间展示', 'POST', '/quotes/ai-suggest'),
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
  if (!operationDefinition.trackRuntime) return false;
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
