import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkItemService } from '../src/services/workItemService.js';
import { AzureDevOpsClient } from '../src/services/azureDevOpsClient.js';
import { NotFoundError, FileSizeLimitError } from '../src/utils/errorHandler.js';
import type { Config } from '../src/types/azure-devops.types.js';

const mockConfig: Config = {
  azureDevOpsUrl: 'https://tfs.example.com/tfs/Collection',
  azureDevOpsPat: 'fake-pat-token-1234567890',
  azureDevOpsProject: 'TestProject',
  gdprBlockedWorkItemTypes: ['Bug'],
  maxFileSizeBytes: 1 * 1024 * 1024,
};

vi.mock('../src/services/azureDevOpsClient.js', () => ({
  AzureDevOpsClient: {
    getWorkItemTrackingApi: vi.fn(),
    getGitApi: vi.fn(),
    getConfig: vi.fn(),
  },
}));

vi.mock('../src/utils/gdprValidator.js', () => ({
  GDPRValidator: {
    validate: vi.fn(), // no-op: allow all work items in tests
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(AzureDevOpsClient.getConfig).mockReturnValue(mockConfig);
});

describe('extractChildSummary', () => {
  it('should return empty summary when relations is undefined', async () => {
    const mockApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: 1,
        fields: {
          'System.Title': 'Test',
          'System.WorkItemType': 'Feature',
          'System.State': 'New',
          'System.CreatedDate': '2026-01-01',
          'System.ChangedDate': '2026-01-01',
        },
        relations: undefined,
      }),
      getComments: vi.fn().mockResolvedValue({ comments: [] }),
    };
    vi.mocked(AzureDevOpsClient.getWorkItemTrackingApi).mockResolvedValue(mockApi as any);

    const result = await WorkItemService.getWorkItem(1);
    expect(result.childItems).toEqual({ count: 0, childIds: [] });
  });

  it('should extract child IDs from hierarchy-forward relations', async () => {
    const mockApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: 1,
        fields: {
          'System.Title': 'Parent',
          'System.WorkItemType': 'Feature',
          'System.State': 'New',
          'System.CreatedDate': '2026-01-01',
          'System.ChangedDate': '2026-01-01',
        },
        relations: [
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://tfs.example.com/_apis/wit/workItems/10' },
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://tfs.example.com/_apis/wit/workItems/20' },
          { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://tfs.example.com/_apis/wit/workItems/5' },
          { rel: 'AttachedFile', url: 'https://tfs.example.com/_apis/wit/attachments/abc' },
        ],
      }),
      getComments: vi.fn().mockResolvedValue({ comments: [] }),
    };
    vi.mocked(AzureDevOpsClient.getWorkItemTrackingApi).mockResolvedValue(mockApi as any);

    const result = await WorkItemService.getWorkItem(1);
    expect(result.childItems).toEqual({ count: 2, childIds: [10, 20] });
  });
});

describe('extractAttachments', () => {
  it('should return empty array when no attachments', async () => {
    const mockApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: 1,
        fields: {
          'System.Title': 'Test',
          'System.WorkItemType': 'Feature',
          'System.State': 'New',
          'System.CreatedDate': '2026-01-01',
          'System.ChangedDate': '2026-01-01',
        },
        relations: [
          { rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://tfs.example.com/_apis/wit/workItems/10' },
        ],
      }),
      getComments: vi.fn().mockResolvedValue({ comments: [] }),
    };
    vi.mocked(AzureDevOpsClient.getWorkItemTrackingApi).mockResolvedValue(mockApi as any);

    const result = await WorkItemService.getWorkItem(1);
    expect(result.attachments).toEqual([]);
  });

  it('should extract attachment info from relations', async () => {
    const mockApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: 1,
        fields: {
          'System.Title': 'Test',
          'System.WorkItemType': 'Feature',
          'System.State': 'New',
          'System.CreatedDate': '2026-01-01',
          'System.ChangedDate': '2026-01-01',
        },
        relations: [
          {
            rel: 'AttachedFile',
            url: 'https://tfs.example.com/_apis/wit/attachments/abc-123',
            attributes: {
              name: 'screenshot.png',
              resourceSize: 12345,
              resourceCreatedDate: '2026-03-01T10:00:00Z',
            },
          },
        ],
      }),
      getComments: vi.fn().mockResolvedValue({ comments: [] }),
    };
    vi.mocked(AzureDevOpsClient.getWorkItemTrackingApi).mockResolvedValue(mockApi as any);

    const result = await WorkItemService.getWorkItem(1);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].name).toBe('screenshot.png');
    expect(result.attachments![0].url).toBe('https://tfs.example.com/_apis/wit/attachments/abc-123');
    expect(result.attachments![0].resourceSize).toBe(12345);
  });
});

