/**
 * 前端共享常量
 *
 * 集中管理业务约束，避免魔法数字散落在多个组件中导致不一致。
 */

/**
 * 参考图最大上传数量
 *
 * 与后端 multer limits.files 和 draft_reference_images 上限校验保持一致。
 * README 明确声明最多 16 张参考图。
 */
export const MAX_REFERENCE_IMAGES = 16
