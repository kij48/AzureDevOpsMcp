import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWorkItemToolCall } from '../src/tools/workItemTools.js';
import { WorkItemService } from '../src/services/workItemService.js';

vi.mock('../src/services/workItemService.js', () => ({
  WorkItemService: {
    getWorkItem: vi.fn(),
    getChildWorkItems: vi.fn(),
    getWorkItemTree: vi.fn(),
    getAllCommits: vi.fn(),
    getMyWorkItems: vi.fn(),
    downloadAttachment: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleWorkItemToolCall - get_work_item_attachment', () => {
  it('should return image content block for image attachments', async () => {
    vi.mocked(WorkItemService.downloadAttachment).mockResolvedValue({
      name: 'screenshot.png',
      url: 'https://tfs.example.com/_apis/wit/attachments/abc',
      mimeType: 'image/png',
      size: 1234,
      data: 'base64encodeddata',
    });

    const result = await handleWorkItemToolCall('get_work_item_attachment', {
      attachmentUrl: 'https://tfs.example.com/_apis/wit/attachments/abc',
    });

    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Attachment: screenshot.png (1234 bytes, image/png)',
    });
    expect(result.content[1]).toEqual({
      type: 'image',
      data: 'base64encodeddata',
      mimeType: 'image/png',
    });
  });

  it('should return text content block for non-image attachments', async () => {
    vi.mocked(WorkItemService.downloadAttachment).mockResolvedValue({
      name: 'data.json',
      url: 'https://tfs.example.com/_apis/wit/attachments/def',
      mimeType: 'application/json',
      size: 42,
      data: 'eyJ0ZXN0IjogdHJ1ZX0=',
    });

    const result = await handleWorkItemToolCall('get_work_item_attachment', {
      attachmentUrl: 'https://tfs.example.com/_apis/wit/attachments/def',
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('data.json');
    expect(result.content[0].text).toContain('Base64 content:');
  });

  it('should return error on failure', async () => {
    vi.mocked(WorkItemService.downloadAttachment).mockRejectedValue(
      new Error('Attachment URL origin does not match')
    );

    const result = await handleWorkItemToolCall('get_work_item_attachment', {
      attachmentUrl: 'https://evil.com/attack',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error:');
  });
});

describe('handleWorkItemToolCall - get_work_item with new fields', () => {
  it('should include comments, childItems, and attachments in response', async () => {
    vi.mocked(WorkItemService.getWorkItem).mockResolvedValue({
      id: 123,
      title: 'Test Feature',
      description: 'A test',
      workItemType: 'Feature',
      state: 'New',
      createdDate: new Date('2026-01-01'),
      changedDate: new Date('2026-01-02'),
      areaPath: 'Project',
      iterationPath: 'Project\\Sprint1',
      tags: [],
      fields: {},
      comments: [
        { id: 1, author: 'Alice', createdDate: new Date('2026-01-01'), text: 'Hello' },
      ],
      childItems: { count: 2, childIds: [10, 20] },
      attachments: [
        { name: 'doc.pdf', url: 'https://tfs.example.com/att/1', resourceSize: 5000, createdDate: new Date('2026-01-01') },
      ],
    });

    const result = await handleWorkItemToolCall('get_work_item', { workItemId: 123 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0].author).toBe('Alice');
    expect(parsed.childItems.count).toBe(2);
    expect(parsed.childItems.childIds).toEqual([10, 20]);
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].name).toBe('doc.pdf');
  });
});

describe('handleWorkItemToolCall - unknown tool', () => {
  it('should return error for unknown tool name', async () => {
    const result = await handleWorkItemToolCall('nonexistent_tool', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown work item tool');
  });
});
