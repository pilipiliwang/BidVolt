import { CheckCircle2, CircleAlert, FileArchive, FileText } from 'lucide-react';

import type { EnterpriseUploadRecord } from '../types';

interface EnterpriseUploadHistoryProps {
  records: EnterpriseUploadRecord[];
  onOpenAsset?: (assetId: string) => void;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { hour12: false });
}

export function EnterpriseUploadHistory({ records, onOpenAsset }: EnterpriseUploadHistoryProps) {
  return (
    <section className="enterprise-upload-history" aria-labelledby="enterprise-upload-history-title">
      <header>
        <div>
          <span>本次浏览器会话</span>
          <h2 id="enterprise-upload-history-title">上传记录</h2>
        </div>
        <p>以下内容来自后端逐文件上传回执；刷新页面后记录将清空。</p>
      </header>
      <div className="enterprise-upload-history__list">
        {records.length > 0 ? records.map((record) => {
          const accepted = record.status === 'accepted';
          const hasExpansion = record.expanded
            && (record.expanded.imported > 0
              || record.expanded.duplicates > 0
              || record.expanded.failed > 0
              || Boolean(record.expanded.error));
          return (
            <article
              className={`enterprise-upload-record enterprise-upload-record--${record.status}`}
              key={record.id}
            >
              <span className="enterprise-upload-record__icon" aria-hidden="true">
                {accepted ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}
              </span>
              <div className="enterprise-upload-record__content">
                <div className="enterprise-upload-record__heading">
                  <strong>{record.fileName}</strong>
                  <span>{accepted ? (record.duplicate ? '已存在' : '已受理') : '上传失败'}</span>
                </div>
                <dl>
                  <div><dt>上传时间</dt><dd>{formatTime(record.createdAt)}</dd></div>
                  {record.fileId ? <div><dt>文件编号</dt><dd>#{record.fileId}</dd></div> : null}
                  {record.assetId ? <div><dt>资料编号</dt><dd>#{record.assetId}</dd></div> : null}
                </dl>
                {record.message ? <p>{record.message}</p> : null}
                {hasExpansion ? (
                  <div className="enterprise-upload-record__archive">
                    <FileArchive aria-hidden="true" size={16} />
                    <span>
                      解包导入 {record.expanded?.imported ?? 0} 个，跳过重复 {record.expanded?.duplicates ?? 0} 个，失败 {record.expanded?.failed ?? 0} 个
                      {record.expanded?.error ? `；${record.expanded.error}` : ''}
                    </span>
                  </div>
                ) : null}
              </div>
              {record.assetId && onOpenAsset ? (
                <button type="button" onClick={() => onOpenAsset(record.assetId!)}>
                  <FileText aria-hidden="true" size={16} />
                  查看资料
                </button>
              ) : null}
            </article>
          );
        }) : (
          <p className="enterprise-empty-copy">当前会话还没有上传记录。</p>
        )}
      </div>
    </section>
  );
}
