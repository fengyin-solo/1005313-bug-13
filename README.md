# 考古发掘现场记录与出土物整理工作台

面向探方发掘进度、地层堆积编录、遗迹单位登记、出土物整理与检测送样的一体化田野考古记录工作台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 探方登记 | `trench` | 探方 | 探方编号、所属发掘区、布方面积 |
| 地层堆积 | `stratum` | 地层堆积 | 层位编号、所属探方、土质 |
| 遗迹单位 | `feature` | 遗迹单位 | 单位编号、遗迹类型、所属探方 |
| 出土物登记 | `find` | 出土物 | 器物编号、出土探方、出土层位 |
| 陶片拼对 | `sherd` | 拼对记录 | 拼对编号、所属单位、陶系 |
| 骨骼标本 | `bone` | 骨骼标本 | 标本编号、出土单位、种属 |
| 浮选样品 | `flotation` | 浮选样品 | 样品编号、采样单位、样品重量 |
| 测年送检 | `dating` | 测年送检单 | 送检编号、样品来源、承接实验室 |
| 测绘控制点 | `survey` | 测绘控制点 | 点位编号、控制等级、北坐标 |
| 影像资料 | `photo` | 影像资料 | 影像编号、拍摄对象、拍摄方向 |
| 发掘日记 | `diary` | 发掘日记 | 日记编号、记录日期、记录人 |
| 用工派工 | `labor` | 出工记录 | 派工编号、作业区域、用工类别 |
| 工具领用 | `tool` | 工具领用单 | 领用单号、领用人、工具名称 |
| 安全巡查 | `safety` | 安全巡查记录 | 巡查编号、巡查区域、巡查类别 |
| 样品封装 | `packing` | 封装记录 | 封装编号、所属单位、封装材料 |
| 标本修复 | `conserve` | 修复单 | 修复单号、修复对象、病害描述 |
| 简报校核 | `briefing` | 发掘简报 | 简报编号、涉及探方、编写人 |
| 探方验收 | `acceptance` | 探方验收单 | 验收单号、验收探方、验收类别 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：清掉浏览器里 `archaeology-field:entries` 这一项，或调用 `resetModule(模块)`。

### 遗迹单位的专项规则

遗迹单位在通用清单之外有专门的详情页（`/feature/:id`）与业务服务
`frontend/src/api/feature-service.ts`，规则如下：

- **编号以入库编号为准**：字段拆为「现场编号」「入库编号」，清单与详情统一取
  `canonicalFeatureCode()`（入库编号优先，缺失时回退现场编号），两处读同一份数据。
- **绘图一次写全**：绘图进度与「开口层位」「现存深度」、编号在同一次提交里原子写入；
  字段没写全会被拒绝，不落记录。绘图记录存在独立键
  `archaeology-field:feature-drawings`，每个遗迹单位只有一条，重复提交按已有记录处理
  （幂等，不另落新条）。
- **历史单位不重算**：已经「已归位」的历史单位沿用归位当时的层位取值，绘图表单拒绝改动，
  迁移逻辑只补编号、不碰其层位/深度。
- **归位结论落验收台账**：登记归位必须具备绘图记录、入库编号、开口层位、现存深度；
  校验不过的那一件单独退回（状态不前进、标记异常），其他件不受影响。无论通过还是退回都在
  `archaeology-field:feature-acceptance-ledger` 留痕，台账在「探方验收」页下方展示。
