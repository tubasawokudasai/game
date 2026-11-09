/**
 * 对话节点多段台词 (pages) 的后端解析/序列化工具。
 *
 * 存储约定：
 * - `dialogue_nodes.pages_json` 是唯一真源：[{ speaker_id, content }]
 * - `dialogue_nodes.content` 保留兼容字段：多页用 `\n---\n` 合并，
 *   旧接口/旧数据仍能按普通文本读取，必要时也能还原多页。
 */

export interface DialoguePageRow {
  speaker_id?: string;
  content: string;
}

function normalizePageEntry(entry: unknown): DialoguePageRow | null {
  if (typeof entry === 'string') {
    const content = entry.trim();
    return content ? { content } : null;
  }

  if (entry && typeof entry === 'object') {
    const record = entry as Record<string, unknown>;
    const content = typeof record.content === 'string' ? record.content.trim() : '';
    if (!content) return null;
    const speakerId =
      typeof record.speaker_id === 'string' && record.speaker_id.trim()
        ? record.speaker_id.trim()
        : undefined;
    return { speaker_id: speakerId, content };
  }

  return null;
}

function parseJsonPages(value: unknown): DialoguePageRow[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || !trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizePageEntry).filter((page): page is DialoguePageRow => Boolean(page));
}

/**
 * 从旧字段 content 解析多页：
 * 1. JSON 数组字符串；
 * 2. `\n---\n` 分隔；
 * 3. 普通文本。
 */
export function parsePagesFromContent(content?: string | null): DialoguePageRow[] {
  const text = typeof content === 'string' ? content : '';
  const trimmed = text.trim();
  if (!trimmed) return [{ content: '' }];

  const jsonPages = parseJsonPages(trimmed);
  if (jsonPages.length > 0) return jsonPages;

  const sections = text
    .split(/\n\s*---\s*\n/g)
    .map((section) => section.trim())
    .filter((section) => section.length > 0);
  if (sections.length > 1) {
    return sections.map((section) => ({ content: section }));
  }

  return [{ content: text }];
}

/**
 * 读取节点行时解析 pages：优先 pages_json，空时回退 content。
 */
export function parseNodePages(
  pagesJson: string | null | undefined,
  fallbackContent: string
): DialoguePageRow[] {
  const pages = parseJsonPages(pagesJson || '[]');
  if (pages.length > 0) return pages;
  return parsePagesFromContent(fallbackContent);
}

/**
 * 保存时归一化前端提交的 pages（数组或 JSON 字符串）；为空则回退 content。
 */
export function normalizePagesInput(input: unknown, fallbackContent: string): DialoguePageRow[] {
  const pages = parseJsonPages(input);
  if (pages.length > 0) return pages;
  return parsePagesFromContent(fallbackContent);
}

/** 多页合并写回 content 兼容字段 */
export function serializePagesToContent(pages: DialoguePageRow[]): string {
  return pages
    .map((page) => (typeof page.content === 'string' ? page.content.trim() : ''))
    .filter((content) => content.length > 0)
    .join('\n---\n');
}

/** 序列化 pages_json */
export function serializePagesJson(pages: DialoguePageRow[]): string {
  return JSON.stringify(
    pages
      .map((page) => ({
        speaker_id: page.speaker_id?.trim() || undefined,
        content: typeof page.content === 'string' ? page.content.trim() : '',
      }))
      .filter((page) => page.content.length > 0)
  );
}