describe('fetchComments', () => {
  it('should return comments from work item', async () => {
    const mockApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: 1,
        fields: {
          'System.Title': 'Test',
          'System.WorkItemType': 'Feature',
          'System.State': 'New',
          'System.CreatedDate': '2026-01-01',
          'System.ChangedDate': '2026-01-01',
        },
        relations: undefined,
      }),
      getComments: vi.fn().mockResolvedValue({
        comments: [
          {
            id: 100,
            createdBy: { displayName: 'Alice' },
            createdDate: new Date('2026-03-01'),
            text: 'First comment',
            isDeleted: false,
          },
          {
            id: 101,
            createdBy: { displayName: 'Bob' },
            createdDate: new Date('2026-03-02'),
            text: 'Deleted comment',
            isDeleted: true,
          },
          {
            id: 102,
            createdBy: { displayName: 'Charlie' },
            createdDate: new Date('2026-03-03'),
            text: 'Second comment',
            isDeleted: false,
          },
        ],
      }),
    };
    vi.mocked(AzureDevOpsClient.getWorkItemTrackingApi).mockResolvedValue(mockApi as any);

    const result = await WorkItemService.getWorkItem(1);
    expect(result.comments).toHaveLength(2);
    expect(result.comments![0].author).toBe('Alice');
    expect(result.comments![0].text).toBe('First comment');
    expect(result.comments![1].author).toBe('Charlie');
  });

  it('should return empty array when comments fetch fails', async () => {
    const mockApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: 1,
        fields: {
          'System.Title': 'Test',
          'System.WorkItemType': 'Feature',
          'System.State': 'New',
          'System.CreatedDate': '2026-01-01',
          'System.ChangedDate': '2026-01-01',
        },
        relations: undefined,
      }),
      getComments: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    vi.mocked(AzureDevOpsClient.getWorkItemTrackingApi).mockResolvedValue(mockApi as any);

    const result = await WorkItemService.getWorkItem(1);
    expect(result.comments).toEqual([]);
  });
});

describe('downloadAttachment', () => {
  it('should download and return attachment content', async () => {
    const fakeData = Buffer.from('fake image data');
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'image/png'],
        ['content-length', String(fakeData.length)],
      ]) as any,
      arrayBuffer: () => Promise.resolve(fakeData.buffer.slice(fakeData.byteOffset, fakeData.byteOffset + fakeData.byteLength)),
    });

    const result = await WorkItemService.downloadAttachment(
      'https://tfs.example.com/tfs/Collection/_apis/wit/attachments/abc?fileName=test.png'
    );

    expect(result.name).toBe('test.png');
    expect(result.mimeType).toBe('image/png');
    expect(result.size).toBe(fakeData.length);
    expect(result.data).toBe(fakeData.toString('base64'));
  });

  it('should reject URLs from different origins (SSRF protection)', async () => {
    await expect(
      WorkItemService.downloadAttachment('https://evil.com/_apis/wit/attachments/abc')
    ).rejects.toThrow('Attachment URL origin does not match configured Azure DevOps host');
  });

  it('should reject invalid URLs', async () => {
    await expect(
      WorkItemService.downloadAttachment('not-a-url')
    ).rejects.toThrow('Invalid attachment URL');
  });

  it('should throw NotFoundError on 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Map() as any,
    });

    await expect(
      WorkItemService.downloadAttachment(
        'https://tfs.example.com/tfs/Collection/_apis/wit/attachments/missing?fileName=x.png'
      )
    ).rejects.toThrow(NotFoundError);
  });

  it('should throw FileSizeLimitError when content-length exceeds limit', async () => {
    const bigSize = mockConfig.maxFileSizeBytes + 1;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'application/octet-stream'],
        ['content-length', String(bigSize)],
      ]) as any,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    await expect(
      WorkItemService.downloadAttachment(
        'https://tfs.example.com/tfs/Collection/_apis/wit/attachments/big?fileName=huge.bin'
      )
    ).rejects.toThrow(FileSizeLimitError);
  });

  it('should infer mime type from file extension when content-type is missing', async () => {
    const fakeData = Buffer.from('{}');
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', ''],
        ['content-length', String(fakeData.length)],
      ]) as any,
      arrayBuffer: () => Promise.resolve(fakeData.buffer.slice(fakeData.byteOffset, fakeData.byteOffset + fakeData.byteLength)),
    });

    const result = await WorkItemService.downloadAttachment(
      'https://tfs.example.com/tfs/Collection/_apis/wit/attachments/abc?fileName=data.json'
    );
    expect(result.mimeType).toBe('application/json');
  });

  it('should extract filename from URL path when fileName param is missing', async () => {
    const fakeData = Buffer.from('data');
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'image/jpeg'],
        ['content-length', String(fakeData.length)],
      ]) as any,
      arrayBuffer: () => Promise.resolve(fakeData.buffer.slice(fakeData.byteOffset, fakeData.byteOffset + fakeData.byteLength)),
    });

    const result = await WorkItemService.downloadAttachment(
      'https://tfs.example.com/tfs/Collection/_apis/wit/attachments/abc-def-123'
    );
    expect(result.name).toBe('abc-def-123');
  });
});
