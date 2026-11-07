/**
 * 将 WorkBuddy 国内版和国际版的视频模型注册为 DSH 工具。
 * 先提交任务取得 task id，再轮询任务状态，最后下载为本地 MP4 文件。
 * 流程参考官方 CLI 的 VideoService，详见 docs/VIDEO_GEN.md。
 * 参数解析和媒体目录缓存与生图工具保持一致。
 * 本地声明 ToolDefinition，以免增加 peer 依赖。DSH 注册时检查 output.render 和 output.schema，
 * parameters 由 schemaOf 原样传递，执行阶段仍需自行校验参数。
 * @module dsh-connect-workbuddy/video-tool
 */

import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { WorkBuddyCredential } from './auth.ts'
import {
  MAX_INPUT_IMAGE_BYTES,
  imageDataUrl,
  imageMimeForPath,
  isBareBase64Image,
  parseImageDataUrl,
  sniffImageMime,
} from './image-gen.ts'
import {
  DEFAULT_VIDEO_ASPECT_RATIO,
  DEFAULT_VIDEO_ENABLE_AUDIO,
  DEFAULT_VIDEO_SECONDS,
  VIDEO_TAG_IMAGE_TO_VIDEO,
  VIDEO_TAG_TEXT_TO_VIDEO,
  WorkBuddyVideoError,
  parseSupportedSecondsRange,
  pickVideoModel,
  resolveVideoParams,
  type WorkBuddyMediaModel,
  type WorkBuddyVideoOutcome,
  type WorkBuddyVideoSubmission,
} from './video-gen.ts'

/** 工具名。DSH 禁止 `run_code`，这个名字与其它 connect 插件的命名习惯一致。 */
export const WORKBUDDY_VIDEO_TOOL_NAME = 'workbuddy_draw_video'

/**
 * 工具单次执行的上限：提交 + 轮询 + 下载。
 *
 * ## 为什么必须比 DSH 的 600 秒**明显小**（issue #187 的第三种现象）
 *
 * 这个值原本正好是 `600_000`，与 DSH 自己给工具调用的上限**完全相等**。两者同时到
 * 期时，DSH 的计时器可能先触发并中止调用，只留下
 * `tool call timed out after 600000ms`。这个错误不包含 taskId 或
 * POLL_TIMEOUT，无法据此区分提交超时和轮询超时。
 *
 * 内部超时短于 DSH 上限，插件就能**先**抛 `POLL_TIMEOUT`，把 task id 带出去。那个
 * id 是这个故障里唯一能拿去问上游的东西，丢掉它等于把可排障的失败变成不可排障的。
 *
 * 570s 而不是更短：正常任务实测几十秒到几分钟，砍太狠会把慢但成功的任务判死。
 */
export const VIDEO_TOOL_TIMEOUT_MS = 570_000
/**
 * 轮询上限比工具执行上限短 30 秒，为下载和返回错误预留时间。
 * 即使轮询用尽预算，也应能返回带 task id 的 POLL_TIMEOUT。
 * 导出该常量用于验证两个超时预算的关系，见 issue #187。
 */
export const VIDEO_POLL_BUDGET_MS = 540_000
/** 媒体模型目录的缓存时长：目录变化很慢，不必每次都重新读一遍。 */
export const VIDEO_MODEL_TTL_MS = 5 * 60_000
/** 下载远程输入图（图生视频时）的上限，不含生视频本身。 */
const VIDEO_INPUT_TIMEOUT_MS = 30_000
/** 失败后的冷却：视频按次扣积分且一次要几十秒，连续重试会烧掉大量积分。 */
const FAILURE_COOLDOWN_MS = 60_000

/** DSH ContentBlock 的最小结构（只需要文本块）。 */
export interface VideoToolContentBlock {
  readonly type: 'text'
  readonly text: string
}

