/**
 * `workbuddy_draw_image`：把 WorkBuddy 的文生图能力（国内区与国际区各自的
 * `text-to-image` 模型）暴露成一个 DSH agent 工具。
 *
 * 为什么手写 ToolDefinition 而不 import `@deepseek-ai/dsh-tools` 的 `defineTool`：
 * DSH `Tools.register` 校验 `output.render` 是函数、`output.schema` 是
 * 受支持的 JSON Schema；`schemaOf()` 把 `parameters` 原样传给模型。也就是说
 * raw JSON Schema 完全够用，而 `defineTool` 额外提供的只有「按 spec 编译 schema +
 * 代校验参数」这一层包装。手写换来的是：零新 peer 依赖、无需处理动态 import 失败后的兼容分支、
 * 符合 tests/host-peers.spec.ts 对 `lib/bin.js` 运行时依赖的要求：
 * 包名导入仅允许 Node.js 内置模块的 `node:` 标识。
 *
 * 参数由工具自行校验，见 {@link createImageTool} 的 execute。
 *
 * @module dsh-connect-workbuddy/image-tool
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { WorkBuddyCredential } from './auth.ts'
import { pruneTempDir, TEMP_MEDIA_KEEP } from './temp-files.ts'
import { regionOf } from './upstream.ts'
import {
  IMAGE_TAG_IMAGE_TO_IMAGE,
  IMAGE_TAG_TEXT_TO_IMAGE,
  MAX_INPUT_IMAGE_BYTES,
  WorkBuddyImageError,
  imageDataUrl,
  imageMimeForPath,
  isBareBase64Image,
  parseImageDataUrl,
  pickMediaModel,
  sniffImageMime,
  type WorkBuddyImageOutcome,
  type WorkBuddyMediaModel,
} from './image-gen.ts'

/** 工具名。DSH 禁止 `run_code`，这个名字与其它 connect 插件的命名习惯一致。 */
export const WORKBUDDY_IMAGE_TOOL_NAME = 'workbuddy_draw_image'

/** 工具单次执行的上限。实测一张图 17–39 秒，留足余量。 */
const IMAGE_TOOL_TIMEOUT_MS = 180_000
/** 媒体模型目录的缓存时长：目录变化很慢，不必每张图都重新读一遍。 */
export const MEDIA_MODEL_TTL_MS = 5 * 60_000
/** 下载远程输入图的上限（只覆盖 http(s) 那一次 GET，不含生图本身）。 */
const IMAGE_INPUT_TIMEOUT_MS = 30_000
/** 失败后的冷却：生图按张扣积分，连续重试会在几秒内烧掉几十积分。 */
const FAILURE_COOLDOWN_MS = 30_000

/** DSH ContentBlock 的最小结构（只需要文本块）。 */
export interface ImageToolContentBlock {
  readonly type: 'text'
  readonly text: string
}

/**
 * DSH `ToolDefinition` 的结构子集。
 *
 * 刻意不 import DSH 的类型：`@deepseek-ai/dsh-tools` 在运行期由 DSH 提供，
 * 这里只描述「DSH 会读哪些字段」，避免把插件绑死在某个 DSH 版本的类型上。
 */
export interface ImageToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    render(args: unknown, value: unknown): ImageToolContentBlock[]
  }
  readonly timeoutMs: number
  execute(args: unknown, exec: ImageToolExec): Promise<Record<string, unknown>>
}

/** DSH 传给 execute 的执行上下文里本工具用得到的部分。 */
export interface ImageToolExec {
  readonly signal?: AbortSignal
}

/** 工具运行所需的外部能力，全部由 `src/index.ts` 添加，便于单测替换。 */
export interface ImageToolDeps {
  /** 解析生图所用区的凭据；该区未登录/未授权则返回 undefined（不要抛异常）。 */
  readonly resolveCredential: () => Promise<WorkBuddyCredential | undefined>
  /** 读该凭据所属区的产品配置，返回该区**全部**媒体模型（调用方按 tag 分组）。 */
  readonly listMediaModels: (
    credential: WorkBuddyCredential,
    signal?: AbortSignal,
  ) => Promise<readonly WorkBuddyMediaModel[]>
  /** 真正发一次文生图请求。 */
  readonly generateImage: (
    credential: WorkBuddyCredential,
    request: { readonly model: string; readonly prompt: string; readonly size: string },
    signal?: AbortSignal,
  ) => Promise<WorkBuddyImageOutcome>
  /** 真正发一次改图请求（输入图已是 data URL）。 */
  readonly editImage: (
    credential: WorkBuddyCredential,
    request: {
      readonly model: string
      readonly prompt: string
      readonly size: string
      readonly image: readonly string[]
    },
    signal?: AbortSignal,
  ) => Promise<WorkBuddyImageOutcome>
  readonly logger: { warn(message: string): void }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * 将 image 参数解析为输入图列表。未提供时返回 undefined；提供时只接受非空字符串数组。
 * 单张图片也须放入数组，因为部分 function-calling 适配器不能正确投影联合类型。
 * 字符串、空数组、非字符串元素等无效输入均返回 INVALID_ARGS，避免丢弃参考图后误执行文生图。
 */
function asImageList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw inputImageError(
        'workbuddy image: image 收到了空数组。纯文生图请把 image 字段整个省略，'
        + '不要传 []；要改图就给至少一张，如 ["/abs/a.png"]。',
      )
    }
    const items: string[] = []
    for (const item of value) {
      if (typeof item !== 'string' || item.trim() === '') {
        throw inputImageError(
          'workbuddy image: image 数组的每个元素都必须是非空字符串'
          + '（本地路径 / file:// / http(s) / data URL / base64 编码）。',
        )
      }
      items.push(item.trim())
    }
    return items
  }
  if (typeof value === 'string') {
    throw inputImageError(
      `workbuddy image: image 必须是字符串数组，一张图也要写成数组。`
      + `收到的是字符串 ${JSON.stringify(value.slice(0, 40))}，`
      + `请改写成 ["${value.slice(0, 40)}"]。`,
    )
  }
  throw inputImageError(
    'workbuddy image: image 必须是字符串数组'
    + '（如 ["/abs/a.png"] 或 ["/abs/a.png", "/abs/b.png"]），'
    + '元素是本地路径 / file:// / http(s) / data URL / 裸 base64。',
  )
}

/**
 * 严格读取可选字符串。undefined、null 和空字符串视为未提供，其他非字符串值返回 INVALID_ARGS。
 * 不将错误类型替换成默认模型或默认尺寸，以免执行与调用方要求不同的计费请求。
 * size 的格式由 parseSizeSpec 继续校验；schema 中的 pattern 不能替代执行时校验。
 */
function strictString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw inputImageError(
      `workbuddy image: 参数 ${name} 必须是字符串（或不填），实际是`
      + `${Array.isArray(value) ? '数组' : typeof value}。`,
    )
  }
  return value.trim() === '' ? undefined : value.trim()
}

/**
 * 尺寸允许 x、X 或全角 × 作为宽高分隔符，不接受星号、空格或单位。
 */
const SIZE_PATTERN = /^[0-9]+[xX×][0-9]+$/
/** 上游实测上限：总像素约 419 万（见 docs/IMAGE_GEN.md「尺寸与比例」）。 */
const MAX_IMAGE_PIXELS = 4_194_304
/** 边长支持范围。上限 2560 来自实测通过的最大长边（2560x1440 / 2560x1600）。 */
const MIN_IMAGE_EDGE = 512
const MAX_IMAGE_EDGE = 2560
/** 实测被上游拒绝的尺寸，报错时直接点出来，省得模型反复试。 */
const KNOWN_BAD_SIZES: ReadonlySet<string> = new Set(['2560x2560', '3072x3072', '4096x4096'])

