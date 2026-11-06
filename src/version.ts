/**
 * Package version, injected at build time by `tsdown.config.ts`.
 *
 * 参考：corrinehu/dsh-workbuddy-connect（MIT）— 版本由构建期 define 添加，
 *   而非运行时读取 package.json，避免打包后相对路径变化影响版本读取。
 *   发布包仍包含 package.json。
 *
 * @module dsh-connect-workbuddy/version
 */

declare const __DSH_WORKBUDDY_VERSION__: string

/** The npm package version this build was produced from. */
export const WORKBUDDY_CONNECT_VERSION: string =
  typeof __DSH_WORKBUDDY_VERSION__ === 'string' && __DSH_WORKBUDDY_VERSION__ !== ''
    ? __DSH_WORKBUDDY_VERSION__
    : '0.0.0-dev'