/**
 * DSH `ToolDefinition` 的结构子集。不 import DSH 类型，避免把插件绑死在
 * 某个 DSH 版本的类型上。
 */
export interface VideoToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    render(args: unknown, value: unknown): VideoToolContentBlock[]
  }
  readonly timeoutMs: number
  execute(args: unknown, exec: VideoToolExec): Promise<Record<string, unknown>>
}

/** DSH 传给 execute 的执行上下文里本工具用得到的部分。 */
export interface VideoToolExec {
  readonly signal?: AbortSignal
}

/** 工具运行所需的外部能力，全部由 `src/index.ts` 添加，便于单测替换。 */
export interface VideoToolDeps {
  /** 解析生视频所用区的凭据；该区未登录/未授权则返回 undefined（不要抛异常）。 */
  readonly resolveCredential: () => Promise<WorkBuddyCredential | undefined>
  /** 读该凭据所属区的产品配置，返回该区**全部**媒体模型（调用方按 tag 分组）。 */
  readonly listMediaModels: (
    credential: WorkBuddyCredential,
    signal?: AbortSignal,
  ) => Promise<readonly WorkBuddyMediaModel[]>
  /** 提交一次生视频任务，拿回 task id。 */
  readonly submitVideo: (
    credential: WorkBuddyCredential,
    request: {
      readonly model: string
      readonly prompt: string
      readonly seconds: number
      readonly negativePrompt?: string | undefined
      readonly image?: string | undefined
      readonly lastImage?: string | undefined
      readonly resolution?: string | undefined
      readonly aspectRatio?: string | undefined
      readonly enableAudio?: boolean | undefined
    },
    signal?: AbortSignal,
  ) => Promise<WorkBuddyVideoSubmission>
  /** 轮询任务直到完成/失败，返回视频 URL 列表与扣费。 */
  readonly pollVideoTask: (
    credential: WorkBuddyCredential,
    taskId: string,
    signal?: AbortSignal,
  ) => Promise<WorkBuddyVideoOutcome>
  /**
   * 该区在卡片上钉住的模型 id（按 video tag 分开），没钉就返回 undefined。
   *
   * 只在调用方没显式传 `model` 时生效。它与显式参数的区别是「谁写的」：
   * 显式参数是这次调用者写下的名字，写错就该报错；钉住的是用户上一次在卡片上
   * 点的，可能随目录变化（换套餐、换区）已经不存在，所以它失效时静默回落到
   * 组内第一个，而不是让一次生成因为一个过期偏好彻底失败。
   */
  readonly preferredVideoModel?: (
    credential: WorkBuddyCredential,
    tag: string,
  ) => string | undefined
  /** 下载一条视频 URL 到本地，返回绝对路径。 */
  readonly downloadVideo: (
    credential: WorkBuddyCredential,
    url: string,
    signal?: AbortSignal,
  ) => Promise<string>
  readonly logger: { warn(message: string): void }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function describeArgType(value: unknown): string {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

/**
 * 受支持的参数集合，与 parameters.properties 保持一致。
 */
const ALLOWED_ARGS: ReadonlySet<string> = new Set([
  'prompt',
  'image',
  'model',
  'seconds',
  'resolution',
  'aspect_ratio',
  'negative_prompt',
  'enable_audio',
])

/**
 * 拒绝 schema 未声明的参数。DSH 不代为执行 additionalProperties 校验。
 * 不静默忽略来自其他工具的 size、ratio、n、quality 等参数，避免用户要求未生效仍产生费用。
 * aspect_ratio 是本工具支持的比例参数，应保留。
 */
function rejectUnknownArgs(record: Record<string, unknown>): void {
  const unknown = Object.keys(record).filter(key => !ALLOWED_ARGS.has(key))
  if (unknown.length === 0) return
  throw new WorkBuddyVideoError(
    `workbuddy video: 本工具没有 ${unknown.map(key => `「${key}」`).join('、')} 参数，`
    + '只有 prompt、image、model、seconds、resolution、aspect_ratio、'
    + 'negative_prompt、enable_audio 八个。'
    + '横竖比例用 aspect_ratio（16:9 / 9:16 / 1:1，仅文生视频）；'
    + '尺寸 / 清晰度用 resolution（如 720P / 1080P）；'
    + '不需要 size、ratio、n、return_base64、quality 之类的字段。',
    'INVALID_ARGS',
  )
}

/**
 * 严格读取可选参数：undefined、null 和空字符串视为未提供，使用默认值；
 * 其他类型不符的值返回 INVALID_ARGS，避免擅自改变时长或模型。
 * 校验发生在生成请求前，失败时不进入冷却。
 */
function strictString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new WorkBuddyVideoError(
      `workbuddy video: 参数 ${name} 必须是字符串（或不填），实际是${describeArgType(value)}。`,
      'INVALID_ARGS',
    )
  }
  return value.trim() === '' ? undefined : value.trim()
}

function strictNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WorkBuddyVideoError(
      `workbuddy video: 参数 ${name} 必须是有限数字（或不填），实际是${describeArgType(value)}。`,
      'INVALID_ARGS',
    )
  }
  return value
}

function strictBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') {
    throw new WorkBuddyVideoError(
      `workbuddy video: 参数 ${name} 必须是布尔值（或不填），实际是${describeArgType(value)}。`,
      'INVALID_ARGS',
    )
  }
  return value
}

/**
 * 输入图接受字符串或单元素字符串数组；undefined、null 和空字符串表示文生视频。
 * 图生视频的上游接口只接受单张 image_url，因此多图数组及其他无效类型返回 INVALID_ARGS。
 * 不静默取第一张，也不丢弃输入图后切换成文生视频。
 */
function asVideoImageInput(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') {
    return value.trim() === '' ? undefined : value.trim()
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined
    if (value.length > 1) {
      throw new WorkBuddyVideoError(
        `workbuddy video: 图生视频只支持一张输入图，收到 ${value.length} 张。`
        + '需要多图参考时，先用生图工具把参考合成一张成品图，再把那张图传到这里。',
        'INVALID_ARGS',
      )
    }
    const item = value[0]
    if (typeof item !== 'string' || item.trim() === '') {
      throw new WorkBuddyVideoError(
        'workbuddy video: image 数组的唯一元素必须是非空字符串'
        + '（本地路径 / file:// / http(s) / data URL / base64 编码）。',
        'INVALID_ARGS',
      )
    }
    return item.trim()
  }
  throw new WorkBuddyVideoError(
    'workbuddy video: image 必须是字符串或单元素字符串数组'
    + '（本地路径 / file:// / http(s) / data URL / base64 编码）。',
    'INVALID_ARGS',
  )
}

/**
 * 这些失败说明请求真的打到了上游、可能已经扣了积分，才值得进冷却。
 * 本地参数校验、未登录或目录缺少模型时，尚未提交生成请求。提交后是否扣费仍需结合响应与账号记录判断。
 *
 * 注意 `REJECTED` **不在**这里：提交阶段被上游 4xx 退回时任务根本没创建、
 * 本地不把这种拒绝纳入冷却；是否产生费用不能仅凭 HTTP 状态证明。
 */
const BILLABLE_FAILURE_CODES: ReadonlySet<string> = new Set([
  'AUTH',
  'RATE_LIMIT',
  'NO_ROUTE',
  'UPSTREAM',
  'EMPTY_RESULT',
  'TASK_FAILED',
  'POLL_TIMEOUT',
])

/**
 * 结合 sent 标志和错误码判断是否进入冷却。
 * 目录读取、模型选择与参数校验失败时，尚未提交生成请求，不进入冷却。
 * 提交后的轮询或下载失败可能已产生费用；请求发出本身不能证明已经扣费。
 */