/**
 * 受支持的参数集合，与 parameters.properties 保持一致。
 */
const ALLOWED_ARGS: ReadonlySet<string> = new Set(['prompt', 'size', 'image', 'model'])

/**
 * 拒掉 schema 里没有的参数。
 *
 * `additionalProperties: false` 只是写在 schema 里给模型看的，宿主把
 * `parameters` 原样投影、不代校验，execute 照样会收到 `ratio: '16:9'` 这种
 * 从别的生图工具（agnes 那边就叫 ratio / n / return_base64）串过来的字段。
 * 静默忽略的后果是模型以为改的比例生效了、其实出的是默认方图，所以这里明说。
 */
function rejectUnknownArgs(record: Record<string, unknown>): void {
  const unknown = Object.keys(record).filter(key => !ALLOWED_ARGS.has(key))
  if (unknown.length === 0) return
  throw inputImageError(
    `workbuddy image: 本工具没有 ${unknown.map(key => `「${key}」`).join('、')} 参数，`
    + '只有 prompt、size、image、model 四个。'
    + '比例 / 横竖用 size 的「宽x高」（size 必填）；要几张图就调用几次（一次一张）。',
  )
}

/**
 * 解析必填的 size 参数，仅接受宽x高或 auto。
 * 未提供时直接报错，避免默认方图覆盖调用方需要的画布比例。
 * 此处只校验格式，尺寸范围和等比缩放交由 planImageSize 处理。
 * DSH 将 parameters 原样传递，因此执行时仍需拒绝 2K、1024*1024 等无效写法。
 */
function parseSizeSpec(value: unknown): SizeSpec {
  const raw = strictString(value, 'size')
  if (raw === undefined) {
    throw inputImageError(
      'workbuddy image: 参数 size 必填，写成「宽x高」的像素数，改图也可以写 auto。'
      + '方图 1024x1024、竖图 1024x1536、横图 1536x1024、16:9 桌面 2560x1440、'
      + '9:16 手机壁纸 1440x2560。比例由它决定，不填不会替你猜。',
    )
  }
  const normalized = raw.toLowerCase()
  if (normalized === 'auto') return { kind: 'auto' }
  if (!SIZE_PATTERN.test(normalized)) {
    throw inputImageError(
      `workbuddy image: 参数 size 必须写成「宽x高」的像素数或 auto，收到的是 ${JSON.stringify(raw)}。`
      + '例如 1024x1024（方图）、1024x1536（竖图）、1536x1024（横图）、2560x1440（16:9）。'
      + '不要写「2K」「4K」「高清」这类档位，也不要只写一个边长。',
    )
  }
  // 走到这里 pattern 已经命中，两段一定存在；给默认值是为了让类型系统也同意
  // （tsconfig 开了 noUncheckedIndexedAccess），空串经 Number 变成 0 会被下面的闸门拦下。
  const [widthPart = '', heightPart = ''] = normalized.split(/[xX×]/)
  const width = Number(widthPart)
  const height = Number(heightPart)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw inputImageError(
      `workbuddy image: 参数 size 的宽高必须是正整数，收到的是 ${JSON.stringify(raw)}。`,
    )
  }
  return { kind: 'fixed', width, height, normalized }
}

/**
 * 把解析好的尺寸规格落成一个真正要发给上游的值。
 *
 * 与 {@link parseSizeSpec} 分开，是因为这两件事的**时机**不同：格式错误要在收到
 * 参数的第一时间就报（本地免费），而 `auto` 与越界缩放都要等输入图量过宽高。
 *
 * 越界为什么由工具收、而不是让模型自己算：两条边（512–2560）与总像素
 * （≤4,194,304）是两个约束，手算要取「2560/长边」与「√(4194304/面积)」里更小的
 * 那个**再复查一遍**。要求模型在参数里做这种算术，实测会算出仍然越界的值
 * （2480x3508 → 1810x2560，边长合规但乘积 4,633,600 仍超）。收完之后把「动过什么」
 * 写进 hint，模型得据实转告用户，不能假装按用户给的尺寸出图。
 */
function planImageSize(spec: SizeSpec, input: ImageDimensions | undefined): SizePlan {
  if (spec.kind === 'auto') {
    if (input === undefined) {
      throw inputImageError(
        'workbuddy image: size 写了 auto，但这一次量不出输入图的宽高'
        + '（没有给 image，或给的图格式认不出来），没法替你挑画布。'
        + '请直接写具体尺寸：方图 1024x1024、竖图 1024x1536、横图 1536x1024。',
      )
    }
    const canvas = canvasForInput(input)
    const size = `${canvas.width}x${canvas.height}`
    return {
      size,
      requested: 'auto',
      note: canvas.exact
        ? `size 写的是 auto，已按输入图 ${input.width}x${input.height} 的比例取画布 `
          + `${size}（${ORIENTATION_LABEL[orientationOf(input)]}）`
        : `输入图 ${input.width}x${input.height} 太细长，等比缩不出合法的画布，`
          + `已改用${ORIENTATION_LABEL[orientationOf(input)]}常用档 ${size}，比例有变化`,
    }
  }
  const { width, height, normalized } = spec
  if (isSizeInRange(width, height, normalized)) return { size: `${width}x${height}` }

  const fitted = fitIntoRange(width, height)
  if (fitted === undefined) {
    throw inputImageError(
      `workbuddy image: 参数 size ${normalized} 的比例太极端，等比缩放放不进 `
      + `${MIN_IMAGE_EDGE}–${MAX_IMAGE_EDGE} 且总像素不超过 419 万的范围内。`
      + '请改成接近的常用档位：方图 1024x1024、竖图 1024x1536、横图 1536x1024、'
      + '16:9 桌面 2560x1440、9:16 手机壁纸 1440x2560。',
    )
  }
  const direction = fitted.direction === 'up' ? '放大' : '缩小'
  return {
    size: `${fitted.width}x${fitted.height}`,
    requested: normalized,
    note: `你给的尺寸 ${normalized} 超出 ${MIN_IMAGE_EDGE}–${MAX_IMAGE_EDGE} 边长或 419 万像素上限，`
      + `已等比${direction}到 ${fitted.width}x${fitted.height}`,
  }
}

/**
 * 这些失败说明请求真的打到了上游、可能已经扣了积分，才值得进冷却。
 * 参数写错 / 未登录 / 目录里没有模型都还没花钱。
 */
/**
 * 这些错误发生在生成请求发出之后，上游可能已计费或排队。
 * 将这些失败纳入冷却，避免立即重复提交。请求发出本身不能证明已经扣费。
 */
const BILLABLE_FAILURE_CODES: ReadonlySet<string> = new Set([
  'AUTH',
  'RATE_LIMIT',
  'NO_ROUTE',
  'UPSTREAM',
  'EMPTY_RESULT',
])

/**
 * 根据调用点记录的 sent 标志判断是否进入冷却。读取目录或本地参数校验失败
 * 不算生成尝试；生成请求发出后的失败按错误分类处理，避免立即重复请求。
 * sent 表示请求已发送，不能证明服务端实际扣费。
 */
function isBillableFailure(error: unknown, sent: boolean): boolean {
  if (!sent) return false
  if (error instanceof WorkBuddyImageError) return BILLABLE_FAILURE_CODES.has(error.code)
  // 请求已发出之后的意外异常（读响应体时连接断了等）同样算一次真实尝试。
  return true
}

/**
 * 生成图片的临时目录，清理由 {@link pruneTempDir} 负责，见 issue #174。
 */
