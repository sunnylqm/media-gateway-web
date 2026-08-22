import type { Locale } from './index';

// Vocabulary that arrives from the gateway rather than from this app: job and
// account statuses, media roles, and the parameter names a model publishes in
// its request form. A term with no entry keeps the value the API sent, so a
// provider can add one without breaking the console.
const zhTerms: Record<string, string> = {
  // Generation status
  queued: '排队中',
  submitting: '提交中',
  submitted: '已提交',
  in_progress: '生成中',
  completed: '已完成',
  failed: '失败',
  canceled: '已取消',
  cancelled: '已取消',
  submission_unknown: '提交状态不明',
  // Account, workspace, key, and model status
  active: '启用',
  inactive: '停用',
  suspended: '已暂停',
  closed: '已关闭',
  pending: '待处理',
  revoked: '已吊销',
  expired: '已过期',
  none: '无',
  // Workspace roles
  owner: '所有者',
  member: '成员',
  billing: '账务',
  // Media roles and slots
  frame: '画面',
  first_frame: '首帧',
  last_frame: '尾帧',
  start_frame: '起始帧',
  end_frame: '结束帧',
  image: '图像',
  images: '图像',
  video: '视频',
  audio: '音频',
  file: '文件',
  reference: '参考素材',
  reference_image: '参考图像',
  subject_reference: '主体参考',
  style_reference: '风格参考',
  mask: '蒙版',
  // Request-form parameters
  prompt: '提示词',
  negative_prompt: '反向提示词',
  duration: '时长',
  resolution: '分辨率',
  ratio: '画面比例',
  aspect_ratio: '画面比例',
  quality: '画质',
  seed: '随机种子',
  fps: '帧率',
  style: '风格',
  size: '尺寸',
  count: '数量',
  n: '数量',
  watermark: '水印',
  prompt_optimizer: '提示词优化',
  callback_url: '回调地址',
  response_format: '返回格式',
  cfg: 'CFG',
  cfg_scale: 'CFG 强度',
  steps: '步数',
  loop: '循环',
  camera: '运镜',
  motion: '运动强度',
};

export function translateTerm(
  locale: Locale,
  value: string,
): string | undefined {
  if (locale !== 'zh') return undefined;
  return zhTerms[value.trim().toLowerCase()];
}