function isBillableFailure(error: unknown, sent: boolean): boolean {
  if (!sent) return false
  if (error instanceof WorkBuddyVideoError) return BILLABLE_FAILURE_CODES.has(error.code)
  // 请求已发出之后的意外异常（读轮询响应时连接断了等）同样算一次真实尝试。
  return true
}

/**
 * 将输入图统一转换为 data URL。
 * HTTP(S) 图片先通过 GET 下载：COS 签名可能只覆盖 GET，额外的 HEAD 请求会返回 403，见 issue #187。
 * 上游不接受图片外链，直接转发 URL 会使输入问题延迟到任务提交后才暴露，可能产生费用。
 * 下载后只改变承载形式，不缩放图片或转换格式。
 */
async function resolveVideoImageInput(value: string, signal?: AbortSignal): Promise<string> {
  const text = value.trim()

  // 1. data URL：校验格式与体积后直传
  if (text.startsWith('data:')) {
    const parsed = parseImageDataUrl(text)
    if (parsed === undefined) {
      throw new WorkBuddyVideoError(
        'workbuddy video: image 格式无效，请使用 data:image/*;base64,...。',
        'INVALID_ARGS',
      )
    }
    const bytes = Buffer.from(parsed.base64, 'base64')
    assertVideoInputImageBytes(bytes.byteLength, '（内联 data URL）')
    return text
  }

  // 2. http(s) URL：真的下载下来，编码成 data URL 再发（见上面的函数注释）
  if (/^https?:\/\//i.test(text)) {
    let response: Response
    try {
      response = await fetch(text, {
        // 使用 GET 下载图片，不额外发送 HEAD；COS 签名可能只覆盖 GET，见 issue #187。
        signal: signal ?? AbortSignal.timeout(VIDEO_INPUT_TIMEOUT_MS),
      })
    } catch (error: unknown) {
      throw new WorkBuddyVideoError(
        `workbuddy video: 下载输入图失败（${text}）：`
        + (error instanceof Error ? error.message : String(error)),
        'INVALID_ARGS',
      )
    }
    if (!response.ok) {
      throw new WorkBuddyVideoError(
        `workbuddy video: 下载输入图失败（HTTP ${response.status}）：${text}`,
        'INVALID_ARGS',
      )
    }
    // 内容类型来自响应头；`encodeVideoInputImage` 在缺失时会去嗅探魔数。
    return encodeVideoInputImage(
      new Uint8Array(await response.arrayBuffer()),
      response.headers.get('content-type') ?? text,
    )
  }

  // 3. 裸 base64：编码成 data URL
  if (isBareBase64Image(text)) {
    const bytes = Buffer.from(text, 'base64')
    return encodeVideoInputImage(bytes, '（内联 base64）')
  }

  // 4. 本地路径 / file:// URL：读文件，编码成 data URL
  const path = text.startsWith('file:') ? fileURLToPath(text) : text
  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch (error: unknown) {
    throw new WorkBuddyVideoError(
      `workbuddy video: 读取输入图失败「${path}」：`
      + (error instanceof Error ? error.message : String(error)),
      'INVALID_ARGS',
    )
  }
  return encodeVideoInputImage(bytes, path)
}

/**
 * 统一检查输入图的空内容和 8 MB 限制，与 image-tool.ts 保持一致。
 * byteLength 必须使用 Base64 解码后的字节数。
 */
function assertVideoInputImageBytes(byteLength: number, source: string): void {
  if (byteLength === 0) {
    throw new WorkBuddyVideoError(`workbuddy video: 输入图是空文件：${source}`, 'INVALID_ARGS')
  }
  if (byteLength > MAX_INPUT_IMAGE_BYTES) {
    const limit = MAX_INPUT_IMAGE_BYTES / 1024 / 1024
    const actual = (byteLength / 1024 / 1024).toFixed(1)
    throw new WorkBuddyVideoError(
      `workbuddy video: 输入图 ${actual} MB，超过 ${limit} MB 上限：${source}`,
      'INVALID_ARGS',
    )
  }
}