const TEMP_IMAGE_DIR = join(tmpdir(), 'workbuddy-image-gen')

/** 将 Base64 图片写入临时文件，返回文件的绝对路径。 */
async function writeTempImage(b64: string, model: string): Promise<string> {
  await mkdir(TEMP_IMAGE_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safeModel = model.replace(/[^A-Za-z0-9._-]+/g, '_')
  const path = join(TEMP_IMAGE_DIR, `${safeModel}-${stamp}.png`)
  await writeFile(path, Buffer.from(b64, 'base64'))
  // 写入完成后在后台清理旧文件，不等待清理结果，见 issue #174。
  // 清理失败不应使已经成功的生成请求返回失败。
  void pruneTempDir(TEMP_IMAGE_DIR, TEMP_MEDIA_KEEP, ['.png'])
  return path
}

/**
 * 输入图的一切毛病都发生在「请求还没发出去」之前，所以统一用 INVALID_ARGS：
 * 不进冷却、不花积分，错误信息直接说清是哪个环节。
 */
function inputImageError(message: string): WorkBuddyImageError {
  return new WorkBuddyImageError(message, 'INVALID_ARGS')
}

const INLINE_BASE64_LABEL = '（内联 base64）'
const INLINE_DATA_URL_LABEL = '（内联 data URL）'

/** 图片的像素宽高。 */
interface ImageDimensions {
  readonly width: number
  readonly height: number
}

/**
 * 输入图方向，用于为改图选择输出画布。
 */
type ImageOrientation = 'landscape' | 'portrait' | 'square'

/** 方图容差：长短边之差不到长边的 5% 就算方图（比如 1000x1010）。 */
const SQUARE_TOLERANCE = 0.05

const ORIENTATION_LABEL: Readonly<Record<ImageOrientation, string>> = {
  landscape: '横图',
  portrait: '竖图',
  square: '方图',
}

/** `size: "auto"` 的输出长边：够 1080P 用，又离 419 万像素上限还远。 */
const AUTO_LONG_EDGE = 1536

/** 方向兜底档位：改图写了 auto 但比例极端到算不出画布、或干脆量不出宽高时用。 */
const DEFAULT_SIZE_BY_ORIENTATION: Readonly<Record<ImageOrientation, ImageDimensions>> = {
  landscape: { width: 1536, height: 1024 },
  portrait: { width: 1024, height: 1536 },
  square: { width: 1024, height: 1024 },
}

/**
 * 从图片文件头解析宽高，供 auto 画布计算使用。
 * 模型无法读取本地文件，因此由插件读取实际尺寸，再告知模型所选画布。
 * 支持 PNG、JPEG、GIF 和 WEBP；不解码像素，也不校验 CRC。
 * 数据不足或格式无法识别时返回 undefined，调用方继续使用方向默认尺寸。
 */
function parseImageDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  const at = (index: number): number => bytes[index] ?? 0
  const u16be = (index: number): number => (at(index) << 8) | at(index + 1)
  const u16le = (index: number): number => at(index) | (at(index + 1) << 8)
  const u24le = (index: number): number => at(index) | (at(index + 1) << 8) | (at(index + 2) << 16)
  const u32be = (index: number): number =>
    at(index) * 0x1000000 + (at(index + 1) << 16) + (at(index + 2) << 8) + at(index + 3)
  const u32le = (index: number): number =>
    (at(index) | (at(index + 1) << 8) | (at(index + 2) << 16)) + at(index + 3) * 0x1000000
  const positive = (width: number, height: number): ImageDimensions | undefined =>
    width > 0 && height > 0 ? { width, height } : undefined

  // PNG：8 字节签名 + IHDR 长度/类型，宽高是紧跟其后的两个大端 32 位。
  if (bytes.length >= 24
    && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    return positive(u32be(16), u32be(20))
  }

  // JPEG：段链扫描，第一个 SOFn 段里 precision(1) + height(2) + width(2)。
  if (at(0) === 0xff && at(1) === 0xd8) {
    let offset = 2
    while (offset + 8 < bytes.length) {
      if (at(offset) !== 0xff) {
        offset += 1
        continue
      }
      const marker = at(offset + 1)
      // 无长度的独立标记：TEM、RSTn、SOI。
      if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      const length = u16be(offset + 2)
      if (length < 2) return undefined
      const isSof = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) return positive(u16be(offset + 7), u16be(offset + 5))
      offset += 2 + length
    }
    return undefined
  }

  // GIF：逻辑屏幕描述符在偏移 6，宽高各 2 字节小端。
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) {
    return positive(u16le(6), u16le(8))
  }

  // WEBP：RIFF....WEBP + 子块。三种子格式的宽高位置都不一样。
  if (bytes.length >= 30
    && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46
    && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) {
    const chunk = String.fromCharCode(at(12), at(13), at(14), at(15))
    if (chunk === 'VP8 ') {
      // 有损：3 字节帧标签 + 3 字节起始码 9d 01 2a，随后是 14 位宽、14 位高。
      if (at(23) !== 0x9d || at(24) !== 0x01 || at(25) !== 0x2a) return undefined
      return positive(u16le(26) & 0x3fff, u16le(28) & 0x3fff)
    }
    if (chunk === 'VP8L') {
      // 无损：签名 0x2f 之后 14 位宽-1、14 位高-1。
      const bits = u32le(21)
      return positive((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
    }
    if (chunk === 'VP8X') {
      // 扩展：1 字节标志 + 3 字节保留，随后 24 位宽-1、24 位高-1。
      return positive(u24le(24) + 1, u24le(27) + 1)
    }
    return undefined
  }

  return undefined
}

/**
 * 根据宽高判断图片方向，供改图选择画布。
 */
function orientationOf(dimensions: ImageDimensions): ImageOrientation {
  const longest = Math.max(dimensions.width, dimensions.height)
  const shortest = Math.min(dimensions.width, dimensions.height)
  if (longest - shortest <= longest * SQUARE_TOLERANCE) return 'square'
  return dimensions.width > dimensions.height ? 'landscape' : 'portrait'
}

/**
 * 按输入顺序返回第一张可解析出宽高的图片尺寸。
 * 使用固定顺序以保证多图输入时判定一致；无法解析某张图片时继续检查下一张。
 */
function firstDimensions(
  inputs: readonly { readonly dimensions?: ImageDimensions }[],
): ImageDimensions | undefined {
  for (const input of inputs) {
    if (input.dimensions !== undefined) return input.dimensions
  }
  return undefined
}

/**
 * 按输入图比例计算 auto 输出画布。
 * 非方图将长边设为 AUTO_LONG_EDGE，并等比计算短边；方图使用 1024x1024。
 * 模型无法读取本地文件，因此由插件计算尺寸，避免模型猜测画布。
 * 极端比例无法等比落入支持范围时，使用对应方向的常用尺寸，
 * 并以 exact: false 记录比例发生变化，供 hint 向用户说明。
 */
function canvasForInput(
  input: ImageDimensions,
): { readonly width: number; readonly height: number; readonly exact: boolean } {
  const orientation = orientationOf(input)
  if (orientation === 'square') return { ...DEFAULT_SIZE_BY_ORIENTATION.square, exact: true }
  const longest = Math.max(input.width, input.height)
  const shortest = Math.min(input.width, input.height)
  const short = Math.max(1, Math.round((shortest * AUTO_LONG_EDGE) / longest))
  const width = orientation === 'landscape' ? AUTO_LONG_EDGE : short
  const height = orientation === 'landscape' ? short : AUTO_LONG_EDGE
  if (isSizeInRange(width, height, `${width}x${height}`)) {
    return { width, height, exact: true }
  }
  const fitted = fitIntoRange(width, height)
  if (fitted !== undefined) return { width: fitted.width, height: fitted.height, exact: true }
  return { ...DEFAULT_SIZE_BY_ORIENTATION[orientation], exact: false }
}

/** 两个上限（长边 2560、总像素 419 万）同时满足时，把宽高按比例收进范围。 */
function shrinkProduct(width: number, height: number): ImageDimensions {
  let w = width
  let h = height
  // 取整后面积仍可能超过上限，例如 2509x1673 = 4,197,557。
  // 继续逐步减小尺寸，并设置循环上限，避免异常输入导致无限循环。
  for (let round = 0; round < 4 && w * h > MAX_IMAGE_PIXELS; round += 1) {
    const scale = Math.sqrt(MAX_IMAGE_PIXELS / (w * h))
    w = Math.floor(w * scale)
    h = Math.floor(h * scale)
  }
  return { width: w, height: h }
}

/**
 * 把一个越界尺寸等比缩/放到合法范围。
 *
 * 两条边（512–2560）与总像素（≤4,194,304）是两个约束，必须同时满足：只按长边缩
 * 会把 2480x3508 变成 1810x2560（边长都对、乘积 4,633,600 仍越界）。所以缩放比取
 * 「2560/长边」与「√(4194304/(宽×高))」里更小的那个。
 *
 * 返回 undefined 表示等比缩放解不出来（比例比 5:1 还极端：缩到长边 2560 时短边
 * 已经小于 512，抬到 512 时长边又超过 2560），交给调用方按方向换档。
 */
function fitIntoRange(
  width: number,
  height: number,
): { readonly width: number; readonly height: number; readonly direction: 'down' | 'up' } | undefined {
  const longest = Math.max(width, height)
  const shortest = Math.min(width, height)
  const tooBig = longest > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS
  const tooSmall = shortest < MIN_IMAGE_EDGE

  if (!tooBig && tooSmall) {
    // 只小不大：短边抬到 512，另一边同比放大。长边放大后若超上限就交给下面的兜底。
    const scale = MIN_IMAGE_EDGE / shortest
    if (longest * scale <= MAX_IMAGE_EDGE) {
      const scaled = shrinkProduct(Math.round(width * scale), Math.round(height * scale))
      return { ...scaled, direction: 'up' }
    }
    return undefined
  }

  const scale = Math.min(MAX_IMAGE_EDGE / longest, Math.sqrt(MAX_IMAGE_PIXELS / (width * height)))
  const scaled = shrinkProduct(Math.floor(width * scale), Math.floor(height * scale))
  if (scaled.width >= MIN_IMAGE_EDGE && scaled.height >= MIN_IMAGE_EDGE) {
    return { ...scaled, direction: 'down' }
  }

  // 极端比例：短边缩到 512 之后长边仍然超上限，等比缩放无解。
  const extreme = MIN_IMAGE_EDGE / shortest
  if (longest * extreme <= MAX_IMAGE_EDGE) {
    const lifted = shrinkProduct(Math.round(width * extreme), Math.round(height * extreme))
    if (lifted.width * lifted.height <= MAX_IMAGE_PIXELS) return { ...lifted, direction: 'up' }
  }
  return undefined
}

/** 解析后的尺寸参数：`auto` 或一个具体的像素尺寸。 */
type SizeSpec =
  | { readonly kind: 'auto' }
  | {
    readonly kind: 'fixed'
    readonly width: number
    readonly height: number
    /** 小写规整后的原值，报错与 hint 都用它。 */
    readonly normalized: string
  }

/** 尺寸的最终决定：发给上游的值、用户原本写的值、以及「动过什么」的说明。 */
interface SizePlan {
  /** 最终发给上游的尺寸，小写「宽x高」。 */
  readonly size: string
  /** 规整成小写后的原始输入；写了 auto 就是 'auto'，没动过尺寸时不回带。 */
  readonly requested?: string
  /**
   * 记录尺寸调整结果，供 hint 向用户说明。
   */
  readonly note?: string
}

/** 一个尺寸是否直接可用：两条边在 512–2560，且宽乘高不超过 419 万。 */
function isSizeInRange(width: number, height: number, normalized: string): boolean {
  if (KNOWN_BAD_SIZES.has(normalized)) return false
  if (width < MIN_IMAGE_EDGE || height < MIN_IMAGE_EDGE) return false
  if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) return false
  return width * height <= MAX_IMAGE_PIXELS
}

