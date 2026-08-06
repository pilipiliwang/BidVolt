import {
  Bold,
  Download,
  Italic,
  Redo2,
  Save,
  Search,
  Sparkles,
  Underline,
  Undo2,
} from 'lucide-react';
import { useRef, type MouseEvent } from 'react';

import type { DeliverableRouteId } from '../../app/router';

type WordMockEditorProps = {
  deliverableId: Exclude<DeliverableRouteId, 'quote'>;
  downloadHref: string;
  downloadLabel: string;
  onDirty: () => void;
  onSave: (content: string) => void;
};

export function WordMockEditor({
  deliverableId,
  downloadHref,
  downloadLabel,
  onDirty,
  onSave,
}: WordMockEditorProps) {
  const editorRef = useRef<HTMLElement>(null);
  const isTechnical = deliverableId === 'technical';

  const applyFormat = (event: MouseEvent<HTMLButtonElement>, command: string) => {
    event.preventDefault();
    document.execCommand?.(command);
    editorRef.current?.focus();
    onDirty();
  };

  return (
    <div className="office-word-editor">
      <div className="office-editor-toolbar" role="toolbar" aria-label="Mock Word 编辑工具栏">
        <button aria-label="撤销" type="button" onClick={() => document.execCommand?.('undo')}>
          <Undo2 aria-hidden="true" size={17} />
        </button>
        <button aria-label="重做" type="button" onClick={() => document.execCommand?.('redo')}>
          <Redo2 aria-hidden="true" size={17} />
        </button>
        <select aria-label="段落样式" defaultValue="正文"><option>正文</option><option>标题 1</option><option>标题 2</option></select>
        <select aria-label="字体" defaultValue="宋体"><option>宋体</option><option>黑体</option><option>微软雅黑</option></select>
        <select aria-label="字号" defaultValue="小四"><option>小四</option><option>四号</option><option>五号</option></select>
        <button aria-label="加粗" type="button" onMouseDown={(event) => applyFormat(event, 'bold')}><Bold aria-hidden="true" size={17} /></button>
        <button aria-label="斜体" type="button" onMouseDown={(event) => applyFormat(event, 'italic')}><Italic aria-hidden="true" size={17} /></button>
        <button aria-label="下划线" type="button" onMouseDown={(event) => applyFormat(event, 'underline')}><Underline aria-hidden="true" size={17} /></button>
        <button className="office-editor-toolbar__ai" title="演示按钮：不会自动修改冻结成果" type="button">
          <Sparkles aria-hidden="true" size={16} /> AI针对性修改
        </button>
        <button aria-label="查找替换" type="button"><Search aria-hidden="true" size={16} /></button>
        <a download href={downloadHref} aria-label={downloadLabel}><Download aria-hidden="true" size={16} /> 导出Word</a>
        <button
          className="office-editor-toolbar__save"
          type="button"
          onClick={() =>
            onSave((editorRef.current?.innerText ?? editorRef.current?.textContent ?? '').trim())
          }
        >
          <Save aria-hidden="true" size={16} /> 保存演示修改
        </button>
      </div>

      <div className="office-word-stage">
        <article
          ref={editorRef}
          aria-label={`${isTechnical ? '技术标' : '商务标'}文档内容`}
          aria-multiline="true"
          className="office-word-page"
          contentEditable
          role="textbox"
          suppressContentEditableWarning
          onInput={onDirty}
        >
          {isTechnical ? <TechnicalDocument /> : <BusinessDocument />}
        </article>
      </div>
    </div>
  );
}

function TechnicalDocument() {
  return (
    <>
      <h2>4&nbsp;&nbsp;供货与实施方案</h2>
      <h3>4.1&nbsp;&nbsp;供货范围</h3>
      <p>本项目的供货范围包括但不限于：汽轮机本体及其附属设备、DCS控制系统、DEH系统、汽机旁路减温减压装置、给水泵组、阀门及管道附件等。</p>
      <h3>4.2&nbsp;&nbsp;实施方案</h3>
      <p>我公司将严格按照招标文件要求及国家相关规范标准，制定详细的实施计划，合理安排资源，确保项目按期、高质量完成。主要实施步骤如下：</p>
      <table>
        <thead><tr><th>序号</th><th>实施阶段</th><th>主要工作内容</th><th>计划工期</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>前期准备</td><td>技术交底、图纸会审、施工方案编制、现场勘查</td><td>7天</td></tr>
          <tr><td>2</td><td>设备供货</td><td>设备制造、出厂检验、运输及到货验收</td><td>45天</td></tr>
          <tr><td>3</td><td>现场施工</td><td>设备安装、管道连接、电气接线、系统调试</td><td>30天</td></tr>
          <tr><td>4</td><td>试运行与验收</td><td>单体试运、联动试运、性能验收、资料移交</td><td>15天</td></tr>
        </tbody>
      </table>
      <p>我们将配备经验丰富的项目团队，建立完善的质量、进度、安全管理体系，确保项目顺利实施并达到预期目标。</p>
    </>
  );
}

function BusinessDocument() {
  return (
    <>
      <h2>2&nbsp;&nbsp;商务响应与投标函</h2>
      <h3>2.1&nbsp;&nbsp;投标函</h3>
      <p>我方已认真研究本项目招标文件、补遗及澄清文件，愿按照招标文件规定承担合同范围内的全部工作。</p>
      <h3>2.2&nbsp;&nbsp;商务条款响应</h3>
      <table>
        <thead><tr><th>序号</th><th>条款</th><th>招标要求</th><th>响应情况</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>交付周期</td><td>合同生效后 90 日内</td><td>完全响应</td></tr>
          <tr><td>2</td><td>质量保证</td><td>验收后 24 个月</td><td>完全响应</td></tr>
          <tr><td>3</td><td>付款方式</td><td>按合同节点支付</td><td>无偏离</td></tr>
        </tbody>
      </table>
      <p>本文件中的修改仅作为当前项目成果版本的演示草稿，保存不会回写企业资料库。</p>
    </>
  );
}
