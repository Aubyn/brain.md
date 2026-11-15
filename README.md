# brain.md

**给编码 Agent 的持久项目记忆** —— 把耐久的决策、约束与背景写成纯 Markdown，**存放在仓库之外**，由一个小巧的零依赖 CLI 负责读写。

brain 不是项目里的一个目录。它按**项目身份**定位，所以同一个项目在任意 checkout、worktree、不同 Agent 和不同机器上共享同一份记忆；没有 git 的项目同样成立。

## 为什么需要 brain

编码 Agent 的知识没有耐久载体。决策背后的理由、你们约定的约束、被放弃的那条路——都留在聊天记录和你的脑子里，会话一结束就消失，下一次从零开始。

brain 把这件事接住：它是项目的持久记忆，把耐久的决策、需求和约束写下来，并在日常开发中持续维护。

- **仓库之外**——不需要提交 `brain/` 目录或协议文件，不污染 diff。
- **按身份寻址**——`git remote` → git common dir → 绝对路径三级回落，新克隆、worktree、在子目录里 `cd` 都落到同一个 store。
- **构造即正确**——所有写入都走 CLI。没有校验器，因为 frontmatter 永远由 CLI 生成，`compiled_truth` 的改写也永远不可能漏掉时间线条目。
- **Agent 无关的 Markdown**——存储本身任何工具都能读；一个技能教会 Pi 如何使用它。

判断什么该写进去：**六个月后它是否仍然重要，并且很难从代码本身还原？** 是，就写进 brain。

## 安装（仅 Pi）

不发布 npm 包。克隆仓库，把技能链接进 Pi：

```sh
git clone <这个仓库> ~/src/brain.md
cd ~/src/brain.md
./setup
```

`./setup` 做两件事：

1. 把 `skills/brain` 软链到 `<agent-dir>/skills/brain`（默认 `~/.pi/agent/skills/brain`）；
2. 在 `<agent-dir>/AGENTS.md` 写入带标记的 brain 指令块，让本机每个 Pi 会话都知道要用它。

只接入 Pi。**不会**往 `~/.claude`、`~/.codex` 或其他 Agent 的配置目录拷任何东西。Pi 的 agent 目录默认是 `~/.pi/agent`，可用 `PI_CODING_AGENT_DIR` 覆盖；写入的指令块会带上对应 CLI 的绝对路径。

```sh
./setup --no-wire      # 只建链接，不动 AGENTS.md
./uninstall            # 只删这条链接和带标记的指令块
```

安装/卸载永远不会碰项目的数据。

## 快速开始

在项目根目录执行（git 仓库里任意子目录也能解析到同一个 store）：

```sh
brain() { node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/brain/bin/brain.mjs" "$@"; }

brain where     # store 路径、身份、来源、页数
brain init      # 不存在时创建 store（幂等）
brain list-pages
```

然后播种知识。让 Agent 按 `brain` 技能的
[`references/bootstrap.md`](skills/brain/references/bootstrap.md) 执行：已有项目会读代码、文档和 `git log` 起草；近乎空白的项目则先访谈你。

## brain 是怎样运行的

### 首次安装与接入

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant S as ./setup
    participant F as 文件系统

    U->>S: 在仓库 checkout 里运行 ./setup
    S->>F: 建软链 &lt;agent-dir&gt;/skills/brain → &lt;checkout&gt;/skills/brain
    Note right of F: 文件系统变化：<br/>新增一个符号链接<br/>仓库本身不被修改

    S->>F: 读取 &lt;agent-dir&gt;/AGENTS.md（缺则创建）
    S->>F: 写入/刷新 BEGIN/END brain.md 标记块
    Note right of F: 只替换标记之间；<br/>标记之外的用户内容原样保留
    Note over U: 用户可见：重启 Pi 后，技能列表里出现 brain

    U->>S: 在项目根目录运行 brain where
    S->>F: 解析 git remote / common dir / 绝对路径
    S-->>U: store 路径 + identity + source
    Note over U: 用户可见：一眼看到这个项目的记忆存在哪里
    U->>S: brain init
    S->>F: 创建 $BRAIN_HOME/&lt;key&gt;/{pages,index.md}
    Note right of F: 幂等：已存在的 store 不会被覆盖