/**
 * 统一检查四类输入图的空内容和 8 MB 大小限制。
 * byteLength 使用解码后的字节数，避免将约为原始数据 4/3 的 Base64 长度误作文件大小。
 */
function assertInputImageBytes(byteLength: number, source: string): void {
  if (byteLength === 0) throw inputImageError(`workbuddy image: 输入图是空文件：${source}`)
  if (byteLength > MAX_INPUT_IMAGE_BYTES) {
    const limit = MAX_INPUT_IMAGE_BYTES / 1024 / 1024
    const actual = (byteLength / 1024 / 1024).toFixed(1)
    throw inputImageError(`workbuddy image: 输入图 ${actual} MB，超过 ${limit} MB 上限：${source}`)
  }
}

/**
 * 将 data URL、HTTP(S) 地址、Base64 和文件路径统一转换为上游接受的 data URL。
 * 保持图片字节不变，不缩放、裁剪或转换图片格式。
 */
async function resolveImageInput(
  value: string,
  signal?: AbortSignal,
): Promise<ResolvedImageInput> {
  const text = value.trim()
  if (text.startsWith('data:')) {
    const parsed = parseImageDataUrl(text)
    if (parsed === undefined) {
      throw inputImageError(
        'workbuddy image: image 格式无效，请使用 data:image/*;base64,...。',
      )
    }
    // data URL 也必须在发送请求前检查空内容和 8 MB 限制。
    // 按 Base64 解码后的字节数计算，避免无效输入被提交到上游并触发冷却。
    const bytes = Buffer.from(parsed.base64, 'base64')
    assertInputImageBytes(bytes.byteLength, INLINE_DATA_URL_LABEL)
    const dimensions = parseImageDimensions(new Uint8Array(bytes))
    return dimensions === undefined ? { dataUrl: text } : { dataUrl: text, dimensions }
  }
  if (/^https?:\/\//i.test(text)) {
    let response: Response
    try {
      response = await fetch(text, { signal: signal ?? AbortSignal.timeout(IMAGE_INPUT_TIMEOUT_MS) })
    } catch (error: unknown) {
      throw inputImageError(
        `workbuddy image: 下载输入图失败（${text}）：`
        + (error instanceof Error ? error.message : String(error)),
      )
    }
    if (!response.ok) {
      throw inputImageError(`workbuddy image: 下载输入图失败（HTTP ${response.status}）：${text}`)
    }
    return encodeResolvedImage(
      new Uint8Array(await response.arrayBuffer()),
      response.headers.get('content-type') ?? undefined,
      text,
    )
  }
  if (isBareBase64Image(text)) {
    return encodeResolvedImage(
      new Uint8Array(Buffer.from(text, 'base64')),
      undefined,
      INLINE_BASE64_LABEL,
    )
  }
  const path = text.startsWith('file:') ? fileURLToPath(text) : text
  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch (error: unknown) {
    throw inputImageError(
      `workbuddy image: 读取输入图失败「${path}」：`
      + (error instanceof Error ? error.message : String(error)),
    )
  }
  return encodeResolvedImage(new Uint8Array(bytes), undefined, path)
}

