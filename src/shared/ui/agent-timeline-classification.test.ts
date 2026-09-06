import { describe, expect, it } from 'vitest';

import type { AgentConversationMessage } from '../task-events';
import {
  classifyAgentConversation,
  publicAgentReply,
  sanitizeRuntimeText,
  summarizeRuntimeLog,
} from './agent-timeline-classification';

// Public prose fixtures use the explicit assistant channel. Raw Hermes terminal
// cases below pass their kind deliberately; it is not a public channel by default.
const message = (seq: number, content: string, kind = 'assistant'): AgentConversationMessage => ({
  seq,
  content,
  kind,
});

describe('agent conversation classification', () => {
  it('keeps real system records and typed command output with product branding', () => {
    const entries = classifyAgentConversation([
      message(1, '已加载 13 份招标材料，开始核验图片。', 'system'),
      message(2, 'Resumed session Hermes Agent\n文件核验完成：173 张图片。', 'system'),
      message(3, 'command: 检查 /data/hermes/work/report.docx\n检测到 43 页。', 'command'),
    ]);
    const output = entries.map((entry) => entry.content).join('\n');
    expect(entries.every((entry) => entry.kind === 'log')).toBe(true);
    expect(output).toContain('已加载 13 份招标材料');
    expect(output).toContain('173 张图片');
    expect(output).toContain('检测到 43 页');
    expect(output).toContain('[工作目录]/work/report.docx');
    expect(output).not.toMatch(/hermes|内部详情已隐藏/i);
  });

  it.each([
    ['user', 'user'],
    ['customer', 'user'],
    ['error', 'error'],
    ['failure', 'error'],
    ['question', 'interaction'],
    ['action', 'interaction'],
    ['final', 'agent'],
    ['assistant_final', 'agent'],
  ])('honors explicit %s public messages after an earlier private frame', (kind, expectedKind) => {
    const content = '请确认材料是否完整。';
    const entries = classifyAgentConversation([
      message(1, '┌─ Reasoning\n'),
      message(2, content, kind),
    ]);

    expect(entries.at(-1)).toMatchObject({ content, kind: expectedKind, sequence: 2 });
  });

  it('defaults known system, process, and tool kinds to collapsed logs', () => {
    const kinds = [
      'system', 'service', 'reasoning', 'analysis', 'command', 'tool',
      'tool_call', 'tool_result', 'stdout', 'stderr', 'progress', 'debug',
    ];
    const entries = classifyAgentConversation(kinds.map((kind, index) => (
      message(index + 1, '公开运行过程记录', kind)
    )));

    expect(entries).toHaveLength(kinds.length);
    expect(entries.every((entry) => entry.kind === 'log')).toBe(true);
  });

  it('tracks a Reasoning terminal frame across adjacent sequence fragments', () => {
    const entries = classifyAgentConversation([
      message(1, '┌─ Reasoning\n'),
      message(2, '这段过程文字没有重复的框线或标题。\n'),
      message(3, '    继续检查运行计划。\n└────────\n'),
      message(4, '材料已经核对完毕，可以查看成果。'),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(['log', 'log', 'log', 'agent']);
    expect(entries[1].content).toBe('运行分析（内部详情已隐藏）');
  });

  it('resets unclosed Reasoning at the live Hermes reply header without exposing subsequent commands', () => {
    const status = '两个装订 agent 又被截断（技术卷 interrupted、商务卷 50 轮截断但素材 173 图已备好+脚本就绪）。改为主会话直接跑脚本（长跑执行不耗 LLM 轮次）。先查两边实际状态：';
    const source = [
      message(301, '╭─ Reasoning ────────────────────╮\n'),
      message(302, '复核装订进程与脚本执行策略。\n'),
      // The live stream switches headings without a closing Reasoning border.
      message(303, '╭─ ⚕ Hermes ───────────────────╮\n'),
      message(304, 'Preparing terminal…\n'),
      message(305, '💻 timeout 1800s\n$ python assemble.py\n'),
      message(306, "g['pics'] for g in pg; json.dump(plan_map, open('/data/hermes/work/plan.json', 'w'))\n"),
      message(307, status),
    ];
    const entries = classifyAgentConversation(source);

    expect(entries.map((entry) => entry.kind)).toEqual([
      'log', 'log', 'log', 'log', 'log', 'log', 'agent',
    ]);
    expect(entries.at(-1)).toMatchObject({ content: status, kind: 'agent' });
    expect(entries.map((entry) => entry.content).join('')).not.toContain('复核装订进程与脚本执行策略');
    expect(entries.map((entry) => entry.content).join('')).not.toContain('assemble.py');
  });

  it('classifies public Hermes frame bodies without treating their side borders as system output', () => {
    const source = [
      message(1, '╭─ ⚕ Hermes ───╮\n'),
      message(2, '│ 核验结论：文件完整。 │\n'),
      message(3, '│ 请确认报价版本。 │\n'),
      message(4, '│ 两个装订任务已由主会话继续处理。 │\n'),
    ];
    const entries = classifyAgentConversation(source);

    expect(entries.map((entry) => entry.kind)).toEqual(['log', 'agent', 'agent', 'agent']);
    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content)).toEqual([
      '核验结论：文件完整。\n', '请确认报价版本。\n', '两个装订任务已由主会话继续处理。\n',
    ]);
  });

  it('recognizes a Hermes header whose medical symbol includes a variation selector', () => {
    const entries = classifyAgentConversation([
      message(1, '┌─ Reasoning\n'),
      message(2, '分析过程。\n'),
      message(3, '╭─ ⚕️ Hermes ───╮\n'),
      message(4, '两个装订 agent 又被截断，改为主会话继续处理。'),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(['log', 'log', 'log', 'agent']);
  });

  it('recognizes a public Hermes header split between adjacent stream records', () => {
    const source = [
      message(1, '┌─ Reasoning\n'),
      message(2, '分析过程。\n'),
      message(3, '╭─ ⚕ Her'),
      message(4, 'mes ───╮\n'),
      message(5, '两个装订 agent 又被截断，改为主会话继续处理。'),
    ];
    const entries = classifyAgentConversation(source);

    expect(entries.map((entry) => entry.kind)).toEqual(['log', 'log', 'log', 'log', 'agent']);
    expect(entries.at(-1)?.content).toBe(source.at(-1)?.content);
    expect(entries.map((entry) => entry.content).join('')).not.toContain('分析过程。');
  });

  it('tracks Chinese analysis, runtime, and execution headings until their closing border', () => {
    for (const heading of ['分析', '运行', '执行']) {
      const entries = classifyAgentConversation([
        message(1, `╭─ ${heading} ───╮\n`),
        message(2, '这段仍是内部过程。\n'),
        message(3, '╰──────────╯\n'),
        message(4, '本轮报价文件已核对完成。'),
      ]);

      expect(entries.map((entry) => entry.kind)).toEqual(['log', 'log', 'log', 'agent']);
    }
  });

  it.each([
    '╔═════════════════════════════════╗',
    '╚═════════════════════════════════╝',
  ])('discards pure console decoration rather than inventing a runtime record: %s', (content) => {
    expect(classifyAgentConversation([message(1, content)]))
      .toEqual([expect.objectContaining({ content: expect.stringContaining('内部详情已隐藏'), kind: 'log' })]);
  });

  it.each([
    '║       HERMES AGENT              ║',
    '║ Session ready                  ║',
    'MCP Servers: bidvolt connected',
    '[0m MCP Servers: bidvolt connected',
    '● [ASYNC DELEGATION BATCH COMPLETE] 2 tasks finished',
    'A background fan-out of 2 subagent(s) you dispatched earlier has finished.',
    'Act on these or re-dispatch if things have changed.',
    '↪ Resumed session 20260905_sample',
    '┊ 💻 preparing terminal…',
  ])('retains real startup and delegation console status as inspectable logs: %s', (content) => {
    const entries = classifyAgentConversation([message(1, content)]);

    const expected = content.replace(/^[│┃┊║]\s?/u, '').replace(/\s*[│┃║]$/u, '').replace(/Hermes(?: Agent)?/giu, 'BidVolt');
    expect(entries).toEqual([expect.objectContaining({ content: expected, kind: 'log' })]);
    expect(publicAgentReply(content)).toBe('');
  });

  it.each(['hermes', 'system', 'service'])('restores screenshot lifecycle logs carried by %s', (kind) => {
    const entries = classifyAgentConversation([
      message(1, '↪ Resumed session sample-session', kind),
      message(2, 'A background fan-out of 2 subagents finished', kind),
      message(3, 'Preparing terminal…', kind),
    ]);
    expect(entries.map((entry) => entry.content)).toEqual([
      '↪ Resumed session sample-session',
      'A background fan-out of 2 subagents finished',
      'Preparing terminal…',
    ]);
    expect(entries.every((entry) => entry.kind === 'log')).toBe(true);
    expect(entries.map((entry) => summarizeRuntimeLog(entry.content))).toEqual(['任务调度', '任务调度', '系统记录']);
  });

  it.each(['Terminal', 'Tool', '运行', '执行'])('keeps %s frames inspectable without exposing nested Reasoning', (heading) => {
    const entries = classifyAgentConversation([
      message(1, `╭─ ${heading} ─╮\n│ $ python verify.py │\n`, 'hermes'),
      message(2, '│ 图片核验完成：173 张。 │\n╰──╯', 'hermes'),
      message(3, '│ ┌─ Reasoning │\n│ 内部判断过程应继续隐藏。 │', 'hermes'),
      message(4, 'Final answer: 核验完成，请查看成果。', 'hermes'),
    ]);
    const content = entries.map((entry) => entry.content).join('\n');
    expect(content).toContain('$ python verify.py');
    expect(content).toContain('图片核验完成：173 张。');
    expect(content).not.toContain('内部判断过程');
    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content))
      .toEqual(['核验完成，请查看成果。']);
  });

  it('sanitizes product identifiers in inspectable runtime data', () => {
    const entries = classifyAgentConversation([
      message(1, 'Resumed session Hermes Agent; hermes_cli; /data/hermes/work/result.docx', 'hermes'),
    ]);
    expect(entries[0].content).toContain('BidVolt');
    expect(entries[0].content).toContain('[工作目录]/work/result.docx');
    expect(JSON.stringify(entries)).not.toMatch(/hermes/i);
  });

  it('does not let a restored lifecycle record expose following unbounded terminal text as a reply', () => {
    const entries = classifyAgentConversation([
      message(1, '╭─ ⚕ Hermes ──╮\n│ 材料已就绪。 │', 'hermes'),
      message(2, '↪ Resumed session sample-session', 'hermes'),
      message(3, '终端中的未标记续段。', 'hermes'),
    ]);
    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content)).toEqual(['材料已就绪。']);
    expect(entries.find((entry) => entry.sequence === 2)?.content).toBe('↪ Resumed session sample-session');
    expect(JSON.stringify(entries)).not.toContain('未标记续段');
  });

  it('folds terminal diff omission notices without hiding surrounding status messages', () => {
    const omitted = '… omitted 69 diff line(s) across 3 file(s)';
    const entries = classifyAgentConversation([
      message(1, '补充文件正在校验。\n'),
      message(2, omitted),
      message(3, '正文与图片已经完成复核。'),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(['agent', 'log', 'agent']);
    expect(entries[1].content).not.toContain(omitted);
  });

  it('folds Chinese string-literal tails containing multiple clear Python constructs', () => {
    const content = "论','原件为准'] hits = [] for i, p in enumerate(paras): ... print(t)";
    const entries = classifyAgentConversation([
      message(1, '正在核对原件与正文。\n'),
      message(2, content),
      message(3, '需要您确认最终报价口径。'),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(['agent', 'log', 'agent']);
    expect(entries[1].content).not.toContain(content);
  });

  it('does not fold Chinese source-text discussion for mentioning only one Python expression', () => {
    const content = "论','原件为准'] 只是原文片段，不能因为提到 print(t) 就隐藏。";

    expect(classifyAgentConversation([message(1, content)]))
      .toEqual([expect.objectContaining({ content, kind: 'agent' })]);
  });

  it.each([
    'ist):',
    "g['pics'] for g in pg; json.dump(plan_map, open('/data/hermes/work/plan.json', 'w'))",
    ':") for k in required_keys]',
    "f and '合同' in f: print(f[:80]) + 2 commands (0.0s)",
    '+ 2 commands (0.0s)',
  ])('folds recognizable code-tail fragments even when Hermes is the backend kind: %s', (content) => {
    const entries = classifyAgentConversation([message(1, content)]);

    expect(entries).toEqual([expect.objectContaining({ content: expect.stringContaining('内部详情已隐藏'), kind: 'log' })]);
  });

  it('tracks code fences across fragments and resumes prose after the closing fence', () => {
    const entries = classifyAgentConversation([
      message(1, '```python\n'),
      message(2, '    label = "需要你确认"\n'),
      message(3, '    output += label\n'),
      message(4, '```\n核验结论：三个文件已生成。'),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(['log', 'log', 'log', 'log', 'agent']);
    expect(entries.at(-1)?.content).toBe('核验结论：三个文件已生成。');
  });

  it('sorts sequence records before tracking terminal structure', () => {
    const entries = classifyAgentConversation([
      message(4, '文件准备好了。'),
      message(2, '没有标题的过程片段。\n'),
      message(1, '┌─ Reasoning\n'),
      message(3, '└────────\n'),
    ]);

    expect(entries.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4]);
    expect(entries.map((entry) => entry.kind)).toEqual(['log', 'log', 'log', 'agent']);
  });

  it.each(['┌─ Reasoning\n', '```python\n'])('keeps unclosed private blocks hidden across sequence gaps: %s', (opener) => {
    const entries = classifyAgentConversation([
      message(11, opener),
      message(13, '这条说明属于后续独立事件。'),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(['log', 'log']);
    expect(entries.map((entry) => entry.content).join('')).not.toContain('后续独立事件');
  });

  it('resets the process context after an explicit user message', () => {
    const entries = classifyAgentConversation([
      message(1, '```python\n'),
      message(2, '先给我确认缺少哪些文件。', 'user'),
      message(3, '本轮缺少盖章附件。'),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(['log', 'user', 'agent']);
  });

  it.each([
    '核验结论：json.dump 的编码问题已经修正，成果可正常打开。',
    '请确认：/data/hermes/work/result.docx 是否为本轮交付文件？',
    '本次缺图的原因是 json.dump 写入了错误映射，不是原件缺失。',
    '最终结果已保存在 /data/hermes/work/result.docx，请查看左侧成果文件。',
  ])('does not hide a meaningful conclusion merely for mentioning code or a path: %s', (content) => {
    expect(classifyAgentConversation([message(1, content)])).toEqual([
      expect.objectContaining({ content: content.replace('/data/hermes/', '[工作目录]/'), kind: 'agent' }),
    ]);
  });

  it('keeps the interrupted-assembly status from the screenshot visible as Agent output', () => {
    const content = '两个装订 agent 又被截断（技术卷 interrupted、商务卷 50 轮截断但素材 173 图已备好+脚本就绪）。改为主会话直接跑脚本（长跑执行不耗 LLM 轮次）。先查两边实际状态：';

    expect(classifyAgentConversation([message(1, content)])).toEqual([
      expect.objectContaining({ content, kind: 'agent' }),
    ]);
  });

  it('keeps public prose in order and replaces mixed commands with safe summaries', () => {
    const content = '核验结论：文件齐全。\n\n$ python validate.py\n    result = inspect_document()\n\n请确认报价采用哪个版本？\n';
    const entries = classifyAgentConversation([message(18, content)]);

    expect(entries.map((entry) => entry.kind)).toEqual(['agent', 'log', 'agent']);
    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content).join(''))
      .toBe('核验结论：文件齐全。\n\n请确认报价采用哪个版本？\n');
    expect(entries.map((entry) => entry.content).join('')).not.toContain('validate.py');
    expect(entries.every((entry) => entry.sequence === 18)).toBe(true);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });

  it('retains English word boundaries but not code hidden in adjacent fragments', () => {
    const source = [
      message(1, 'Review '),
      message(2, 'completed.\n\n'),
      message(3, '```python\n'),
      message(4, '\tif ready:\n    print("ok")\n'),
      message(5, '```\n'),
    ];
    const entries = classifyAgentConversation(source);

    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content).join(''))
      .toBe('Review completed.\n\n');
    expect(entries.find((entry) => entry.sequence === 4)?.content)
      .toContain('内部详情已隐藏');
  });

  it('preserves a whitespace-only fragment between English words', () => {
    const entries = classifyAgentConversation([
      message(1, 'Review'),
      message(2, ' '),
      message(3, 'completed.'),
    ]);

    expect(entries.map((entry) => entry.content).join('')).toBe('Review completed.');
  });

  it('does not assume an unfamiliar backend kind is public prose', () => {
    const content = '报价口径已核对，接下来等待您的确认。';

    expect(classifyAgentConversation([message(1, content, 'future_backend_kind')]))
      .toEqual([expect.objectContaining({ content: '系统记录（内部详情已隐藏）', kind: 'log' })]);
  });

  it('retains separate inspectable tool results rather than replacing them with categories', () => {
    const first = '$ python validate.py\n检查失败：缺少图片。\n';
    const second = '$ python validate.py\n检查完成：图片齐全。\n';
    const entries = classifyAgentConversation([
      message(1, first, 'tool_result'),
      message(2, second, 'tool_result'),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.content).join('')).toContain('检查失败');
    expect(entries.map((entry) => entry.content).join('')).toContain('检查完成');
    expect(entries.every((entry) => entry.kind === 'log')).toBe(true);
  });
});

describe('runtime presentation helpers', () => {
  it('restores real Hermes history replies across terminal preparation and spinner overlays', () => {
    const entries = classifyAgentConversation([
      message(96, '╭─ ⚕ Hermes ─────────────────╮', 'hermes'),
      message(97, '┊ 💻 preparing terminal…', 'hermes'),
      message(98, '364██36', 'hermes'),
      message(99, '两个装订 agent 又被截断。主会话接手收尾。', 'hermes'),
      message(100, '⚡ preparing mcp__bidvolt__inspect', 'hermes'),
      message(101, '无法识别的工具续段', 'hermes'),
    ]);
    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content))
      .toEqual(['两个装订 agent 又被截断。主会话接手收尾。']);
    expect(JSON.stringify(entries)).not.toContain('无法识别的工具续段');
  });

  it('keeps public reply framing across interleaved command badges, using the product name only', () => {
    const entries = classifyAgentConversation([
      message(113, '╭─ ⚕ Hermes ─────╮', 'hermes'),
      message(114, '┊ 💻 preparing terminal…', 'hermes'),
      message(115, '💻 ls render_assets.py + 6 commands (0.0s)', 'hermes'),
      message(116, 'Hermes 已完成证据图渲染。', 'hermes'),
    ]);
    expect(entries.at(-1)).toMatchObject({kind: 'agent', content: 'BidVolt 已完成证据图渲染。'});
    expect(JSON.stringify(entries)).not.toMatch(/hermes/i);
  });

  it('restores replay summary replies with wrapped continuation lines and removes inline tool badges', () => {
    const entries = classifyAgentConversation([
      message(34, '│   ◆ Hermes: 拼装批次完整回执确认。 │\n│ 等待最后一份材料。 │\n', 'hermes'),
      message(38, '│   ◆ Hermes: 扩容完成。 [1 tool call: terminal] │', 'hermes'),
      message(39, '┌─ Reasoning\n内部推理不展示。', 'hermes'),
    ]);
    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content).join(''))
      .toBe('拼装批次完整回执确认。\n等待最后一份材料。\n扩容完成。\n');
    expect(JSON.stringify(entries)).not.toContain('内部推理不展示');
    expect(JSON.stringify(entries)).not.toContain('tool call: terminal');
  });

  it('retains ordinary typed logs while removing nested reasoning before disclosure', () => {
    const entries = classifyAgentConversation([
      message(1, '读取材料完成。\n<analysis>不要显示这个过程。</analysis>\n最终答复：材料已就绪。', 'tool_result'),
    ]);
    expect(JSON.stringify(entries)).toContain('读取材料完成');
    expect(JSON.stringify(entries)).not.toContain('不要显示这个过程');
    expect(entries.some((entry) => entry.kind === 'agent' && entry.content.includes('材料已就绪'))).toBe(true);
  });

  it('does not turn replayed system prompts or wrapped tool badges into Agent replies', () => {
    const entries = classifyAgentConversation([
      message(1, '│ ◆ Hermes: 正常历史回复。 │', 'hermes'),
      message(2, '│ ● You: （系统提示）请继续推进流程。 │', 'hermes'),
      message(3, '│ 系统提示续行。 │', 'hermes'),
      message(4, '│ ◆ Hermes: 下一条回复。 [1 tool call: │', 'hermes'),
      message(5, '│ terminal] │', 'hermes'),
    ]);
    const replies = entries.filter((x) => x.kind === 'agent').map((x) => x.content).join('');
    expect(replies).toBe('正常历史回复。\n下一条回复。\n');
    expect(replies).not.toContain('系统提示');
    expect(replies).not.toContain('terminal');
  });

  it('keeps orphan Hermes prose private even when it reads like a friendly final answer', () => {
    const entries = classifyAgentConversation([
      message(42, '用户没有明确任务，我先分析下一步。', 'hermes'),
      message(43, '😄 收到，哈哈+1。我继续待命，有需要随时说。', 'hermes'),
    ]);
    expect(entries.every((entry) => entry.kind === 'log')).toBe(true);
    expect(JSON.stringify(entries)).not.toContain('哈哈+1');
    expect(JSON.stringify(entries)).not.toContain('下一步');
  });

  it('opens raw Hermes prose only at a public frame and closes that trust at tool output', () => {
    const entries = classifyAgentConversation([
      message(1, '孤立的历史终端文本。', 'hermes'),
      message(2, '╭─ ⚕ Hermes ──╮\n', 'hermes'),
      message(3, '│ 已检查材料。 │\n', 'hermes'),
      message(4, '⚡ preparing mcp__bidvolt__inspect', 'hermes'),
      message(5, '工具返回中的普通中文，不是明确公答。', 'hermes'),
      message(6, '最终答复：请补充盖章附件。', 'hermes'),
      message(7, '╰────╯', 'hermes'),
      message(8, '框外无边界片段。', 'hermes'),
    ]);
    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content))
      .toEqual(['已检查材料。\n', '请补充盖章附件。']);
    expect(JSON.stringify(entries)).not.toContain('工具返回中的');
    expect(JSON.stringify(entries)).not.toContain('框外无边界');
  });

  it.each([
    `}') break print("\\n=== 表格残留 ===") tc = 0 for tb in doc.tables: for row in tb.rows: ... ( 0.0s)`,
    `xml) media = [n for n in z.namelist() if n.startswith('word/media/')] heads = re.findall(...) print('文件大小:', os.path.getsize(p)//1024, 'KB')`,
    '( •_•)>⌐■-■ deliberating...',
    '⚡ preparing mcp__bidvolt__upload_deliverable_file…⚡ mcp__bidvolt__upload_deliverable_file ( 0.0s)技术卷 32.7MB...',
  ])('folds unframed terminal tool/syntax fragments from live history: %s', (content) => {
    const entries = classifyAgentConversation(Array.from({ length: 6 }, (_, index) => message(index + 1, content)));
    expect(entries.every((entry) => entry.kind === 'log')).toBe(true);
    expect(JSON.stringify(entries)).not.toContain(content);
  });

  it.each([
    '+ """占位文本 -> plan keys。"""',
    '+ out.append(k)',
    '+ # 人员社保占位 asset3137-3148',
    '+ else:',
    '+ p.add_run(new_text)',
    '+ anchor_p._p.addnext(new_p_el)',
    '+ run.add_picture(img_path, width=Cm(width_cm))',
    "+ ('fig01_系统总体架构图.png', ['总体架构图']),",
    '+ continue',
  ])('hides the live-browser diff fragment without requiring an earlier header: %s', (content) => {
    const entries = classifyAgentConversation([message(1, content)]);
    expect(entries.every((entry) => entry.kind === 'log')).toBe(true);
    expect(JSON.stringify(entries)).not.toContain(content);
  });

  it('tracks diff context and wrapped strings across records until a public Hermes frame', () => {
    const entries = classifyAgentConversation([
      message(1, 'diff --git a/patch.py b/patch.py\n@@ -1 +1 @@\n'),
      message(2, '+ out.append(k)\n'),
      message(3, '这是被折行的代码字符串，不是公开的答复。\n'),
      message(6, "+ ('fig01_系统总体架构图.png', ['总体架构图']),\n"),
      message(7, '╭─ ⚕ Hermes ──╮\n│ 文件已完成图片校验。 │\n╰──╯'),
    ]);
    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content)).toEqual(['文件已完成图片校验。\n']);
    expect(JSON.stringify(entries)).not.toContain('折行的代码字符串');
    expect(JSON.stringify(entries)).not.toContain('out.append');
  });

  it('recognizes apply_patch completion and preserves ordinary public bullet lists', () => {
    const source = '*** Begin Patch\n*** Update File: plan.py\n+ out.append(k)\n 上下文代码\n*** End Patch\n核验已完成。\n+ 请核对签章\n+ 如需调整，请说明';
    expect(publicAgentReply(source)).toBe('核验已完成。\n+ 请核对签章\n+ 如需调整，请说明');
  });

  it('hides code fences and nested private headings inside a public terminal frame', () => {
    const entries = classifyAgentConversation([
      message(1, '╭─ ⚕ Hermes ──╮\n│ ```python │\n'),
      message(2, '│ print("private") │\n│ ``` │\n'),
      message(3, '│ ┌─ Reasoning │\n'),
      message(4, '我在考虑内部实现细节。'),
      message(5, '公开结论。', 'assistant_final'),
    ]);
    expect(entries.filter((entry) => entry.kind === 'agent').map((entry) => entry.content)).toEqual(['公开结论。']);
    expect(JSON.stringify(entries)).not.toContain('内部实现细节');
  });

  it.each(['运行分析', '工具调用', '任务调度', '命令与执行', '系统记录'])('keeps an already sanitized %s category stable', (category) => {
    expect(summarizeRuntimeLog(`${category}（内部详情已隐藏）`)).toBe(category);
  });
  it('never exposes the screenshot transcript when the private/public boundary is missing', () => {
    const privateParagraph = '用户一直发「哈哈」。没有任务。我应该极简回应，不要每次都展开。也许简短回应甚至不再追问。';
    const screenshot = `┌─ Reasoning\n${'─'.repeat(80)}\n${'─'.repeat(80)}┐\n${privateParagraph}\n${privateParagraph}\n😄 收到，哈哈+1。我继续待命，有需要随时说。\n↪ Resumed session 20260905 (26 user messages, 494 total messages)`;
    expect(publicAgentReply(screenshot)).toBe('');
    const result = classifyAgentConversation([message(1, screenshot)]);
    expect(result.every((part) => part.kind === 'log')).toBe(true);
    expect(JSON.stringify(result)).not.toContain(privateParagraph);
    expect(JSON.stringify(result)).not.toContain('Resumed session');
    // No heuristic based on emoji, the last sentence, or the session footer.
    expect(JSON.stringify(result)).not.toContain('哈哈+1');
  });

  it.each([
    '<think>内部私有段落，不能公开。</think>收到，继续核对。',
    '┌─ Reasoning\n内部私有段落，不能公开。\n╭─ ⚕️ Hermes ──╮\n│ 收到，继续核对。 │\n╰────╯\n↪ Resumed session private-id',
    'Reasoning: 内部私有段落，不能公开。\nFinal answer: 收到，继续核对。',
    '<analysis>内部私有段落，不能公开。</analysis><final>收到，继续核对。</final>',
  ])('extracts an explicitly bounded public HTTP reply: %s', (content) => {
    expect(publicAgentReply(content)).toBe('收到，继续核对。');
  });

  it('hides repeated private paragraphs outside the closed box but preserves the public answer', () => {
    const thought = '我应该先决定如何处理这个请求，内部计划不能公开。';
    const entries = classifyAgentConversation([
      message(1, `┌─ Reasoning\n${thought}\n└────\n${thought}\n`),
      message(2, '最终答复：已经收到您的信息。'),
    ]);
    expect(entries.filter((part) => part.kind === 'agent').map((part) => part.content)).toEqual(['已经收到您的信息。']);
    expect(JSON.stringify(entries)).not.toContain(thought);
  });

  it.each(['hermes', 'final'])('keeps streamed %s reasoning closed across event gaps and exposes a later final boundary', (kind) => {
    const result = classifyAgentConversation([
      message(1, '┌─ Reasoning\n', kind),
      message(9, '内部推理，断流不能变成公开回复。\n', kind),
      message(10, 'Final answer: 文件已完成。', kind),
    ]);
    expect(result.map((part) => part.kind)).toEqual(['log', 'log', 'agent']);
    expect(JSON.stringify(result)).not.toContain('断流不能变成公开回复');
    expect(result.at(-1)?.content).toBe('文件已完成。');
  });

  it('carries an open typed reasoning frame into untyped stream continuations', () => {
    const result = classifyAgentConversation([
      message(1, '┌─ Reasoning\n内部计划。', 'reasoning'),
      message(2, '没有边框的私有续段。', 'hermes'),
      message(3, '公开最终答复。', 'assistant_final'),
    ]);
    expect(result.map((part) => part.kind)).toEqual(['log', 'log', 'agent']);
    expect(JSON.stringify(result)).not.toContain('私有续段');
  });

  it('preserves user-authored terminal examples without treating them as Agent output', () => {
    const content = '┌─ Reasoning\n请帮我检查这个日志示例\n$ node test';
    expect(classifyAgentConversation([message(1, content, 'user')]))
      .toEqual([expect.objectContaining({ content, kind: 'user' })]);
  });

  it('keeps terminal operation badges and truncated function tails out of public replies', () => {
    const entries = classifyAgentConversation([
      message(1, '╭─ ⚕ Hermes ─────╮'),
      message(2, '┊ review diff'),
      message(3, "strip()[:100])) print('元语言/问题段数:', len(hits)) for i, wf, t in hits[:45]: print(t)"),
      message(4, '技术卷装配成功，现有成果可继续查看。'),
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(['log', 'log', 'log', 'agent']);
  });

  it('removes terminal control sequences without trimming meaningful whitespace', () => {
    const escape = String.fromCharCode(27);
    const bell = String.fromCharCode(7);
    const input = `  ${escape}[32mReview ${escape}[0m\r\n\t  complete${bell}  `;

    expect(sanitizeRuntimeText(input)).toBe('  Review \r\n\t  complete  ');
  });

  it('drops terminal sizing diagnostics while preserving ordinary progress, replies and user quotations', () => {
    const result = classifyAgentConversation([
      { seq: 1, kind: 'system', content: 'Window too small...\n正在整理商务文件。' },
      { seq: 2, kind: 'final', content: 'Window too small...\n已完成，请查看成果。' },
      { seq: 3, kind: 'user', content: 'Window too small...' },
    ]);
    expect(result.filter((part) => part.kind !== 'user').map((part) => part.content).join('\n')).not.toContain('Window too small');
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'log', content: '正在整理商务文件。' }),
      expect.objectContaining({ kind: 'agent', content: '已完成，请查看成果。' }),
      expect.objectContaining({ kind: 'user', content: 'Window too small...' }),
    ]));
  });

  it.each([
    ['┌─ Reasoning\n内部运行片段', '运行分析'],
    ['tool_call: fetch material', '工具调用'],
    ['A background fan-out of 2 subagents finished', '任务调度'],
    ['$ python build.py', '命令与执行'],
    ['常规进度检查', '系统记录'],
  ])('summarizes logs as a category rather than leaking raw snippets: %s', (content, summary) => {
    expect(summarizeRuntimeLog(content)).toBe(summary);
    expect(summarizeRuntimeLog(content)).not.toContain(content);
  });
});