```

### 日常一次会话

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant A as Agent（Pi）
    participant C as brain CLI
    participant P as 项目目录（git 工作区）
    participant S as brain store<br/>$BRAIN_HOME/&lt;key&gt;

    U->>A: 在项目里提出需求 / 继续开发
    Note over A: 新会话，没有上下文
    A->>C: brain where
    C->>P: 读取 git remote / common dir / 路径
    P-->>C: 项目身份
    C-->>A: store 路径（source: git-remote）
    Note right of S: 只读定位，不创建任何文件

    A->>C: brain list-pages
    C->>S: 读 pages/*.md、index.md
    S-->>C: 页面清单（id / 分类 / 条数 / 标题）
    C-->>A: 13 个页面
    Note over U: 用户可见：Agent 主动引用历史结论，不再重开旧话题

    A->>C: brain read-page auth-flow
    C->>S: 读 pages/auth-flow.md
    S-->>C: compiled_truth + timeline
    C-->>A: 当前结论与证据链
    Note over A: 视图/上下文变化：<br/>相关页面进入会话上下文

    U->>A: 讨论中定下一个新决策
    Note over U: 用户可见：Agent 说“我把它记下来”
    A->>C: brain create-page --id ... --category decision
    C->>S: 写 pages/&lt;id&gt;.md（frontmatter + 空结论 + 时间线种子）
    C->>S: 重写 index.md
    C-->>A: created（1 pages）
    Note right of S: 文件系统变化：<br/>新增 pages/&lt;id&gt;.md<br/>index.md 被重建

    A->>C: brain update-truth --id ...（填充/修正结论）
    C->>S: 原子写：替换 compiled_truth + 追加 decision 条目 + 更新 updated
    C->>S: 重写 index.md
    C-->>A: rewritten
    Note right of S: “结论变了”和“为什么变”<br/>在同一次写入中落盘

    opt 页面达到上限（30 条 timeline 或 15 条 decision）
        A->>C: brain append-timeline ...
        C-->>A: 拒绝：30 timeline entries (cap 30)
        Note over U: 用户可见：Agent 说明页面已满，并给出出路
        alt 压缩（推荐）
            A->>C: brain update-truth（合并后的结论，永不拦截）
        else 拆分
            A->>C: brain create-page（新命题）
        else 强制
            A->>C: brain append-timeline --force
        end
    end

    opt 旧结论被取代
        A->>C: brain archive-page --id old --superseded-by new
        C->>S: body 改为指向 [[new]] 的指针，status: archived
        C-->>A: archived
        Note over U: 用户可见：旧页只读，但保留指向新页的线索
    end

    Note over U,S: 会话结束。下一次新会话重复 3–6 步：<br/>记忆不依赖仓库，也不依赖当前目录里有没有 brain/
```

## brain 存在哪里

```
$BRAIN_HOME/<project-key>        # BRAIN_HOME 默认 ~/brain.md
├── index.md                      # brain reindex 生成
├── pages/<page-id>.md            # 增量知识
└── background.md / architecture.md / flow.md / mindmap.md / stack.md / roadmap.md
```

`<project-key>` = `<可读 slug>-<sha256(identity)[0..8]>`，身份按三级回落：

| 级别 | 身份 | `brain where` 的 `source:` |
|---|---|---|
| 1 | 归一化后的 git remote（`git@github.com:o/r.git` → `github.com/o/r`） | `git-remote` |
| 2 | git 绝对 common dir | `git-common-dir` |
| 3 | 项目绝对路径 | `path` |