/** 归一后的输入图：上游要的 data URL，加上顺手量到的像素宽高。 */
interface ResolvedImageInput {
  readonly dataUrl: string
  /** 量不出（格式不认识、头不完整）时没有这个字段；不影响这次请求。 */
  readonly dimensions?: ImageDimensions
}

/** 校验体积、定出 mime，把字节编成 data URL，并顺手量宽高。 */
function encodeResolvedImage(
  bytes: Uint8Array,
  contentType: string | undefined,
  source: string,
): ResolvedImageInput {
  assertInputImageBytes(bytes.byteLength, source)
  const declared = contentType?.split(';')[0]?.trim().toLowerCase()
  const mime = declared !== undefined && declared.startsWith('image/')
    ? declared
    : imageMimeForPath(source) ?? sniffImageMime(bytes)
  const dataUrl = imageDataUrl(mime, Buffer.from(bytes).toString('base64'))
  const dimensions = parseImageDimensions(bytes)
  // 量不出来就不带这个字段（exactOptionalPropertyTypes）：undefined 与「没有」
  // 在类型上要一致，免得调用方用 `'dimensions' in input` 时得到两种含义。
  return dimensions === undefined ? { dataUrl } : { dataUrl, dimensions }
}
/**
 * 造出工具定义。
 *
 * 每次 `apply()` 只造一个实例，所以冷却状态与目录缓存都挂在闭包里，
 * 生命周期跟着插件走。
 */