/** 校验体积、定出 MIME，再把字节编成 data URL。 */
function encodeVideoInputImage(bytes: Uint8Array, source: string): string {
  assertVideoInputImageBytes(bytes.byteLength, source)
  const mime = imageMimeForPath(source) ?? sniffImageMime(bytes)
  return imageDataUrl(mime, Buffer.from(bytes).toString('base64'))
}

/**
 * 造出工具定义。每次 `apply()` 只造一个实例，冷却状态与目录缓存都挂在闭包里，
 * 生命周期跟着插件走。
 */
export function createVideoTool(deps: VideoToolDeps): VideoToolDefinition {
  let mediaCache: { readonly at: number; readonly models: readonly WorkBuddyMediaModel[] } | undefined
  let cooldownUntil = 0
  /**
   * 缓存上游最近一次拒绝响应中给出的模型时长范围。
   * 部分账号的模型目录不含 videoGeneration，此时首次提交仍由上游校验。
   * 获得范围后，同进程内再次提交相同越界值时由 resolveVideoParams 提前拒绝，不进入冷却。
   * 缓存键包含区域和模型 id，避免同名模型跨区共用限制。
   */
  const learnedSeconds = new Map<string, { readonly minSeconds: number; readonly maxSeconds: number }>()
  const secondsKey = (domain: string, modelId: string): string => `${domain}|${modelId}`

  const listModels = async (
    credential: WorkBuddyCredential,
    signal?: AbortSignal,
  ): Promise<readonly WorkBuddyMediaModel[]> => {
    const now = Date.now()
    if (mediaCache !== undefined && now - mediaCache.at < VIDEO_MODEL_TTL_MS) return mediaCache.models
    const models = await deps.listMediaModels(credential, signal)
    mediaCache = { at: now, models }
    return models
  }

  return {
    name: WORKBUDDY_VIDEO_TOOL_NAME,
    description:
      '用当前账号的 WorkBuddy 视频生成能力生成一段短视频。'
      + '不填 image 是文生视频（用该区带 text-to-video 标签的模型）；'
      + '填了 image 是图生视频（用带 image-to-video 标签的模型，只收一张输入图）。'
      + '本工具只有 prompt、image、model、seconds、resolution、aspect_ratio、'
      + 'negative_prompt、enable_audio 八个参数：没有 size / ratio / n / return_base64 / '
      + 'quality / style 之类的字段，塞进来会直接报错。'
      + '时长使用 seconds，比例使用 aspect_ratio（16:9 / 9:16 / 1:1），清晰度使用 resolution。'
      + '用户指定时长、比例或清晰度时，填写对应参数。'
      + '可选参数要么不填、要么类型正确；填错类型直接 INVALID_ARGS 且不发请求，'
      + '不会静默丢参数或切换模式。'
      + '国内区与国际区都可用，模型取自该区产品配置里带 video tag 的条目。'
      + 'model 默认留空：留空才走「用户在卡片上钉住的模型 → 该区目录第一个」这条链，'
      + '不要凭印象猜模型 id，名称不对会直接报错并列出可用 id。'
      + '视频是异步任务：先提交、再轮询到完成、最后把视频下载到本地，单次可能要几十秒到几分钟。'
      + '每次生成会真实消耗 WorkBuddy 积分，单价随区域与模型不同，以返回结果里的 credit 为准；'
      + '不要在没必要时调用，也不要为了试错连续调用。'
      + '返回的是本地 .mp4 文件路径（file:// URL），由宿主/客户端打开或下载。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '画面描述（中文或英文都可以），≤2500 字符。写清楚主体、动作、风格、镜头。',
        },
        image: {
          type: ['string', 'array'],
          items: { type: 'string' },
          description:
            '提供一张输入图，插件使用 image-to-video 模型生成视频。省略此参数时，插件使用 text-to-video 模型。'
            + '可提供图片的绝对路径、file:// URL、http(s) URL、data URL 或 base64 编码。'
            + '上限 8 MB，不做缩放或格式转换。'
            + '单元素字符串数组与字符串等价；图生视频只支持一张输入图，'
            + '提供多张图片时返回参数错误。'
            + '需要多图参考（如按模板换装）时，先用生图工具 workbuddy_draw_image 把参考'
            + '合成一张成品图，再把这张图传进来。',
        },
        model: {
          type: 'string',
          description:
            '模型标识，可选。省略时使用设置中对应模式的默认模型；'
            + '未设置时使用当前区域对应模式的第一个模型'
            + '（文生视频看 text-to-video，图生视频看 image-to-video）。'
            + '指定模型需属于当前模式对应的模型列表。',
        },
        seconds: {
          type: 'number',
          description:
            '视频时长（秒），可选。不填用模型默认（通常 5s）。'
            + '时长须符合模型目录声明的 videoGeneration.minSeconds..maxSeconds 范围，超出时返回参数错误。'
            + '目录未声明范围时，由服务端校验；被拒绝时请按返回的范围调整后重试。',
        },
        resolution: {
          type: 'string',
          description:
            '分辨率，可选，如 720P / 1080P（大小写不敏感，按模型目录里的拼写发）。不填用模型默认。'
            + '模型目录包含 videoGeneration.resolutions 时，超出列表的选项会改用默认分辨率，并返回提示；'
            + '目录未声明分辨率时，将所选值直接提交至服务端校验。',
        },
        aspect_ratio: {
          type: 'string',
          description:
            '画面比例，仅文生视频有效，可选：16:9 / 9:16 / 1:1。'
            + '不填默认 16:9。图生视频由输入图决定比例，传了会被忽略。',
        },
        negative_prompt: {
          type: 'string',
          description: '不希望出现的元素，可选，≤2500 字符。',
        },
        enable_audio: {
          type: 'boolean',
          description: '是否生成带声音的视频，可选，默认 true。',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          videos: {
            type: 'array',
            items: { type: 'string' },
            description: '生成的视频本地路径列表（file:// URL，.mp4）。',
          },
          mode: { type: 'string', description: "'text-to-video' 或 'image-to-video'。" },
          model: { type: 'string', description: '实际使用的模型 id。' },
          prompt: { type: 'string', description: '实际提交的画面描述。' },
          seconds: { type: 'number', description: '实际使用的时长（秒）。' },
          resolution: { type: 'string', description: '实际使用的分辨率。' },
          hint: { type: 'string', description: '给模型的后续提示（如何打开、扣费）。' },
          credit: { type: 'number', description: '本次实际消耗的 WorkBuddy 积分。' },
        },
        required: ['videos', 'mode', 'model', 'prompt', 'seconds', 'resolution', 'hint'],
        additionalProperties: false,
      },
      render(_args: unknown, value: unknown): VideoToolContentBlock[] {
        const record = asRecord(value)
        const videos = Array.isArray(record['videos'])
          ? (record['videos'] as unknown[]).filter((v): v is string => typeof v === 'string')
          : []
        const model = asNonEmptyString(record['model']) ?? 'unknown'
        const modeLabel = record['mode'] === 'image-to-video' ? '图生视频' : '文生视频'
        const seconds = typeof record['seconds'] === 'number' ? (record['seconds'] as number) : undefined
        const resolution = asNonEmptyString(record['resolution'])
        const credit = typeof record['credit'] === 'number' ? record['credit'] as number : undefined
        const hint = asNonEmptyString(record['hint']) ?? ''
        const lines = [
          `${modeLabel} · 模型：${model}`
          + (seconds === undefined ? '' : ` · ${seconds}s`)
          + (resolution === undefined ? '' : ` · ${resolution}`)
          + (credit === undefined ? '' : ` · 消耗 ${credit} 积分`),
          '',
        ]
        if (videos.length === 0) {
          lines.push('（没有返回任何视频文件）')
        } else {
          videos.forEach((v, i) => {
            lines.push(`视频 ${i + 1}: [${v}](${v})`)
          })
        }
        if (hint !== '') lines.push('', hint)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    timeoutMs: VIDEO_TOOL_TIMEOUT_MS,
    async execute(args: unknown, exec: VideoToolExec): Promise<Record<string, unknown>> {
      const record = asRecord(args)
      // 先挡串参：宿主把 parameters 原样投影、不代校验，生图工具那套
      // size / ratio / n / return_base64 会原样落到这里，不挡就被静默忽略。
      rejectUnknownArgs(record)
      const prompt = asNonEmptyString(record['prompt'])
      if (prompt === undefined) {
        throw new WorkBuddyVideoError(
          `${WORKBUDDY_VIDEO_TOOL_NAME}: 参数 prompt 必填，且必须是非空字符串。`,
          'INVALID_ARGS',
        )
      }
      const requestedModel = strictString(record['model'], 'model')
      const requestedSeconds = strictNumber(record['seconds'], 'seconds')
      const requestedResolution = strictString(record['resolution'], 'resolution')
      const requestedAspectRatio = strictString(record['aspect_ratio'], 'aspect_ratio')
      const requestedNegativePrompt = strictString(record['negative_prompt'], 'negative_prompt')
      const requestedEnableAudio = strictBoolean(record['enable_audio'], 'enable_audio')
      // 根据是否提供输入图确定生成模式。无效 image 类型须报错，不能视为未提供。
      const image = asVideoImageInput(record['image'])

      const now = Date.now()
      if (now < cooldownUntil) {
        const seconds = Math.ceil((cooldownUntil - now) / 1000)
        throw new WorkBuddyVideoError(
          `workbuddy video: 视频生成失败后需等待，请 ${seconds} 秒后再试`
          + '，以减少重复计费。',
          'COOLDOWN',
        )
      }

      const credential = await deps.resolveCredential()
      if (credential === undefined) {
        throw new WorkBuddyVideoError(
          'workbuddy video: 当前没有已授权的视频生成账号。'
          + '请登录需要使用的区域，'
          + '并在设置中开启「允许模型调用视频生成工具」。',
          'NOT_LOGGED_IN',
        )
      }

      const signal = exec.signal === undefined
        ? AbortSignal.timeout(VIDEO_TOOL_TIMEOUT_MS)
        : AbortSignal.any([exec.signal, AbortSignal.timeout(VIDEO_TOOL_TIMEOUT_MS)])

      // 记录是否已调用提交接口；冷却还需结合错误码判断。
      let sent = false
      // 选中的模型要活到 catch 里：上游拒绝时得知道是哪条模型的区间，好记下来。
      let chosen: WorkBuddyMediaModel | undefined
      try {
        const models = await listModels(credential, signal)
        // 先读取输入图并规整成 data URL：发生在「发请求」之前，失败不花积分。
        const imageInput = image === undefined ? undefined : await resolveVideoImageInput(image, signal)
        const tag = imageInput === undefined ? VIDEO_TAG_TEXT_TO_VIDEO : VIDEO_TAG_IMAGE_TO_VIDEO
        // 谁写的名字决定写错了谁负责：显式 `model` 是这次调用者写的，不在组里
        // 就报错；钉住的偏好是用户上次在卡片上点的，目录变了就可能失效，那种
        // 情况按「没填」处理、回落组内第一个，不拿一个过期偏好卡住整次生成。
        const pinned = requestedModel === undefined ? deps.preferredVideoModel?.(credential, tag) : undefined
        let model: WorkBuddyMediaModel
        try {
          model = pickVideoModel(models, requestedModel ?? pinned, tag)
        } catch (error: unknown) {
          if (requestedModel !== undefined || pinned === undefined) throw error
          model = pickVideoModel(models, undefined, tag)
        }
        chosen = model

        // 优先使用最近一次上游拒绝响应中的时长范围；没有该记录时使用目录配置。
        const learned = learnedSeconds.get(secondsKey(credential.domain, model.id))
        const modelConfig = learned === undefined
          ? model.videoGeneration
          : { ...model.videoGeneration, ...learned }

        const resolved = resolveVideoParams({
          model: model.id,
          prompt,
          seconds: requestedSeconds,
          negativePrompt: requestedNegativePrompt,
          image: imageInput,
          resolution: requestedResolution,
          aspectRatio: requestedAspectRatio,
          enableAudio: requestedEnableAudio,
        }, modelConfig)

        const request = {
          model: model.id,
          prompt,
          seconds: resolved.seconds,
          negativePrompt: requestedNegativePrompt,
          image: imageInput,
          resolution: resolved.resolution,
          aspectRatio: resolved.aspectRatio,
          enableAudio: requestedEnableAudio,
        }
        // 提交前设置 sent，后续按错误码判断冷却。sent 不代表已证实扣费。
        sent = true
        const submission = await deps.submitVideo(credential, request, signal)
        const outcome = await deps.pollVideoTask(credential, submission.taskId, signal)
        const paths: string[] = []
        for (const url of outcome.videos) {
          const local = await deps.downloadVideo(credential, url, signal)
          paths.push(pathToFileURL(local).href)
        }
        const mode = imageInput === undefined ? 'text-to-video' : 'image-to-video'
        const value: Record<string, unknown> = {
          videos: paths,
          mode,
          model: model.id,
          prompt,
          seconds: resolved.seconds,
          resolution: resolved.resolution ?? '',
          hint:
            `这段视频来自 WorkBuddy（模型 ${model.id}，${mode === 'image-to-video' ? '图生视频' : '文生视频'}）。`
            + '按次扣积分，单价随区域与模型不同'
            + (outcome.credit === undefined
              ? '（本次响应没带扣费字段，以额度面板为准）。'
              : `；本次实际扣费 ${outcome.credit} 积分。`)
            + (resolved.warnings.length > 0 ? ` 提示：${resolved.warnings.join('；')}。` : '')
            + '视频已下载到本地，请用 file:// 链接打开或下载保存。',
        }
        if (outcome.credit !== undefined) value['credit'] = outcome.credit
        return value
      } catch (error: unknown) {
        // 上游把参数退回来时**什么都没创建**：把返回的支持区间记进本次进程，
        // 下一次同样的越界值在本地就被拦下，不再多打一次注定失败的请求。
        if (error instanceof WorkBuddyVideoError && error.code === 'REJECTED' && chosen !== undefined) {
          const range = parseSupportedSecondsRange(error.message)
          if (range !== undefined) learnedSeconds.set(secondsKey(credential.domain, chosen.id), range)
        }
        if (isBillableFailure(error, sent)) cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS
        throw error
      }
    },
  }
}

/** DSH tools 服务里本工具用到的那一个方法。 */
export interface ToolsServiceLike {
  register(definition: unknown): () => void
}

/**
 * 把工具注册进 DSH。返回 disposer；调用方负责在插件卸载时调用它。
 * 注册本身是同步的；`tools` 服务由 DSH 提供，拿不到就直接返回 undefined 并记警告。
 */
export function registerWorkBuddyVideoTool(
  tools: ToolsServiceLike,
  deps: VideoToolDeps,
): (() => void) | undefined {
  try {
    return tools.register(createVideoTool(deps))
  } catch (error: unknown) {
    deps.logger.warn(
      `dsh-connect-workbuddy: 注册 ${WORKBUDDY_VIDEO_TOOL_NAME} 失败: `
      + (error instanceof Error ? error.message : String(error)),
    )
    return undefined
  }
}
