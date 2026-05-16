# 更新说明

## 2026-05-16

### 新增 beautiful-html-templates 模板库

本次更新把 [`beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates) 作为内置模板资源接入 HTML PPT Editor，为智能生成和模板浏览增加 34 套高质量 HTML 演示模板。

#### 新增能力

- 内置 34 个 `beautiful-html-templates` 模板，并保留原仓库 MIT 许可证声明。
- HTML PPT 指南的模板库现在可展示新增模板，支持搜索、预览、查看模板属性和复制提示词。
- 新增模板预览适配器，兼容 `section.slide`、`div.slide`、`deck-stage` 等不同模板结构。
- 智能体现在可以识别这些模板名称，并基于选定模板生成兼容编辑器的 `section.slide` 页面。
- 新增同步脚本 `scripts/sync-beautiful-html-templates.mjs`，方便后续更新模板快照。

#### 生成策略

- 新模板作为“模板库 + 提示词”资源接入，优先用于风格选择、预览和智能体起稿。
- 当使用 beautiful-html-templates 模板时，智能体会保留原模板的字体、色彩、装饰语言和版式节奏。
- 最终生成结果会适配 HTML PPT Editor 的编辑器契约：每一页使用 `section.slide`，并保留键盘翻页体验。

#### 验证

- `npm test` 通过：28 个测试文件，208 个测试。
- `npm run build` 通过。