因此：有 remote 的仓库跨 clone/worktree 共享一个 brain；无 remote 的仓库经 common dir 在 worktree 间共享；没有 git 的目录也能用。`brain where` 永远告诉你解析结果——每个项目只存在一个 store，工具不会偷偷建影子副本。

## 一页一命题

每个页面包含可整体改写的 **compiled_truth**（当前最佳理解）和只追加的 **timeline**（证据与反转）。为防止页面变成垃圾桶，CLI 强制：

- `append-timeline` 在页面已有 **30 条 timeline** 或 **15 条 decision** 时拒绝（`--force` 放行）。出路：拆成新页面，或压缩合并。
- `update-truth` **永不**拦截：改写结论正是把页面重新变小的手段。它总会在同一次原子写入中追加一条 `decision` 条目。
- `archive-page --id X --superseded-by Y` 把 `X` 变成指向 `[[Y]]` 的**只读指针**；之后任何写命令都不接受 `X`。

六个页面分类：`project`、`concept`、`decision`、`person`、`organization`、`reference`。六个固定根页面槽位（`background`、`architecture`、`flow`、`mindmap`、`stack`、`roadmap`）承载项目级知识，按需创建。

## CLI

```sh
brain where                       # 解析后的 store + 身份 + 页数
brain init                        # 创建 store（幂等）
brain list-pages                  # id、分类、状态、条目数、决策数、标题
brain read-page <id>              # 输出 pages/<id>.md
brain read-root <slug>            # 输出 <slug>.md

brain create-page --id my-decision --category decision --title "Use X over Y" \
  --summary "为什么需要这一页"
echo "新的理解" | brain update-truth --id my-decision --summary "为什么变了"
brain append-timeline --id my-decision --kind evidence --summary "基准测试确认了它"
brain archive-page --id old-decision --superseded-by new-decision --reason "被新方案取代"
printf '# 系统架构\n\n请求先经过网关。\n' | brain update-root architecture

brain reindex && brain lint-links
brain setup | brain uninstall | brain wire      # 机器级，仅 Pi
```

`--summary` 用用户的工作语言书写。省略时，`create-page` 记录标题，`update-truth` 记录新结论的第一行可用文本——CLI 从不自己编一句话，也从不改写已存的时间线条目。

## 技能结构

Agent 侧的一切以一个技能交付，每个流程一份 reference：

| 文件 | 内容 |
|---|---|
| [`skills/brain/SKILL.md`](skills/brain/SKILL.md) | 路由 + 不可协商的规则 |
| [`references/protocol.md`](skills/brain/references/protocol.md) | 存储、身份、页模型、上限、命令契约 |
| [`references/pages.md`](skills/brain/references/pages.md) | 分类、id、每个写命令的参数 |
| [`references/setup.md`](skills/brain/references/setup.md) | 安装、wiring、环境变量、迁移 |
| [`references/bootstrap.md`](skills/brain/references/bootstrap.md) | 从代码/文档/历史或访谈播种 |
| [`references/ingest.md`](skills/brain/references/ingest.md) | 把对话或文档消化成页面 |

CLI 在 `skills/brain/bin/`，库代码在 `skills/brain/lib/`，测试在 `skills/brain/test/`。

## 从旧的仓库内 brain 迁移

刻意**不提供**对 `brain/**` 目录、`BRAIN.md` 文件或 `.mindmux/preferences.json` 的兼容层。若想保留旧内容，让 Agent 逐页迁移：读旧文件，用 `brain create-page` / `update-truth` 写入新 store。内容可以保留，但 CLI 不会永远背着历史代码。

## 环境变量

| 变量 | 默认值 | 含义 |
|---|---|---|
| `BRAIN_HOME` | `~/brain.md` | 所有项目 store 的根目录 |
| `PI_CODING_AGENT_DIR` | `~/.pi/agent` | Pi agent 目录（含 `skills/` 与 `AGENTS.md`） |

## 开发

```sh
node --test skills/brain/test/*.test.mjs
```

## 许可证

Apache-2.0，见 [LICENSE](LICENSE)。
