const en = {
  title: 'Turn your choices into a story',
  intro:
    'Preview a text proposal, explore its shots, then decide whether to use it.',
  studioBoundary:
    'Save creative choices and optionally request a text proposal when the gateway supports it. No video is generated or published here.',
  refresh: 'Refresh proposals and draft',
  loading: 'Reading saved proposals…',
  disabled:
    'Text planning is not enabled on this gateway. Your creative brief remains available.',
  unsupported:
    'This gateway uses a planning contract this interface does not authorize. You can still read existing proposals.',
  finish:
    'Finish the guide above first. After reopening a draft, use “Continue the guide” to let the server confirm completion; viewing this panel never advances it.',
  terms:
    'Text pilot · external model costs are paid by the operator; your wallet is not charged. This request sends the saved creative brief to the configured text model. It does not generate video.',
  model:
    'Configured model: {model}. Up to {limit} new tasks per workspace in a rolling 24 hours; other queue and retention limits also apply.',
  confirm:
    'Send the creative brief from version {version} to generate one text proposal.',
  generate: 'Generate a story and shot proposal',
  recover: 'Confirm the previous request',
  uncertain:
    'The previous submission could not be confirmed. Resolve it with the same request key before starting another. Replaying may submit the original version if it never arrived; it does not silently start a new request.',
  recoveredVersion:
    'The unresolved request uses version {version}, not a newer draft.',
  queueHint:
    'Queued does not mean a model is running. A separate planner worker must be online. Leaving this page does not cancel the task.',
  noTasks: 'No saved text proposals yet.',
  proposals: 'Saved proposals',
  version: 'Source version {version}',
  acceptedVersion: 'Used in draft version {version}',
  stale:
    'This proposal belongs to a different draft version. You can read it, but cannot use it to overwrite the current draft.',
  accept: 'Use this proposal in my draft',
  acceptConfirm:
    'Use this story and all its shots as the plan for version {version}. This creates a new draft version; it does not start filming.',
  cancel: 'Cancel this task / discard this proposal',
  cancelConfirm:
    'Cancel this task or discard this proposal? This cannot undo upstream computation or guarantee zero external cost.',
  cancelAction: 'Confirm cancellation',
  keep: 'Keep it',
  readDraft: 'Reload the saved draft',
  working: 'Saving your decision…',
  unknownUsage: 'Token usage was not reported. Unknown does not mean zero.',
  usage:
    'Reported text usage: {input} input tokens · {output} output tokens. Not a price quote.',
  taskFailure:
    'This attempt did not produce an available proposal. Refresh to reconcile its status; another generation requires a new explicit request.',
  code: 'Status detail: {code}',
  auth: 'Sign in again before continuing.',
  forbidden: 'This session cannot access planning. Revalidate your account.',
  quota:
    'A planning limit was reached. Continue an existing proposal or ask the operator about limits; no automatic retry will run.',
  pending:
    'This project already has a queued or running task. Refresh to find it.',
  conflict:
    'The draft or task changed. Refresh both before deciding again; nothing will be overwritten automatically.',
  notReady:
    'This task can no longer perform that action. Refresh its current status.',
  missing:
    'Planning or this project is not available to this account. The gateway may need the P1c API.',
  rate: 'Too many requests. Refresh manually when ready; no text call will be repeated automatically.',
  invalid:
    'The request was refused. Complete the current guide and refresh the draft.',
  network:
    'The response could not be confirmed. A submitted task or decision may already be saved. Refresh before starting anything else.',
  state_queued: 'Queued',
  state_running: 'Planning',
  state_ready: 'Ready for your review',
  state_failed: 'Failed',
  state_interrupted: 'Interrupted',
  state_canceled: 'Canceled',
  state_stale: 'Older version',
  state_accepted: 'Used in a draft',
  preview: 'Story and shot proposal',
  previewBoundary:
    'Text only, not rendered footage. Structural validation does not prove creative quality, visual consistency, rights, or compatibility with a video model.',
  goal: 'What the character wants',
  obstacle: 'What gets in the way',
  decision: 'What they decide',
  outcome: 'What changes because of it',
  beats: 'How the story unfolds',
  shots: 'Shot-by-shot draft',
  shot: 'Shot {index}',
  durations: '{edit}s in the edit · {generation}s proposed generation',
  durationsHint:
    'These are planning budgets, not verified video-model settings or a price estimate.',
  camera: 'How the camera sees it',
  prompts: 'See the prompt draft and its sources',
  choice: 'Your saved choice',
  fact: 'Preserved seed fact',
  addition: 'System-added wording',
  provenance:
    'These references use this proposal’s input snapshot, not today’s draft. A binding explains wording; it does not prove that generated footage will obey it.',
  copy: 'Copy this shot’s prompt draft',
  copied: 'Copied',
  copyFailed: 'Copy unavailable. Select the visible text instead.',
  savedPlan: 'Plan saved in this draft version',
  noSavedPlan: 'No adopted plan is saved in this version.',
  unreadable:
    'This plan format cannot be displayed safely by this version of the interface.',
} as const;
export type PlanningMessage = keyof typeof en;
const zh: Record<PlanningMessage, string> = {
  title: '让这些选择，长成一个故事',
  intro: '先读故事、看看每一镜，再决定要不要采用。',
  studioBoundary:
    '保存创作选择；服务器支持时，可另行确认生成文字提案。这里不会生成视频或发布作品。',
  refresh: '刷新提案与草稿',
  loading: '正在读取已保存的提案……',
  disabled: '这个网关尚未启用文字规划。你已有的创意简报仍会保留。',
  unsupported:
    '服务器的规划授权方式与当前界面不兼容，暂不能发起操作；已有提案仍可查看。',
  finish:
    '请先完成上方引导。重新打开草稿后，点击“继续引导”，由服务端确认是否完成；仅查看此面板不会推进引导。',
  terms:
    '文字试点 · 外部模型费用由运营方承担，不扣你的钱包。本次会把已保存的创意简报发送给配置的文字模型，不会生成视频。',
  model:
    '当前模型：{model}。每个工作区滚动 24 小时最多新建 {limit} 个任务，同时受队列与保留数量上限约束。',
  confirm: '同意发送第 {version} 版的创意简报，生成一份文字提案。',
  generate: '生成故事与分镜提案',
  recover: '确认上次提交结果',
  uncertain:
    '上次提交的结果尚未确认。开始另一份前，请用相同请求标识核对；若原请求未到达，会提交原版本，不会悄悄创建另一笔请求。',
  recoveredVersion: '尚未确认的请求对应第 {version} 版，不是之后修改的草稿。',
  queueHint:
    '排队不代表模型已经开始运行，需要独立的规划 worker 在线。离开页面不会取消任务。',
  noTasks: '这里还没有保存的文字提案。',
  proposals: '已保存的提案',
  version: '基于第 {version} 版',
  acceptedVersion: '已写入草稿第 {version} 版',
  stale:
    '这份提案与当前草稿版本不同。可以继续阅读，但不能用它覆盖你后来的决定。',
  accept: '采用这份故事与分镜',
  acceptConfirm:
    '将这份故事及全部镜头作为第 {version} 版的计划，保存为新版本；不会开始拍摄。',
  cancel: '取消任务／丢弃提案',
  cancelConfirm:
    '确定取消这个任务或丢弃这份提案？这不能撤销上游已经进行的计算，也不代表没有产生外部费用。',
  cancelAction: '确认取消',
  keep: '保留',
  readDraft: '重新读取已保存草稿',
  working: '正在保存你的决定……',
  unknownUsage: '模型未报告 token 用量；未知不等于零。',
  usage:
    '已报告文字用量：输入 {input} token · 输出 {output} token。这不是费用报价。',
  taskFailure:
    '本次尝试没有产生可用提案。刷新可核对状态；再次生成必须由你重新明确发起。',
  code: '状态说明：{code}',
  auth: '请重新登录后继续。',
  forbidden: '当前会话不能访问文字规划，请重新验证账号。',
  quota:
    '已达到一项规划额度上限。可继续已有提案，或联系运营方处理；不会自动重试。',
  pending: '这个项目已有排队或运行中的任务，请刷新查看。',
  conflict: '草稿或任务已发生变化。请刷新后再决定，不会自动覆盖。',
  notReady: '任务当前不能执行这个操作，请刷新查看最新状态。',
  missing: '当前账号无法访问该项目或规划接口，网关可能尚未部署 P1c 接口。',
  rate: '请求过于频繁，请稍后手动刷新；不会自动重新调用文字模型。',
  invalid: '请求被拒绝，请完成当前引导并刷新草稿。',
  network:
    '未能确认响应，任务或决定可能已保存。请刷新核对，不要直接开始另一份。',
  state_queued: '等待规划',
  state_running: '正在规划',
  state_ready: '等你审阅',
  state_failed: '未能完成',
  state_interrupted: '已中断',
  state_canceled: '已取消',
  state_stale: '对应旧版本',
  state_accepted: '已采用',
  preview: '故事与分镜提案',
  previewBoundary:
    '这是文字提案，不是实际视频。结构校验不代表剧情质量、画面一致性、权利许可或视频模型兼容性已经验证。',
  goal: '他原本想做什么',
  obstacle: '什么挡住了他',
  decision: '他作了什么决定',
  outcome: '这个决定改变了什么',
  beats: '故事怎样往前走',
  shots: '一镜一镜，看看怎么拍',
  shot: '第 {index} 镜',
  durations: '剪辑使用 {edit} 秒 · 计划生成 {generation} 秒',
  durationsHint:
    '这里的时长是规划预算，不是已验证的视频模型参数，也不是费用估算。',
  camera: '镜头怎样看见它',
  prompts: '看看提示词草稿，以及它从哪里来',
  choice: '你已保存的选择',
  fact: '保留的种子事实',
  addition: '系统补充的表达',
  provenance:
    '对应关系来自这份提案使用的输入版本，而非当前草稿。它解释措辞来源，不保证后续画面一定遵从。',
  copy: '复制本镜头提示词草稿',
  copied: '已复制',
  copyFailed: '无法复制，请直接选取可见文字。',
  savedPlan: '这个草稿版本已保存的计划',
  noSavedPlan: '这个版本尚未保存已采用的计划。',
  unreadable: '当前界面不能安全显示这份计划的格式。',
};
export function planningCopy(locale: 'en' | 'zh') {
  return (key: PlanningMessage, values?: Record<string, string | number>) => {
    let text: string = (locale === 'zh' ? zh : en)[key];
    for (const [name, value] of Object.entries(values ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  };
}
