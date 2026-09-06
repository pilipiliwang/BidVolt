import type { AgentConversationMessage } from '../task-events';

export type AgentTimelineMessageKind = 'agent' | 'error' | 'interaction' | 'log' | 'user';

const logKinds = new Set([
  'command', 'debug', 'execution', 'log', 'progress', 'reasoning', 'runtime',
  'service', 'shell', 'status', 'stderr', 'stdout', 'system', 'tool', 'tool_call',
  'tool_result', 'trace', 'analysis',
]);
const userKinds = new Set(['customer', 'human', 'operator', 'user']);
const errorKinds = new Set(['error', 'exception', 'failure', 'fatal']);
const interactionKinds = new Set(['action', 'ask', 'interaction', 'prompt', 'question']);
const finalKinds = new Set(['assistant', 'final', 'answer', 'result', 'assistant_final']);

const ansiEscapeSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

// Keep whitespace: SSE records may be fragments of a sentence or indented code.
export function sanitizeRuntimeText(content: string) {
  return Array.from(content.replace(ansiEscapeSequence, ''), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
      ? '' : character;
  }).join('').replace(/�+/g, '');
}

const terminalDecoration = /^[\s┌┐└┘├┤┬┴┼┊│┃║╭╮╰╯─━█╔╗╚╝╠╣╦╩╬═]+$/u;
const terminalHeader = /^\s*[┌╭╔][─━═\s]*(?:(?:reasoning|analysis|thinking)\b|运行分析|内部分析|推理过程|分析)/iu;
const operationHeader = /^\s*[┌╭╔][─━═\s]*(?:(?:terminal|tool|command|execution|runtime)\b|运行|执行)/iu;
// The live Hermes terminal opens this frame for public replies; it does not
// always emit a closing Reasoning border before switching to the reply.
const assistantHeader = /^\s*[╭┌╔][─━═\s]*(?:⚕\uFE0F?\s*)?Hermes(?:\s+[─━═]|\s*$)/iu;
const replayAssistant = /^◆\s*Hermes:\s*/iu;
const terminalPreparation = /^(?:[┊│┃║]\s*)?(?:💻\s*)?preparing terminal[….]*$/iu;
const terminalCommandBadge = /^(?:┊\s*)?💻\s/u;
const terminalFooter = /^\s*[└╰╚][─━═]/u;
const diffHeader = /^(?:diff --git\s|a\/\S+\s+→\s+b\/\S+|@@\s+[-+]\d|\*\*\* (?:Begin Patch|(?:Add|Update|Delete) File:)|--- [ab]\/|\+\+\+ [ab]\/)/u;
const patchEnd = /^\*\*\* End Patch\s*$/u;
const runtimeBanner = /^(?:[↪↩↻✦💻🐍🛠⚙]\s*)?(?:welcome to hermes agent|resumed session|initializing agent|preparing terminal|activated skills|mcp servers|async delegation batch complete|a background fan-out|act on these or re-dispatch|full live transcript|window too small|reflecting\.{2,}|analyzing\.{2,}|tip:|timeout\s+\d+)/iu;

