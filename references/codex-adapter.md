# Codex可选适配器

脚本scripts/build_editable_deck.mjs是JSON驱动的草稿构建器，不是只能填文字的固定课件模板。它使用当前环境的@oai/artifact-tool。先用load_workspace_dependencies获取RUNTIME_NODE、RUNTIME_NODE_MODULES。制作最终PPT时遵守已安装Presentations技能：读取其implementation.md、API文档、finalization.md，按要求记录制作开始并完成finalizer。脚本不代替finalizer，也不宣称检查PowerPoint应用兼容性。

仅当宿主已提供相应Codex运行时才使用本页；不适用于仅有内置生图的其他平台。load_workspace_dependencies与Presentations不是本Skill的通用前置依赖。

## 计划格式

先落实[教学页面规则](teaching-page-rules.md)，再把page-plan转成plan.json。每页保留student_action、immediate_output、teaching_design_source、classroom_wording与exact_text的对应关系，可直接放入slides[]的同名元数据，也可保留在关联page-plan中；课堂完整讲述与提示映射到notes。上屏只保留当下动作所需内容，不按商业演示模板追加副标题、页眉页脚、页码或导航。

每页附page_type（[版面底版](page-chassis.md)第五节的七种之一），其版位随页型确定；同一页型在全册内的主板坐标偏差≤1%。

文本对象建议附role，区分title、task、material、scaffold、feedback与material_label；title每页至多一个，可为零。不得生成subtitle、header、footer或page_number职责的对象。layout记录单栏中由上到下的次序，不用左右正文栏或并排任务卡；图解作为一个材料块保留内部必要空间关系。

elements的从底到顶顺序按[版面底版](page-chassis.md)的五层排：底图层 → 内容板层 → 内容层 → 锚点层 → 标注层。底图层对象不含文字；锚点层的立绘与正文对象的包围盒不重叠。排完逐页核对该文件第三节的量化上限（字号占画布高的百分比、行数、对象数、语义色数等），超限先拆页，不改小fontSize。

这些元数据用于设计和人工复核，当前基础构建器会忽略未使用的附加字段，并未据此自动验证教学规则。必须对照设计单和最终渲染完成quality.md中的教学验收，不能以脚本成功代替。

plan.json相对路径以它所在目录为基准。画布单位为96DPI像素；默认1280×720。elements按顺序叠放，从底到顶。每个对象name唯一、语义明确；标题、正文、必要的教学图解、人物分别定义。

将项目设计单转换成以下字段；字段说明是接口格式，不是可直接运行的成套设计模板。先生成实际素材，所有值根据当前页面确定。

| 字段 | 由当前任务提供的值 |
|---|---|
| canvas.width/height | 本套画布宽高 |
| font | 当前环境可用、适合本套风格的字体 |
| slides[].background | 本页底色，由style-spec确定 |
| slides[].notes | 本页教师提示、来源或答案 |
| slides[].elements | 按底到顶排序的独立对象；每项包含type、name与x/y/w/h |
| text对象 | 本页准确text、fontSize、color及所需字体和对齐 |
| shape对象 | 当前容器/图解的geometry、fill、lineColor等 |
| image对象 | 实际存在的项目素材path、fit、alt及其位置 |

基础构建器的白底、深色文字与透明形状回退仅防止字段缺失，不是设计方案；应在plan中显式填写本项目颜色。它不内置课程文字、配色、人物或固定布局。

通过多张场景层和独立图片、原生容器与教学对象表达页面设计；不要只放一个标题、一段问题和一张人物图当成通用模板。复杂外观或图解超出脚本能力时扩展正式API，不简化用户的目标。

name是项目中的逻辑标识；原生形状/文字名会保留，当前图像API不保留同名字段，图片对应关系另存image-map.json，仍作为独立图片嵌入。

支持字段：

- 公共：type、name、x/y/w/h、rotation（默认0，必要素材可轻微旋转）。文本框通常不旋转。
- text：text、font、fontSize（像素）、color、bold、align（left/center/right）、padding（默认0）、fill/lineColor/lineWidth（可选）。正文多段用\n分行，先分配足够高的文本框。
- shape：geometry（如rect、roundRect、ellipse、rightArrow）、fill、lineColor、lineWidth、radius。
- image：path、fit（默认contain，避免拉伸）、alt。每个资产独立嵌入PPT。
- notes：只写教师教学提示/答案或内容来源，不写生成过程、检查日志等制作信息。

表格、原生图表、精确连接线、富文本与动画不在此精简脚本范围内，需要时按正式API扩展或直接创作。不能因为脚本暂不支持就烘焙成图片损害用户要求。

## 构建与检查

```powershell
& <RUNTIME_NODE> <SKILL>/scripts/build_editable_deck.mjs `
  <项目/plan.json> <项目/work/build-v1> `
  --module-root <RUNTIME_NODE_MODULES>

python <SKILL>/scripts/check_editability.py `
  <项目/work/build-v1/candidate.pptx> --manifest <项目/plan.json> `
  --report <项目/work/editability-v1.json>
```

脚本写candidate.pptx和slide-01.png等PPT渲染图，不覆盖已有candidate；选择新构建目录生成新版本。禁止把旧AI效果稿当这些预览。

当前运行时字体设置使用text.style.typeface，并设置presentation.theme.defaultFont；不要误用看似合理但被忽略的fontFamily字段。检查导出的东亚字体声明，不能只看到中文渲染出来就判断字体正确。

完成逐页视觉检查后，用正式finalizer从candidate生成另一条成品路径。finalizer要求的workspaceDir必须包含草稿与最终成品，字体策略按实际选择的中文字体填design，不冒称来自用户或参考。

本Skill的基础构建器可直接配合以下命令，自动调用正式finalizer、保留私有验证报告，并从最终PPTX重新导入渲染逐页预览：

```powershell
& <RUNTIME_NODE> <SKILL>/scripts/finalize_deck.mjs `
  <项目/plan.json> <项目/work/build-v1/candidate.pptx> `
  <项目/outputs/课题-可编辑-v1.pptx> <项目目录> `
  <已安装Presentations技能目录> <RUNTIME_PYTHON> `
  <RUNTIME_NODE_MODULES> <项目/work/final-check-v1>
```

finalize_deck.mjs会为子进程设置所需RUNTIME_NODE_MODULES与RUNTIME_NODE，避免重新导入验证因找不到运行时而失败。若按实际教学加入原生表格、图表或参考模板，需要扩展正式finalizer的对应contracts/字体来源策略，不能沿用基础构建器的空表格要求。存在第三方PPT模板时保留其字体，不使用这个默认design策略强制替换。

卡片、标签和边框按本项目视觉语言与页面需要设计，不沿用旧参考的具体组合。构建器是组装接口，不能作为页面设计或丰富度的上限。

为验证编辑性，在私有测试副本修改plan中一个text值、一个shape坐标、一个image坐标后重新构建；检查新PPT的对应对象确实变化，其余内容保持一致。结构验证只能确认基础原生对象与文本存在，还需要逐页视觉检查。没有PowerPoint界面检查时如实说明。

## 交付目录建议

```text
outputs/课题/
  课题-可编辑-v1.pptx
  previews/slide-01.png ...
  preview-all.jpg
  assets/背景与独立插画.png
  prompts/本次实际提示词.txt
  page-plan.json
  plan.json
  style-spec.md
  assets-manifest.json
  编辑说明.md
```

编辑说明简短指出如何替换图片、修改文本和形状，以及人物绘画内部仍是位图。不要把编辑限制或技术说明放进给学生看的页面。
