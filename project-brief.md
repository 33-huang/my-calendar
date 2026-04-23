# 日历App项目说明

## 项目概述
一个手机端的个人日历App，核心功能是通过自然语言输入（中文/日文）自动识别日期、时间和事项内容，添加到日历中。支持语音输入。

## 线上地址
- **网站**：https://my-calendar-lovat.vercel.app
- **代码仓库**：https://github.com/33-huang/my-calendar
- **本地代码文件夹**：我的 Mac 上的 `my-calendar` 文件夹（新对话时请让 Cowork 打开这个文件夹，你才能直接改代码）

## 文件结构
- **所有业务逻辑都在 `src/App.jsx` 一个文件里**（约 550 行）
- 其他文件（`main.jsx`、`index.css`、`vite.config.js`、`package.json`、`public/` 等）一般不需要改动
- `node_modules/` 已删除（省空间），本地不做预览/测试，推送到 GitHub 后由 Vercel 自动构建

## 技术栈
- **前端**：React + Vite，部署在 Vercel
- **数据库**：Supabase（PostgreSQL），通过 REST API 直接 fetch，不需要安装额外 npm 包
- **Supabase 项目 URL**：https://hveabhjlelojuvxagzyl.supabase.co
- **Supabase key**：硬编码在 `src/App.jsx` 第 5 行（新版 Publishable key，`sb_publishable_` 开头）。这是公开的前端 key，**不是敏感信息，不要删除或改动**。
- **数据库表** `events`：

```sql
CREATE TABLE events (
  id text primary key,
  owner text not null,
  date text not null,
  time text,
  content text,
  done boolean default false,
  created_at timestamptz default now()
);
```

## 当前功能
1. **口令登录**：输入口令绑定数据，不同口令数据隔离，无需注册
2. **自然语言输入**：支持中文和日文，自动解析日期、时间、事项内容（纯前端正则，不调 AI API）
3. **月历视图**：有事项的日期用紫色圆圈标记，全部完成的用浅灰色圆圈
4. **列表视图**：分「待发生」和「已完成」两部分
5. **事项完成打钩**：点击打钩圆圈标记完成，完成的事项从主页隐藏，日历圈变灰
6. **编辑事项**：点编辑按钮弹出底部面板，用自然语言修改，下方实时预览解析结果
7. **删除事项**：在编辑页面底部，灰色「删除此事项」文字，点击后弹出确认
8. **语音输入**：使用浏览器 Web Speech API，手机端可用
9. **左右滑动翻月**：日历区域支持触摸滑动切换上/下月，有滑入动效
10. **中日语言切换**：登录页面可切换，进入后不显示切换按钮
11. **选中日期自动填入**：点击某天后按+添加，输入框自动带上日期
12. **山海插画 banner**：顶部 SVG 插画卡片，默认文字「我们的征途是星辰大海」，文字可点击编辑

## 设计风格
- 粉紫色渐变主题：`#E879A8 → #C084FC → #A78BFA`
- 白色卡片 + 浅灰背景（`#F5F5F5`）
- 事件卡片右侧两个灰色图标：编辑（铅笔）+ 打钩（圆圈）
- 已完成事项：半透明 + 划线 + 紫色打钩
- 所有按钮统一浅灰色（`#C0C0C0`），不用红色
- 日历上已全部完成的日期：浅灰圈（边框 `#EAEAEA`、文字 `#C0C0C0`）
- 底部弹出面板（bottom sheet）交互
- 手机端优化，最大宽度 430px

## 代码风格（重要！AI 修改时请保持一致）
- **单文件、紧凑风格**：所有业务逻辑都集中在 `src/App.jsx` 一个文件里，**不要拆分成多个组件文件**
- **短变量名**：如 `S`（styles）、`LS`（login styles）、`ev`（event）、`eMap`（event map）、`dp`/`tp`（date/time parsers）等
- **工具函数单行写法**：小函数写在一行里，不展开成多行（参考现有的 `addD`、`wk`、`ap`、`ft` 等）
- **内联样式对象**：用 `const S = { ... }` 对象存所有样式，不用 CSS 文件 / CSS module / styled-components
- **不要重构**：除非我明确要求，不要把代码重构成"标准"结构（多文件、组件拆分、引入新库等）

## 更新流程
1. **AI 直接修改 `my-calendar` 文件夹里的文件**（通常是 `src/App.jsx`）
2. **我自己在 VSCode 里推送**：
   - 打开 VSCode（项目已打开在 `my-calendar`）
   - 点左侧「源代码管理」图标（分叉树枝）
   - 看到改动的文件 → 在 Message 框写 commit message → 点 ✓ Commit → 点 Sync Changes
3. **Vercel 自动部署**，约 1 分钟后刷新 https://my-calendar-lovat.vercel.app 就能看到效果
4. Git 身份已经在 `.git/config` 里配置好了（黄珊 / moncar8012@gmail.com），不需要再设置

## 数据库修改方式（如果需要加字段）
1. 打开 Supabase SQL Editor：https://supabase.com/dashboard/project/hveabhjlelojuvxagzyl/sql/new
2. 输入 SQL 语句 → Run（只需运行一次，字段永久生效）
3. 同步更新 App.jsx 里的数据读写逻辑

## 注意事项
- **自然语言解析**是纯前端正则匹配，不花 token、不调 AI API
- **语音功能**在 Claude/Cowork 预览环境里用不了，手机浏览器里正常
- **数据隔离**通过 `owner` 字段实现，owner 就是用户输入的口令明文
- **Supabase 免费版**如果 7 天没活动会自动暂停，去后台点一下 Restore 即可恢复
- 修改代码前建议先说明要改什么、改完是什么效果，再动手，避免大改方向不对