export function createImageTool(deps: ImageToolDeps): ImageToolDefinition {
  let mediaCache: { readonly at: number; readonly models: readonly WorkBuddyMediaModel[] } | undefined
  let cooldownUntil = 0

  const listModels = async (
    credential: WorkBuddyCredential,
    signal?: AbortSignal,
  ): Promise<readonly WorkBuddyMediaModel[]> => {
    const now = Date.now()
    if (mediaCache !== undefined && now - mediaCache.at < MEDIA_MODEL_TTL_MS) return mediaCache.models
    const models = await deps.listMediaModels(credential, signal)
    mediaCache = { at: now, models }
    return models
  }

  return {
    name: WORKBUDDY_IMAGE_TOOL_NAME,
    description:
      // 分段用 \n：这段文字是模型唯一的说明书，挤成一整段时尺寸规则会被淹掉。
      '用 WorkBuddy 生图或改图：一次调用只出一张图，要几张就调几次，每张单独计费。'
      + '本工具没有 seed、不存历史、不能重放：同一段 prompt 重调不保证张张一样。'
      + '调用前先确认用户需要相同图片的副本，还是内容不同的图片：'
      + '(i) 要「一样」「同款」「同一张」「复制几张」「跟上一张一样」→ 做不到，说明原因，让他只出一张自己复制；不报价、不调用。要几张「都一样」就走这一条，不是「出 N 张」。'
      + '(ii) 要「不同风格」「各来一张」→ 按 (b) 的口径报张数和总价（「4 张：国内版约 22.8、国际版约 0.12 积分」）→ 等他明确同意 → 连着调 N 次，每次换 prompt（换姿态、视角、光位）。'
      + '(iii) 要「挑一张」「先看一张」→ 先出 1 张给他看，满意再按张补后面的，补之前重新报一次总价。'
      + '没说同异、只问张数价钱（「4 张要多少钱」）→ 先问「要一样的还是各不相同的」，问完再报。'
      + '这三条用 (i)(ii)(iii) 编号，(d) 里的 ①②③④⑤⑥⑦⑧ 是 size 的台阶，两套编号别混。'
      + '什么时候必须先停下等用户点头，只看这七条：要出超过一张、这次调用会改变原图版式（裁切/留白）、'
      + '文生图且主体还没定、用户把某个超过 2560 的像素当验收标准（原话里有「必须」「正好」「就是要」「不能改」）、'
      + '用户要求硬排除某个元素（「绝对不能有 XX」）、要自己按表外比例算像素（见 ⑥）、'
      + '用户本轮或上一轮里说过嫌贵、或正要你改区设置（(c)）。'
      + '上述条件均不成立时，先按 (b) 告知两种区域的参考价格，再调用工具。'
      + '成立两条以上时合成一次问完。'
      + '「同意」只算用户明确说同意，沉默、反问、换话题都不算。'
      + '\n'
      + '(a) 画什么：prompt 写主体、风格、构图、光线。用户给了主体、只是没给风格和光线，就由你补，别为这个反问他；'
      + '只有 text-to-image 才受这条限制：用户连主体都没给（只说了尺寸、比例、档位、用途、方向或风格）就先问「想画什么」，'
      + '确认主体后再调用工具。提供 image 时，以参考图为主体，无需再次询问。'
      + '主体＝画面上要出现的人、物、景（「一只猫」「一束向日葵」）；只说「主题」「氛围」「风格」不算给了主体'
      + '（「秋季新品」是主题，「一束向日葵」才是主体）；风格、流派、季节、情绪只说明怎么画，不说明画什么'
      + '（「赛博朋克」「极简」「水彩」「秋天」「高级感」都不算主体）。'
      + '可以写「不要出现 XX」来排除元素，但那是弱提示、不保证生效。用户说「绝对不能有 XX」「必须没有 XX」时，'
      + '先说明工具无法保证排除指定元素，取得用户同意后再生成。这对应前述第五项确认条件。'
      + '需要图中文字时，写清文字内容和位置，文字控制在 10 字以内。prompt 控制在 300 个汉字以内；较长的提示虽不会报错，后半段仍可能被模型忽略，'
      + '所以用户给的长描述先由你压到 300 字以内，压完直接调，并在回复里附上实际用的那版 prompt。'
      + '改图时明确保留项和修改项，例如「保持第一张图的主体、构图、光线不变，只把 X 改成 Y」。描述以实际看到的参考图为依据；'
      + '这次 size 换了比例时别写「构图不变」也别写「只换画布」：工具实际会裁切或留白，画面内容会变，'
      + '只写「保持主体和光线不变」。用户只说改尺寸或方向、没说改内容时，prompt 就写「保持主体和光线不变，按新的画布重新构图」，不要另编画面内容。\n'
      + '(b) 花多少：按张计费，国内版约 5.71 积分/张，国际版约 0.03 积分/张，相差约 190 倍；文生图和改图同价。'
      + '报价按这个口径：还没拿到 credit 就两个区各报一个数（如「每张：国内版约 5.71、国际版约 0.03 积分」），'
      + '说清「2 张就是国内约 11.4 / 国际约 0.06」，并说明走哪个区这一次定不了、以返回的 credit 为准。'
      + '本次调用返回过 credit 的（同一张图、同一次请求）就直接按那个数报；没拿到过 credit 就报两档，'
      + '区域和模型变化可能影响单价，因此本次费用应以本次返回的 credit 为准。'
      + '实扣和你报的「约」对不上（差一个量级通常说明这次走了另一个区）就照实说实际扣了多少，别替它圆。'
      + '积分不等于人民币、也没有汇率，问折合多少照实说给不出。'
      + '生成单张图片时，先告知两种区域的参考价格，再在同一轮调用；前述七项确认条件仍然适用。'
      + '但用户这一句只是在问价（「多少钱」「先别画」）就只报、不调。用户要锁定金额只有一条路：按 (c) 关掉一个区的开关，让下一次只可能走另一个区。\n'
      + '(c) 使用区域由插件配置决定。国内版和国际版可分别登录，并分别开启「允许模型自主生图」，'
      + '本次走的是「开着且打开了那个开关」的区；两个区都满足时走国内版（贵的那一档），'
      + '只开国际版时才走国际版。'
      + '本次走哪个区调用前查不到，以返回的 region 为准（cn=国内版、global=国际版），回复里翻译成中文。'
      + '用户嫌贵或问「能不能走便宜的那个区」，就告诉他去插件设置把不想用的那个区的'
      + '「允许模型自主生图」关掉，下一次调用才生效；改设置之前这一张先别调，等改完再调，'
      + '否则照样按国内版扣。'
      + '用户问价就按 (b) 的两个数报，不要为了问价去出图；多张且没说同异时先问同异再报总价。'
      + '要拿到真实单价就得真调一次，那就先说清「这一次会真扣一次积分」，用户同意再调。'
      + '返回 NOT_LOGGED_IN 时，请用户检查两个区域的登录状态和生图开关。'
      + '报这个错时还没发请求，不扣积分。\n'
      + '(d) size 怎么填（必填）：写「宽x高」的像素数（例如 1024x1536），改图也可以写 auto。'
      + '**先过 (a) 的主体门槛**：主体没给、还在问「想画什么」的时候，后面的推导一条都不要走，更不要为了尺寸先出一张。'
      + '主体确认之后，按顺序匹配，命中一条就停（比例词和方向词都算「用户提了」）：\n'
      + '① 用户对输出图给了具体像素 → 先改写成「数字 + x」再传（1024*1024、1024 by 1024 都写成 1024x1024；'
      + '带空格、*、by 的写法会被 DSH 拒绝，需要先转换；X、× 由工具规整）。尺寸越界时由工具等比缩放，'
      + '唯一的例外是比 5:1 还细长的比例，那种缩不出合法值，见下面的范围段。'
      + '改图时 size 表示输出画布。用户说「我这张图是 1600x900」'
      + '是在交代输入图，照 ④ 处理。\n'
      + '② 比例词各对应唯一一档：「16:9」2560x1440、「9:16」1440x2560、'
      + '「4:3」2048x1536、「3:4」1536x2048、「3:2」1536x1024、「2:3」1024x1536、「1:1」1024x1024。'
      + '比例词优先于档位词和方向词。例如，「2K 的 16:9 壁纸」还是 2560x1440（不是方图 2048x2048），'
      + '「16:9 横图」也是 2560x1440，不是 3:2 的 1536x1024。'
      + '比例词一旦命中，就不再因为用户又加了 2K / 4K / 高清 / 大图而改值，唯一例外是「1:1」：'
      + '只说 1:1 是 1024x1024，同时说了 2K / 4K / 高清 / 大图才写 2048x2048（别的比例词没有这个例外）。'
      + '比例和方向冲突时，按比例确定尺寸并向用户说明。例如，「9:16 横图」写 1440x2560（竖的），'
      + '回复里要说明「按 9:16 出的是竖图，和您说的横版不一致」。\n'
      + '③ 档位词只在用户没提比例词时生效，一词一档：「2K」横 2560x1440、竖 1440x2560、方 2048x2048；'
      + '「4K」不设独立档，直接用上面 2K 那组值（横的 2560x1440 就填这个）。别按常识换成 3840x2160 或 4096x2160：'
      + '本工具最长边只有 2560，写大了会被等比缩回 2K 档，尺寸一样、描述还多一句换算；'
      + '「高清」按 2K；「1080P」横 1920x1080、竖 1080x1920，「720P」横 1280x720、竖 720x1280。'
      + '方向统一这么定：用户明说了横/竖/方就按他说的；没说就看用途（桌面壁纸算横，手机壁纸、竖版海报、开屏算竖）；'
      + '用途也没说就用方。1080P / 720P 没有方档，这两个落到「用途也没说」时按横的给'
      + '（「1080P 的竖版海报」：海报算竖，给 1080x1920）。'
      + '同时给出档位和用途时，用档位确定尺寸、用用途确定方向。例如，'
      + '「4K 配图」是 2048x2048，不是 ⑤ 的 1024x1024。'
      + '只有用户提的档位超出本工具上限（说「4K」「8K」「原图那么大」）时，才在回复里补一句「本工具最长边 2560，出的是这一档」；说 2K / 高清 / 1080P 的不必提 4K 这回事。\n'
      + '④ 有输入图时，先区分输入图尺寸和输出尺寸。'
      + '「改成 1200x800」「要 9:16」是输出；「我这张是 1600x900」是输入，输入尺寸永远不填进 size，'
      + '这种情况直接写 auto。同一句里既有输入图尺寸又有比例时（「这张 4000x1000 的图改成 4:5」），'
      + '输入那个数不参与匹配，按比例走：4000x1000 只是输入尺寸，size 填 ⑥ 算出来的 4:5 那组。'
      + '分完之后按这个顺序定：提了输出像素 → 用 ①；提了比例 → 用 ②；提了档位词 → 用 ③；提了用途 → 用 ⑤；'
      + '只提了方向 → 见 ⑦；只说了「保持原比例」「版式别动」「就按这张的比例」，或什么都没提、'
      + '或只是交代了输入图多大（「我这张是 1600x900」）→ 写 auto。'
      + '改图只要 size 的比例可能和原图不一样（写了具体比例，或按档位词 / 方向 / 用途给了某个档），'
      + '工具会按 size 裁切或留白，可能改变原图版式。调用前应说明'
      + '「会按这个比例裁切/留白，原版式可能被切」，他同意再调，别等出完图才说。'
      + '用户要求保留原版式时，使用 auto。原图长宽比超过 5:1 时，auto 也会调整比例，调用前需说明这一限制，具体规则见下方范围说明。\n'
      + '⑤ 用户说了用途（一样先过 (a)：只有用途没有主体，先问「想画什么」，别拿用途当主体）→ 配图、插图、封面、头像、表情包 1024x1024；要「大一点的方图」或「大图」单独出现 → 2048x2048；'
      + '桌面壁纸 2560x1440；手机壁纸、竖版海报（要说到「海报」才算）、手机开屏 1440x2560；只说「竖版」「横版」「方图」是方向词，走 ⑦，不算用途。'
      + '表里每行都自带方向，命中一行就用它；用户另外说的方向与这一行冲突就交换宽高：'
      + '横的行他要竖 → 1024x1536，竖的行他要横 → 1536x1024，方的行他要横 → 1536x1024、要竖 → 1024x1536'
      + '（「给这篇文章配张图，要横的」→ 1536x1024，不是 1024x1024）；'
      + '方向与这一行相同就照这一行走（「做张手机壁纸，要竖的」→ 仍是 1440x2560）。'
      + '比例词已命中的到不了这一阶（「1:1 的配图，要横的」按 ② 走）。'
      + '用途不在表里，且用户另外说了方向 → 见 ⑦；连方向也没说 → 1024x1024。\n'
      + '⑥ 用户说的是表里没有的比例（4:5、21:9、5:4 等）→ 就按这个比例写一组像素：'
      + '两个上限取更严的那个（长边 2560、面积 4,194,304），按比例算完取整、再把宽高乘一遍验算'
      + '（21:9 → 2560x1097；4:5 → 1831x2289，再多一号就超面积）。这一阶只在你需要自己算像素时用，而算出来的比例不能比 5:1 更细长（8:1 这种长边算到 2560 时短边只剩 320，'
      + '固定像素会在本地被拒绝，具体规则见下方范围说明）。遇到这种比例时，改图使用 auto，'
      + '文生图没有 auto 可退（auto 要量输入图，没图会在本地报错），只能先跟用户说最细到 5:1、让他换个不那么细长的比例。'
      + '算出来的宽高先按 ④ 说给用户（改图时尤其要说会被裁切），同意后再调用；调用完把实际填的宽高写进回复。\n'
      + '⑦ 只提了方向、比例档位用途都没提 → 取 ② 表里同方向那一档：横 1536x1024、竖 1024x1536、方 1024x1024。'
      + '这一阶管所有方向词：④ 里「只提了方向」、③ 里定方向、⑤ 里表外用途，都落到这里。\n'
      + '⑧ 以上全都没命中、也看不出方向 → 1024x1024（默认档），回复里说一句是按默认档出的。'
      + '⑧ 只管尺寸，不给主体发通行证：「随便画一张」没有主体，先按 (a) 问清想画什么，再回来走这一阶。'
      + '有输入图且未指定尺寸时，按 ④ 使用 auto，以保留原图比例。\n'
      + '范围：两条边各 512–2560，宽乘高不超过 4,194,304（这是工具的上限；① 里说「别自己缩」是因为工具会替你缩，⑤ 里那几档本身都在范围内）。'
      + '写超了、或某条边小于 512，都不用你换算：工具会等比缩/放后照常出图，'
      + '并在 hint 中说明从请求尺寸到实际尺寸的换算，同时返回 requestedSize。'
      + '这句必须转告用户，别把缩过的尺寸说成用户要的。'
      + '比例极端到缩不进这个范围（比 5:1 还细长）时：写了固定像素就在本地报错、不扣积分；'
      + '改图使用 auto 时，工具改用对应方向的常用尺寸，并在 hint 中说明比例变化。'
      + '这一句同样要转告用户。\n'
      + 'image 是改图用的参考图，写成数组，一张也写 ["/abs/a.png"]；数组长度只表示参考图张数，不影响出图张数（永远一张）。'
      + '多张按顺序全部生效，第一张当主参考，主体冲突以第一张为准。'
      + '纯文生图把这个字段整个省掉，不要传空数组（[] 会被拒）。'
      + '格式与 8 MB 上限见 image 参数的说明。用户只说「这张图」却没给路径时先问他要路径，别猜一个；前面哪一轮给过就沿用那一张，调用前把文件名说出来确认。\n'
      + 'model 一般留空（或空字符串）：留空就用该区目录里第一个带对应 tag 的模型（文生图 text-to-image、改图 image-to-image）。'
      + '用户指定模型时，填写其 id。模型不存在或缺少对应 tag 时，工具会拒绝调用并列出可用 id。'
      + '别自己编 id。用户说「用上次那个模型」这类指代、没给 id 时，留空按目录第一个，并告诉他这次实际用的是哪个。'
      + '用户说「用便宜的那个」是在说区、不是模型，按 (c) 回答。\n'
      + '计费边界分三种说法：返回带 url 又带 credit → 按 credit 说实扣了多少；'
      + '带 url 但没 credit → 按 (b) 的两档估，并说明以账单为准；'
      + '没拿到图、但请求已经发到上游（超时、审核拒绝、上游报错）→ 只能说「这一次没拿到图、可能已扣费」，'
      + '不得断言没扣费、不得自己重发，由用户决定要不要再花一次。'
      + '清单里这些是「请求根本没发到上游」，确定不扣积分，可以改完直接重试：'
      + '宿主把参数挡下来（size 不是「宽x高」也不是 auto、image 空数组、多传了别的字段）、'
      + 'size 写了 auto 但这次没给输入图（文生图）、写了固定像素但比例比 5:1 还细长、'
      + 'model 不存在、图读不出来或超过 8 MB、没登录或没开那个开关。'
      + '判据：本地拒一定带 INVALID_ARGS 或 NOT_LOGGED_IN 这种错误码；抛的不是这两个码、又没拿到图，一律按「可能已扣费」讲。'
      + '重试等于新的一次计费决策：本地拒那种改完直接重试；其余情况重试前按 (b) 重新报价并取得同意。\n'
      + '返回：url（COS 签名 URL，约 24 小时后失效；只有 path 那种情况下 url 是 file:// 本地地址、不过期）、mode（generate 或 edit）、region（cn/global）、'
      + 'size（实际出图宽高）、model、prompt、hint（可直接转述给用户）、'
      + 'credit（上游结算的实际积分，没给就没这个字段）、requestedSize（尺寸被缩/放过时才回带，是你原本写的值）、'
      + 'path（上游返回内联 base64 时本工具落盘才有，此时也有一份 url 是 file:// 地址）。'
      + '展示图片时使用 Markdown 图片语法。有 path 时引用本地路径；只有 url 时引用链接，并提醒用户及时另存。'
      + '本工具不负责下载或转存，要长期保存得用户自己点开链接另存。',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          minLength: 1,
          description:
            '画面描述（中文或英文都可以）。写清楚主体、风格、构图、光线；'
            + '改图时还要写明哪些要保持原样、哪些要改。这里只写「画什么」，比例交给 size。',
        },
        size: {
          type: 'string',
          pattern: '^([0-9]+[xX×][0-9]+|auto)$',
          description:
            '必填，二选一：一是「宽x高」的像素数（如 1024x1024、1024x1536、1536x1024），二是 auto。'
            + '改图要保住原版式就写 auto：工具会量出第一张输入图的宽高、按同比例定画布，不用你猜原图多大。'
            + '写像素数时只写「数字 + x」（X、× 也收，工具会规整成小写）。用户说的「2K」「4K」「高清」「9:16」这类档位词和比例词都先按'
            + '工具描述里的表换成像素数，也不要只写一个边长。'
            + '上限是两条边各 512–2560、宽乘高不超过 4,194,304（约 419 万，2048x2048 正好顶格）：'
            + '写超了不会报错，工具会等比缩/放并在 hint 里说明，用户说的数可以照写。'
            + '唯一的例外是比例比 5:1 还细长（如 2560x400）：缩不出合法值时会在本地报错、不扣积分。',
        },
        image: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description:
            '输入图数组，可选。填了就是改图（image-to-image）；纯文生图请整个省略本字段，'
            + '不要传空数组（[] 会被拒）。一张图也要写成数组：["/abs/path.png"]；Windows 路径写成 ["C:\\\\abs\\\\a.png"]，'
            + '本工具收的是结构化参数，直接写真实路径 C:\\Users\\me\\a.png 就行，反斜杠不用翻倍；'
            + '只有在手写 JSON 文本时，一个反斜杠才要写成两个。'
            + '多张参考图按数组顺序全部生效，如 [模板图, 服装图]。'
            + '每个元素接受本地绝对路径、file:// URL、http(s) URL、data URL 或裸 base64，'
            + '每张输入图上限为 8 MB，按原始文件字节计算。工具不压缩图片，也不转换格式；'
            + '超了会在本地报错、不扣积分，先让用户压一下再传。',
        },
        model: {
          type: 'string',
          description:
            '模型 id，可选，一般留空（空字符串也算留空）。只有用户点名要某个模型时才填，'
            + '填了不存在或没有对应 tag 的 id 会直接报错并列出可用 id，不会盲发。',
        },
      },
      required: ['prompt', 'size'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '图片地址（COS 签名 URL，或本地 file:// 地址）。' },
          mode: { type: 'string', description: "'generate'（文生图）或 'edit'（改图）。" },
          region: { type: 'string', description: "'cn'（国内版）或 'global'（国际版）。" },
          size: { type: 'string', description: '实际出图尺寸，规整后的小写「宽x高」。' },
          requestedSize: {
            type: 'string',
            description: '尺寸被工具等比缩/放过时才有，是你原本写的值（写 auto 时是 auto）。',
          },
          model: { type: 'string', description: '实际使用的模型 id。' },
          prompt: { type: 'string', description: '实际提交的画面描述。' },
          hint: { type: 'string', description: '给模型的后续提示（如何展示、链接时效）。' },
          credit: { type: 'number', description: '本次实际消耗的 WorkBuddy 积分。' },
          path: { type: 'string', description: '服务端返回 base64 图片时的本地保存路径。' },
        },
        // region 和 size 均为必填参数。region 用于确定区域并取得对应报价。
        required: ['url', 'mode', 'region', 'size', 'model', 'prompt', 'hint'],
        additionalProperties: false,
      },
      render(_args: unknown, value: unknown): ImageToolContentBlock[] {
        const record = asRecord(value)
        const url = asNonEmptyString(record['url']) ?? ''
        const model = asNonEmptyString(record['model']) ?? 'unknown'
        const mode = record['mode'] === 'edit' ? '改图' : '文生图'
        const credit = typeof record['credit'] === 'number' ? record['credit'] as number : undefined
        const path = asNonEmptyString(record['path'])
        const hint = asNonEmptyString(record['hint']) ?? ''
        const lines = [
          `![WorkBuddy ${mode}](${url})`,
          '',
          `${mode} · 模型：\`${model}\`${credit === undefined ? '' : ` · 消耗 ${credit} 积分`}`,
        ]
        if (path !== undefined) lines.push(`本地文件：${path}`)
        if (hint !== '') lines.push('', hint)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    timeoutMs: IMAGE_TOOL_TIMEOUT_MS,
    async execute(args: unknown, exec: ImageToolExec): Promise<Record<string, unknown>> {
      const record = asRecord(args)
      rejectUnknownArgs(record)
      const prompt = asNonEmptyString(record['prompt'])
      if (prompt === undefined) {
        throw new WorkBuddyImageError(
          `${WORKBUDDY_IMAGE_TOOL_NAME}: 参数 prompt 必填，且必须是非空字符串。`,
          'INVALID_ARGS',
        )
      }
      const sizeSpec = parseSizeSpec(record['size'])
      const requestedModel = strictString(record['model'], 'model')
      // 模式由「有没有给输入图」唯一决定：不新增 mode 参数，免得出现
      // 「mode=edit 但没图」这种自相矛盾的请求。
      const images = asImageList(record['image'])

      const now = Date.now()
      if (now < cooldownUntil) {
        const seconds = Math.ceil((cooldownUntil - now) / 1000)
        throw new WorkBuddyImageError(
          `workbuddy image: 图片生成失败后需等待，请 ${seconds} 秒后再试`
          + '，以减少重复计费。',
          'COOLDOWN',
        )
      }

      const credential = await deps.resolveCredential()
      if (credential === undefined) {
        throw new WorkBuddyImageError(
          'workbuddy image: 当前没有已授权的图片生成账号。'
          + '请登录需要使用的区域，'
          + '并在设置中开启「允许模型调用图片生成工具」。',
          'NOT_LOGGED_IN',
        )
      }

      const signal = exec.signal === undefined
        ? AbortSignal.timeout(IMAGE_TOOL_TIMEOUT_MS)
        : AbortSignal.any([exec.signal, AbortSignal.timeout(IMAGE_TOOL_TIMEOUT_MS)])

      // 这一次到底有没有把生图请求发出去。冷却的前置条件，具体错误分类见
      // `isBillableFailure` 的注释：读取目录时尚未发送生成请求，不进入生成冷却。
      let sent = false
      try {
        const models = await listModels(credential, signal)
        // 先把输入图归一成 data URL：读文件 / 下载都在「发请求」之前，
        // 失败了不花积分、也不该触发冷却。
        // 多张参考图全部归一成 data URL（都发生在「发请求」之前，失败不花积分）。
        const resolved = images === undefined
          ? undefined
          : await Promise.all(images.map(image => resolveImageInput(image, signal)))
        // 从参考图字节中解析实际尺寸。auto 使用该尺寸计算画布；
        // 指定尺寸时仅在 hint 中说明调整结果，不依赖模型读取本地文件。
        const inputSize = resolved === undefined ? undefined : firstDimensions(resolved)
        const plan = planImageSize(sizeSpec, inputSize)
        const size = plan.size
        const inputs = resolved?.map(input => input.dataUrl)
        const tag = inputs === undefined ? IMAGE_TAG_TEXT_TO_IMAGE : IMAGE_TAG_IMAGE_TO_IMAGE
        const model = pickMediaModel(models, requestedModel, tag)
        sent = true
        const outcome = inputs === undefined
          ? await deps.generateImage(credential, { model: model.id, prompt, size }, signal)
          : await deps.editImage(
            credential,
            { model: model.id, prompt, size, image: inputs },
            signal,
          )
        const mode = inputs === undefined ? 'generate' : 'edit'
        // 根据当前凭据的 domain 确定区域，再报告实际模型及上游返回的积分用量。
        // 工具同时服务两个区域，不能使用注册时的区域代替本次调用区域。
        const region = regionOf(credential.domain) === 'global' ? 'global' : 'cn'
        const regionLabel = region === 'global' ? '国际版' : '国内版'
        const dimensionNote = plan.note === undefined ? '' : `${plan.note}。`
        const inputNote = inputSize === undefined
          ? ''
          : `输入图第一张是 ${inputSize.width}x${inputSize.height}（`
            + `${ORIENTATION_LABEL[orientationOf(inputSize)]}）。`
        const value: Record<string, unknown> = {
          mode,
          region,
          size,
          model: model.id,
          prompt,
          hint:
            `这张图来自 WorkBuddy ${regionLabel}（模型 ${model.id}，`
            + `${mode === 'edit' ? '改图' : '文生图'}，尺寸 ${size}）。`
            + inputNote
            + dimensionNote
            + (outcome.credit === undefined
              ? '本次响应没带扣费字段，具体扣了多少以额度面板为准。'
              : `本次实际扣费 ${outcome.credit} 积分。`)
            + 'COS 签名 URL 约 24 小时失效；要长期保留请及时下载。',
        }
        // 只有真的动过才回带：用户写的就是 1024x1024 时，多一个 requested 字段反而
        // 让调用方以为「请求值和实际值不一致」是个常态。
        if (plan.requested !== undefined && plan.requested !== size) {
          value['requestedSize'] = plan.requested
        }
        if (outcome.url !== undefined) {
          value['url'] = outcome.url
        } else if (outcome.b64 !== undefined) {
          const path = await writeTempImage(outcome.b64, model.id)
          value['url'] = pathToFileURL(path).href
          value['path'] = path
          value['hint'] = `${value['hint'] as string} 服务端返回 base64 图片，已保存为本地文件。`
        } else {
          throw new WorkBuddyImageError(
            'workbuddy image: 上游既没有返回 url 也没有返回 b64_json。',
            'EMPTY_RESULT',
          )
        }
        if (outcome.credit !== undefined) value['credit'] = outcome.credit
        return value
      } catch (error: unknown) {
        // 结合 sent 与错误码判断冷却。参数、登录、目录及选模阶段的失败不进入冷却。
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
 * 向 DSH 同步注册工具，并返回供调用方清理注册的 disposer。
 * tools 服务由 DSH 提供；服务缺失时记录警告并返回 undefined，避免阻止整个插件加载。
 */
export function registerWorkBuddyImageTool(
  tools: ToolsServiceLike,
  deps: ImageToolDeps,
): (() => void) | undefined {
  try {
    return tools.register(createImageTool(deps))
  } catch (error: unknown) {
    deps.logger.warn(
      `dsh-connect-workbuddy: 注册 ${WORKBUDDY_IMAGE_TOOL_NAME} 失败: `
      + (error instanceof Error ? error.message : String(error)),
    )
    return undefined
  }
}