function isRuntimeStatusLine(text: string) {
  const body = stripFrame(text).trim();
  // These are observable lifecycle events, not reasoning and not final replies.
  return (runtimeBanner.test(body) && !/^(?:reflecting|analyzing)\.{2,}/iu.test(body))
    || terminalPreparation.test(text)
    || /^(?:\[\d*m\s*)?MCP Servers\b/iu.test(body)
    || /^●\s*\[ASYNC DELEGATION BATCH COMPLETE\]/iu.test(body)
    || /^(?:HERMES(?: AGENT)?|Session ready)\s*$/iu.test(body);
}
const commandLine = /^(?:\$\s+|PS>\s*|[A-Z]:\\>\s*|(?:system|runtime|reasoning|tool(?:\s+(?:call|result))?|stdout|stderr|debug|trace|command|执行命令|运行命令)\s*[:：]|(?:python\d?|node|npm|npx|pnpm|yarn|rg|grep|findstr|git|ls|dir|cd|pwd|wc|head|tail|cat|sed|awk|get-content|get-childitem|select-string|invoke-webrequest|curl|wget)\s+\S)/iu;
const codeLine = /^(?:(?:from\s+[\w.]+\s+import|import\s+[\w.]+)|(?:if|elif|for|while|with|def|class|try|except)\b[^\n]*:\s*(?:.*)?$|(?:return|raise|assert)\s+|(?:const|let|var)\s+\w+\s*=|[a-z_]\w*(?:\[[^\]]+\]|\.[a-z_]\w*)*\s*(?:[+\-*/]?=)(?!=)|[a-z_]\w*(?:\[[^\]]+\])?\s+(?:and|or|in|for)\b|(?:print|nt|isinstance|json\.(?:dump|load)|open)\s*\(|(?:traceback\s*\(|file\s+["'][/\\])|(?:diff --git|@@\s+[-+]\d|\+\+\+\s|---\s+[ab]\/))/iu;
const structuredLine = /^(?:[{}[\](),;]+|["'][\w.-]+["']\s*:\s*.*[,}]|(?:\.{3}\s*)?\(\+\d+ more lines\)|\+\s*\d+\s+commands?\s*\(.*\))$/iu;

function isDiffCodeLine(text: string) {
  if (!/^[+-]\s*/u.test(text)) return false;
  const body = text.replace(/^[+-]\s*/u, '');
  return codeLine.test(body)
    || /^(?:#|[rubf]*(?:"""|''')|(?:else|finally|continue|break|pass|return|yield)\b)/iu.test(body)
    || /^(?:await\s+)?[a-z_$][\w.$]*\s*\([^]*\)\s*[,;:]?\s*$/iu.test(body)
    || /^(?:[([{]\s*)+["'][^]*[\])},]\s*$/u.test(body);
}

function isCodeTail(text: string) {
  // Terminal wrapping can drop the beginning of a Python statement. Detect a
  // cluster of independent syntax tokens, not isolated mentions of an API/path.
  const syntax = text.match(/\b(?:for\s+[a-z_]\w*\s+in|(?:if|elif|while)\s+[a-z_]\w*|(?:else|try|except|finally)\s*:|(?:break|continue)\b|print\s*\(|[a-z_]\w*(?:\.[a-z_]\w*)+\s*\(|[a-z_]\w*\s*=(?!=))/giu) ?? [];
  const startsMidStatement = /^(?:["':),;}\]]|[a-z_]\w*[)}\]])/iu.test(text);
  return syntax.length >= (startsMidStatement ? 3 : 5);
}

const toolInvocation = /^(?:⚡\s*)?(?:preparing\s+)?(?:mcp__|functions[.:]|tools[.:])[\w.]+/iu;

function isExecutionLine(line: string) {
  const text = line.trim();
  return terminalDecoration.test(text) || /^[│┃┊║🐍💻🛠⚙✍]/u.test(text)
    || /^\d*m\s*[│┃]/u.test(text)
    || /^[╭┌╔][─━═]/u.test(text)
    || /^(?:\[\d*m\s*)?MCP Servers\b/iu.test(text)
    || /^●\s*\[ASYNC DELEGATION BATCH COMPLETE/iu.test(text)
    || /^[^\p{L}\p{N}]{0,40}(?:reflecting|analyzing|deliberating|thinking)\.{2,}\s*$/iu.test(text)
    || /^(?:ist\)\s*:|["':)]+\s*for\s+\w+\s+in\b|[a-z_]\w*\[[^\]]+\][\s}]+(?:for|if|else)\b)/iu.test(text)
    || /^[,;]\s*[a-z_]\w*(?:\.[a-z_]\w*)*\s*[)([]/iu.test(text)
    || /^[a-z_]\w*(?:\.[a-z_]\w*)*\([^)]*\)[[\]).,;:]/iu.test(text)
    || /^review diff\s*$/iu.test(text)
    // A terminal-width split can start inside a Chinese string literal. Require
    // a closing quote and multiple Python constructs, not merely a code word.
    || (/^[\p{L}\p{N}_]{0,32}["']\s*[,\])]/u.test(text)
      && (text.match(/\b(?:for\s+\w+\s+in|if\s+\w+|print\s*\(|enumerate\s*\(|\w+\.append\s*\()/gu)?.length ?? 0) >= 2)
    || /^[….]\s*omitted\s+\d+\s+diff lines?\(s\)/iu.test(text)
    || /^\+(?:#!|#\s|["']{3})/u.test(text)
    || isDiffCodeLine(text) || isCodeTail(text) || toolInvocation.test(text)
    || runtimeBanner.test(text) || commandLine.test(text) || codeLine.test(text)
    || structuredLine.test(text)
    || /^(?:\/data\/hermes\/\S+|\d*█+\d*)$/u.test(text);
}

type Part = { content: string; kind: AgentTimelineMessageKind };
export type ClassifiedAgentMessage = Part & { id: string; sequence: number };

const privateKinds = new Set(['reasoning', 'analysis', 'thinking']);
const privateHeading = /^(?:#{1,6}\s*)?(?:reasoning|analysis|thinking|内部分析|推理过程)(?:\s*[:：]|\s*$)/iu;
const privateTag = /^<(?:think|analysis|reasoning)>$/iu;
const privateTagEnd = /^<\/(?:think|analysis|reasoning)>$/iu;
const publicHeading = /^(?:(?:#{1,6}\s*)?(?:final answer|final response|最终答复|最终回答)\s*[:：]\s*|<final>)/iu;
const stripFrame = (text: string) => text.replace(/^[│┃┊║]\s?/u, '').replace(/\s*[│┃║]$/u, '');
const hiddenRuntime = (category: string) => `${category}（内部详情已隐藏）`;

/** Preserve public replies and inspectable operation logs, but never retain
 * reasoning or ambiguous orphan terminal text, even behind disclosure UI.
 * An incomplete private frame stays closed across sequence gaps; only a clear
 * closing boundary or a public reply channel can make later text public again.
 */
export function classifyAgentConversation(messages: readonly AgentConversationMessage[]): ClassifiedAgentMessage[] {
  let terminalOpen = false;
  let operationOpen = false;
  let publicFrame = false;
  let replayFrame = false;
  let replayToolTail = false;
  let pendingHeader = '';
  let fence: string | null = null;
  let diffOpen = false;
  let previousSeq: number | null = null;
  let previousKind: string | null = null;
  const privateLines = new Set<string>();
  const result: ClassifiedAgentMessage[] = [];

  for (const message of [...messages].sort((a, b) => a.seq - b.seq)) {
    const contiguous = previousSeq !== null && message.seq === previousSeq + 1;
    const priorKind = previousKind;
    previousSeq = message.seq;
    const content = sanitizeRuntimeText(message.content);
    const kind = message.kind.trim().toLocaleLowerCase();
    if (!content.trim()) {
      const previous = result.at(-1);
      if (contiguous && previousKind === kind && previous?.kind === 'agent' && !terminalOpen) {
        previous.content += content;
        previous.sequence = message.seq;
      }
      previousKind = kind;
      continue;
    }
    previousKind = kind;
    const explicitKind: AgentTimelineMessageKind | null = errorKinds.has(kind) ? 'error'
        : interactionKinds.has(kind) ? 'interaction'
          : finalKinds.has(kind) ? 'agent' : null;
    const parts: Part[] = [];
    const append = (partKind: AgentTimelineMessageKind, text: string, inspectable = false) => {
      if (partKind === 'log' && !inspectable) {
        const category = terminalOpen ? '运行分析' : summarizeRuntimeLog(text);
        text = hiddenRuntime(category);
      }
      const previous = parts.at(-1);
      if (previous?.kind === partKind) {
        if (partKind !== 'log') previous.content += text;
        else if (inspectable) {
          // A real log following frame decoration must replace its internal
          // marker, not inherit that marker as a prefix of the actual output.
          if (/^(?:系统记录|运行分析|工具调用|任务调度|命令与执行)（内部详情已隐藏）$/.test(previous.content.trim())) previous.content = text;
          else previous.content += text;
        }
      }
      else parts.push({ kind: partKind, content: text });
    };

    if (userKinds.has(kind)) {
      terminalOpen = false;
      operationOpen = false;
      publicFrame = false;
      replayFrame = false;
      replayToolTail = false;
      pendingHeader = '';
      fence = null;
      diffOpen = false;
      // User-authored content is preserved; it is not a source of Agent output.
      append('user', content);
    } else if (privateKinds.has(kind)) {
      operationOpen = false;
      publicFrame = false;
      replayFrame = false;
      replayToolTail = false;
      if (privateKinds.has(kind)) {
        content.split(/\r?\n/).forEach((line) => privateLines.add(stripFrame(line.trim())));
      }
      append('log', hiddenRuntime('运行分析'));
      // A raw terminal frame can span a reasoning record and subsequent Hermes
      // fragments. Its kind alone must not discard that open privacy boundary.
      for (const line of content.split(/\r?\n/)) {
        const text = line.trim();
        if (terminalHeader.test(text) || privateHeading.test(text) || privateTag.test(text)) terminalOpen = true;
        else if (terminalFooter.test(text) || privateTagEnd.test(text)) terminalOpen = false;
      }
    } else {
      if (explicitKind && kind !== priorKind) {
        terminalOpen = false;
        operationOpen = false;
        publicFrame = false;
        replayFrame = false;
        replayToolTail = false;
        pendingHeader = '';
        fence = null;
        diffOpen = false;
      }
      // Tag-delimited HTTP replies may put private and final text on one line.
      const lines = content.replace(/(<\/?(?:think|analysis|reasoning|final)>)/giu, '\n$1\n')
        .match(/[^\n]*\n|[^\n]+$/g) ?? [];
      for (const line of lines) {
        let text = line.trim();
        const combinedHeader = pendingHeader + text;
        if (pendingHeader && (assistantHeader.test(combinedHeader) || terminalHeader.test(combinedHeader) || operationHeader.test(combinedHeader))) {
          text = combinedHeader;
          pendingHeader = '';
        } else if (/^[╭┌╔]/u.test(combinedHeader) && !/[╮┐╗]$/u.test(combinedHeader)
          && combinedHeader.length < 1024 && !assistantHeader.test(combinedHeader) && !terminalHeader.test(combinedHeader) && !operationHeader.test(combinedHeader)) {
          pendingHeader = combinedHeader;
          append('log', line);
          continue;
        } else {
          pendingHeader = '';
        }
        const framedBody = stripFrame(text).trim();
        // Terminal sizing diagnostics carry no business progress or reply.
        // Drop only this known environment noise, preserving ordinary logs.
        if (/^(?:window too small|terminal (?:window |size )?too small)(?:[\s.!…,:;\d×x-].*)?$/iu.test(framedBody)) continue;
        const body = publicFrame || operationOpen ? framedBody : text;
        const fenceMatch = body.match(/^(`{3,}|~{3,})(?:[\w.+-]+)?\s*$/);
        if (replayFrame && /^●\s*You:/iu.test(framedBody)) {
          publicFrame = false;
          replayFrame = false;
          replayToolTail = false;
          append('log', line);
        } else if (terminalHeader.test(framedBody) || privateHeading.test(framedBody) || privateTag.test(framedBody)) {
          terminalOpen = true;
          operationOpen = false;
          publicFrame = false;
          replayFrame = false;
          replayToolTail = false;
          fence = null;
          diffOpen = false;
          append('log', line);
        } else if (operationHeader.test(framedBody) && !terminalOpen) {
          // Execution panels are inspectable logs. They must not open the
          // privacy boundary used for Reasoning panels.
          operationOpen = true;
          publicFrame = false;
          replayFrame = false;
          replayToolTail = false;
          fence = null;
          diffOpen = false;
          append('log', framedBody.replace(/^[┌╭╔][─━═\s]*/u, '').replace(/[─━═\s╮┐╗]+$/u, '') + '\n', true);
        } else if (replayAssistant.test(framedBody)) {
          terminalOpen = false;
          operationOpen = false;
          publicFrame = true;
          replayFrame = true;
          replayToolTail = /\[\d+ tool calls?:/iu.test(framedBody) && !/\[\d+ tool calls?:[^]*\]/iu.test(framedBody);
          fence = null;
          diffOpen = false;
          append('agent', framedBody.replace(replayAssistant, '').replace(/\s*\[\d+ tool calls?:[^]*$/iu, '') + '\n');
        } else if (assistantHeader.test(text) || publicHeading.test(text)) {
          terminalOpen = false;
          operationOpen = false;
          publicFrame = true;
          replayFrame = false;
          replayToolTail = false;
          fence = null;
          diffOpen = false;
          if (assistantHeader.test(text)) append('log', line);
          else {
            const reply = text.replace(publicHeading, '');
            if (reply) append(explicitKind ?? 'agent', reply + (line.endsWith('\n') ? '\n' : ''));
          }
        } else if (replayFrame && replayToolTail) {
          if (framedBody.includes(']')) replayToolTail = false;
          append('log', line);
        } else if (terminalFooter.test(text) || privateTagEnd.test(text)) {
          terminalOpen = false;
          operationOpen = false;
          publicFrame = false;
          replayFrame = false;
          replayToolTail = false;
          fence = null;
          diffOpen = false;
          append('log', line);
        } else if (text === '</final>') {
          publicFrame = false;
        } else if (terminalOpen) {
          if (body) privateLines.add(stripFrame(body));
          append('log', line);
        } else if ([...privateLines].some((hidden) => hidden.length >= 6 && stripFrame(body).includes(hidden))) {
          // Some terminal captures repeat an analysis paragraph outside its box.
          append('log', 'reasoning: repeated private paragraph');
        } else if (operationOpen) {
          if (!terminalDecoration.test(text)) append('log', stripFrame(line.replace(/\r?\n$/, '')) + (line.endsWith('\n') ? '\n' : ''), true);
        } else if (fence === null && !diffOpen && isRuntimeStatusLine(text)) {
          // Preserve real status text even when the backend transports it in
          // the raw terminal channel. Never promote it to a chat response.
          append('log', stripFrame(line.replace(/\r?\n$/, '')) + (line.endsWith('\n') ? '\n' : ''), true);
          // Preparation is an overlay inside the current public reply. Other
          // lifecycle events end that frame; following orphan terminal text
          // must not inherit permission to become an assistant message.
          if (!terminalPreparation.test(text)) {
            publicFrame = false;
            replayFrame = false;
            replayToolTail = false;
          }
        } else if (patchEnd.test(body)) {
          diffOpen = false;
          append('log', line);
        } else if (diffHeader.test(body) || isDiffCodeLine(body)) {
          diffOpen = true;
          publicFrame = false;
          append('log', line);
        } else if (diffOpen) {
          // Diff context/wrapped strings can resemble ordinary prose. Keep the
          // block private until a real patch end or a public reply boundary.
          append('log', line);
        } else if (fenceMatch) {
          if (fence === null) fence = fenceMatch[1];
          else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
          append('log', line);
        } else if (terminalPreparation.test(text) || terminalCommandBadge.test(text) || terminalDecoration.test(text) || /^\d*█+\d*$/u.test(text)) {
          // Hermes emits these status overlays between its reply heading and
          // prose. They do not terminate the public reply frame.
          append('log', line);
        } else if (fence !== null || isExecutionLine(body)) {
          // A typed operational event is a log, not an assistant reply. Keep
          // its actual output; private frames have already been handled above.
          append('log', line, logKinds.has(kind));
          if (fence === null) publicFrame = false;
        } else if (!text && parts.length) {
          append(parts.at(-1)!.kind, line);
        } else if (logKinds.has(kind)) {
          append('log', line, true);
        } else if (!explicitKind && !publicFrame) {
          // `hermes` is a raw terminal transport, not an assistant channel.
          // Replay windows may start mid-tool/private output. Unknown/orphan
          // fragments need an explicit public frame before exposing any prose.
          append('log', line);
        } else {
          append(explicitKind ?? 'agent', publicFrame ? body + (replayFrame || line.endsWith('\n') ? '\n' : '') : line);
        }
      }
    }

    const visibleParts = parts.filter((part) => part.content.trim());
    visibleParts.forEach((part, index) => result.push({
      ...part,
      content: part.kind === 'user' ? part.content : part.content
        .replace(/\/data\/hermes\//giu, '[工作目录]/')
        .replace(/Hermes(?: Agent)?/giu, 'BidVolt'),
      id: `conversation-${message.seq}${visibleParts.length > 1 ? `-part-${index}` : ''}`,
      sequence: message.seq,
    }));
  }
  return result;
}

/** Apply the same privacy boundary to non-stream HTTP replies and error text. */
export function publicAgentReply(content: string): string {
  return classifyAgentConversation([{ content, kind: 'final', seq: 0 }])
    .filter((part) => part.kind === 'agent').map((part) => part.content).join('\n').trim();
}

/** Deliberately return a category, never terminal text or a Markdown snippet. */
export function summarizeRuntimeLog(content: string): string {
  const text = sanitizeRuntimeText(content).trim();
  if (/reasoning|analysis|thinking|运行分析|reflecting/iu.test(text)) return '运行分析';
  if (/(?:tool(?:_call|_result|\s+call|\s+result)?\s*[:：]|工具调用)/iu.test(text)) return '工具调用';
  if (/background fan-out|delegation|subagent|resumed session|任务调度/iu.test(text)) return '任务调度';
  if (commandLine.test(text) || codeLine.test(text) || /^```|^~~~|命令与执行/u.test(text)) return '命令与执行';
  return '系统记录';
}
