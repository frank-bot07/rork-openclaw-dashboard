import { describe, expect, it } from 'bun:test';
import { normalizeRunPayload } from './client-data';
import type { GatewayRunResponse } from '@/types/openclaw';

describe('normalizeRunPayload', () => {
  it('returns null if no id is provided', () => {
    expect(normalizeRunPayload({})).toBeNull();
    expect(normalizeRunPayload(null)).toBeNull();
    expect(normalizeRunPayload(undefined)).toBeNull();
  });

  it('basic normalization with minimal input', () => {
    const result = normalizeRunPayload({ id: 'run-1' });
    expect(result).not.toBeNull();
    expect(result?.id).toBe('run-1');
    expect(result?.status).toBe('queued');
    expect(result?.agentId).toBe('');
    expect(result?.agentName).toBe('');
    expect(result?.title).toBe('Untitled run');
    expect(result?.summary).toBe('Recent run.');
    expect(typeof result?.createdAt).toBe('string');
  });

  it('uses runId as an alias for id', () => {
    const result = normalizeRunPayload({ runId: 'run-1' });
    expect(result?.id).toBe('run-1');
  });

  it('handles status normalization', () => {
    expect(normalizeRunPayload({ id: '1', status: 'running' })?.status).toBe('running');
    expect(normalizeRunPayload({ id: '1', state: 'running' })?.status).toBe('running');
    expect(normalizeRunPayload({ id: '1', status: 'complete' })?.status).toBe('succeeded');
    expect(normalizeRunPayload({ id: '1', status: 'completed' })?.status).toBe('succeeded');
    expect(normalizeRunPayload({ id: '1', status: 'success' })?.status).toBe('succeeded');
    expect(normalizeRunPayload({ id: '1', status: 'error' })?.status).toBe('failed');
    expect(normalizeRunPayload({ id: '1', status: 'unknown' })?.status).toBe('queued');
  });

  it('generates default summary based on status', () => {
    expect(normalizeRunPayload({ id: '1', status: 'failed' })?.summary).toBe('Run failed.');
    expect(normalizeRunPayload({ id: '1', status: 'running' })?.summary).toBe('Run in progress.');
    expect(normalizeRunPayload({ id: '1', status: 'queued' })?.summary).toBe('Recent run.');
  });

  it('prioritizes date fields', () => {
    const result = normalizeRunPayload({
      id: '1',
      createdAt: '2023-01-01',
      timestamp: '2023-01-02',
    });
    expect(result?.createdAt).toBe('2023-01-01');

    const result2 = normalizeRunPayload({
      id: '1',
      timestamp: '2023-01-02',
    });
    expect(result2?.createdAt).toBe('2023-01-02');
  });

  it('uses aliases for various fields', () => {
    const result = normalizeRunPayload({
      id: '1',
      name: 'Test Title',
      description: 'Test Summary',
      sessionKey: 'conv-1',
      completedAt: '2023-01-03',
      error: 'Something went wrong',
    });
    expect(result?.title).toBe('Test Title');
    expect(result?.summary).toBe('Test Summary');
    expect(result?.conversationId).toBe('conv-1');
    expect(result?.updatedAt).toBe('2023-01-03');
    expect(result?.errorMessage).toBe('Something went wrong');
  });

  it('merges with fallback values', () => {
    const fallback: Partial<GatewayRunResponse> = {
      agentId: 'agent-1',
      agentName: 'Agent One',
      title: 'Fallback Title',
      metadata: { foo: 'bar' },
    };
    const result = normalizeRunPayload({ id: '1', metadata: { baz: 'qux' } }, fallback);
    expect(result?.agentId).toBe('agent-1');
    expect(result?.agentName).toBe('Agent One');
    expect(result?.title).toBe('Fallback Title');
    // Implementation spreads the whole record into metadata
    expect(result?.metadata).toEqual({
      foo: 'bar',
      id: '1',
      metadata: { baz: 'qux' },
    });
  });

  it('handles array fields correctly', () => {
    const result = normalizeRunPayload({
      id: '1',
      delegatedAgentIds: ['a', 'b'],
      delegatedAgentNames: ['A', 'B'],
    });
    expect(result?.delegatedAgentIds).toEqual(['a', 'b']);
    expect(result?.delegatedAgentNames).toEqual(['A', 'B']);
  });

  it('uses fallback for missing arrays', () => {
    const fallback: Partial<GatewayRunResponse> = {
      delegatedAgentIds: ['fallback-id'],
    };
    const result = normalizeRunPayload({ id: '1' }, fallback);
    expect(result?.delegatedAgentIds).toEqual(['fallback-id']);
  });
});
