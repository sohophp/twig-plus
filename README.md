# TwigPlus

TwigPlus 是一个面向 VSCode 的 Twig 扩展，目标是先把 `.twig` 和 `.html.twig` 的格式化稳定做好，再逐步补齐 Twig 模板开发常用的智能编辑能力。

当前版本为 `v1.0.0`，重点是：

- 识别 `.twig` 与 `.html.twig`
- 注册 VSCode 文档格式化
- 提供基础 Twig + HTML 缩进整理
- 统一 `{{ }}`、`{% %}`、`{# #}` 内部空格
- 提供 42 个 formatter / completion / diagnostics / navigation 测试

## 当前支持范围

- Twig 标签识别：
  - `{{ ... }}`
  - `{% ... %}`
  - `{# ... #}`
- 基础控制结构缩进：
  - `if / elseif / else / endif`
  - `for / else / endfor`
  - `block / endblock`
  - `embed / endembed`
  - `macro / endmacro`
  - `apply / endapply`
  - `filter / endfilter`
  - `autoescape / endautoescape`
  - `with / endwith`
- 额外支持：
  - `set / endset` 捕获块缩进
  - `spaceless / endspaceless`
  - `{%- -%}`、`{{- -}}` 这类 trim marker 的空格规范化与保留
- HTML + Twig 混排行缩进稳定化：
  - `<div>{% if %}` 这类行内混排
  - `</div>{% endif %}` 这类混合收尾行
  - HTML 文本节点中夹带 `{{ ... }}`
- 内嵌区块格式化：
  - `<style>` 内 CSS 格式化
  - `<script>` 内 JavaScript 格式化
  - Twig 片段在内嵌代码中会先占位保护，再恢复原样
- 格式化配置项：
  - `printWidth`
  - `htmlAttributeWrap`
  - `preserveSingleLineBlocks`
- 编辑辅助：
  - Twig snippets
  - Twig 标签补全
  - Twig 过滤器补全
  - Twig 常用函数补全
- 模板路径补全：
  - `extends`
  - `include`
  - `embed`
  - `import`
  - `from`
- 模板跳转：
  - `Ctrl+Click` / `Go to Definition`
  - 支持 `extends`
  - 支持 `include`
  - 支持 `embed`
  - 支持 `import`
  - 支持 `from`
- Block 智能：
  - Outline / Document Symbols 显示 Twig block
  - block 名称可跳转
  - 子模板可沿 `extends` 跳转到父模板同名 block
- 基础诊断：
  - 未闭合 Twig 结构
  - 意外的中间或结束标签
  - 缺失模板引用
  - 重复 block 名称
  - 空 `{{ }}` 输出
- 格式化失败时回退原文

## 已知限制

- 这还是早期版本，不是完整 Twig formatter
- 还没有完整 AST，也没有 Language Server
- 多行 HTML 属性、复杂内联 JS/CSS、复杂 Twig 表达式目前只保证“尽量不破坏”，不保证达到 Prettier 级输出
- 补全当前以静态词典为主，还没有项目级语义分析
- 诊断当前仍是轻量规则驱动，还没有完整 Twig 语义分析

## 配置

```json
{
  "twigPlus.format.enable": true,
  "twigPlus.format.indentSize": 2,
  "twigPlus.format.printWidth": 100,
  "twigPlus.format.useTabs": false,
  "twigPlus.format.twigTagSpacing": true,
  "twigPlus.format.htmlAttributeWrap": "auto",
  "twigPlus.format.preserveSingleLineBlocks": true
}
```

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 编译

```bash
npm run build
```

3. 运行测试

```bash
npm test
```

## 在 VSCode 中调试扩展

1. 用 VSCode 打开 `twig-plus`
2. 运行 `npm install`
3. 运行 `npm run build`
4. 在 VSCode 里按 `F5`
5. 在弹出的 Extension Development Host 中打开一个 `.twig` 或 `.html.twig` 文件
6. 执行 `Format Document`，或按 `Shift + Alt + F`

## Snippets 与补全

- 内置 snippets：
  - `twig-if`
  - `twig-for`
  - `twig-block`
  - `twig-include`
  - `twig-extends`
  - `twig-embed`
  - `twig-set`
  - `twig-macro`
  - `twig-with`
  - `twig-apply`
- 在 `{% ... %}` 中支持标签补全
- 在 `{{ value|... }}` 中支持过滤器补全
- 在 `{{ ... }}` 中支持常用函数补全，例如 `path()`、`asset()`、`include()`
- 在 `{% extends '...' %}`、`{% include '...' %}`、`{% embed '...' %}`、`{% import '...' %}`、`{% from '...' import ... %}` 中支持模板路径补全
- 在同样这些模板引用场景中支持 `Go to Definition`
- 在 Outline 面板中显示 Twig block
- 在 block 名称上支持 `Go to Definition`，并优先跳转到父模板中的同名 block
- 在 Twig 文件中显示基础诊断提示和警告

模板路径补全优先会把以下目录映射成 Twig 引用路径：

- `templates/`
- `app/Resources/views/`
- `src/*/Resources/views/`

## v1.0.0 范围

`TwigPlus 1.0.0` 当前聚焦在三件事：

- 复杂 Twig 模板格式化尽量稳定，不轻易改坏文件
- 在 VSCode 中提供 Twig 模板的常用补全、路径补全和模板跳转
- 为模板结构错误和缺失引用给出轻量诊断

建议先用下面这样的内容测试：

```twig
{% if   user %}
<div>
{{user.name}}
</div>
{% else %}
<span>guest</span>
{% endif %}
```

预期会被整理成：

```twig
{% if user %}
  <div>
    {{ user.name }}
  </div>
{% else %}
  <span>guest</span>
{% endif %}
```
