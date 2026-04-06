import { describe, expect, it } from 'bun:test';
import { mapRunSummary } from './mappers';
import type { GatewayRunResponse } from '@/types/openclaw';

describe('mapRunSummary', () => {
  const minimalRaw: GatewayRunResponse = {
    id: 'run-1',
    agentId: 'agent-1',
    status: 'succeeded',
    createdAt: '2024-01-01T00:00:00Z',
  };

  it('maps a full GatewayRunResponse correctly', () => {
    const fullRaw: GatewayRunResponse = {
      id: 'run-1',
      agentId: 'agent-1',
      agentName: 'Test Agent',
      conversationId: 'conv-1',
      status: 'failed',
      title: 'Full Run',
      summary: 'Custom summary',
      createdAt: '2024-01-01T00:00:00Z',
      startedAt: '2024-01-01T00:00:01Z',
      updatedAt: '2024-01-01T00:00:05Z',
      completedAt: '2024-01-01T00:00:10Z',
      durationMs: 9000,
      errorMessage: 'Something went wrong',
      incidentId: 'inc-1',
      auditId: 'audit-1',
      delegatedAgentIds: ['agent-2'],
      delegatedAgentNames: ['Agent 2'],
      canRetry: true,
      metadata: { foo: 'bar' },
    };

    const result = mapRunSummary(fullRaw);

    expect(result).toEqual({
      id: 'run-1',
      agentId: 'agent-1',
      agentName: 'Test Agent',
      conversationId: 'conv-1',
      status: 'failed',
      title: 'Full Run',
      summary: 'Custom summary',
      createdAt: '2024-01-01T00:00:00Z',
      startedAt: '2024-01-01T00:00:01Z',
      updatedAt: '2024-01-01T00:00:05Z',
      completedAt: '2024-01-01T00:00:10Z',
      durationMs: 9000,
      errorMessage: 'Something went wrong',
      incidentId: 'inc-1',
      auditId: 'audit-1',
      delegatedAgentIds: ['agent-2'],
      delegatedAgentNames: ['Agent 2'],
      canRetry: true,
      metadata: { foo: 'bar' },
    });
  });

  it('provides default values for minimal input', () => {
    const result = mapRunSummary(minimalRaw);

    expect(result.agentName).toBe('');
    expect(result.title).toBe('Untitled run');
    expect(result.conversationId).toBeNull();
    expect(result.summary).toBe('Recent run');
    expect(result.startedAt).toBeNull();
    expect(result.completedAt).toBeNull();
    expect(result.durationMs).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.incidentId).toBeNull();
    expect(result.auditId).toBeNull();
    expect(result.delegatedAgentIds).toEqual([]);
    expect(result.delegatedAgentNames).toEqual([]);
    expect(result.canRetry).toBe(false);
  });

  describe('summary fallback logic', () => {
    it('returns "Run failed" if summary is missing but errorMessage is present', () => {
      const raw = { ...minimalRaw, status: 'failed' as const, errorMessage: 'Error' };
      const result = mapRunSummary(raw);
      expect(result.summary).toBe('Run failed');
    });

    it('returns "Run in progress" if summary is missing and status is "running"', () => {
      const raw = { ...minimalRaw, status: 'running' as const };
      const result = mapRunSummary(raw);
      expect(result.summary).toBe('Run in progress');
    });

    it('returns "Recent run" for other cases when summary is missing', () => {
      const result = mapRunSummary(minimalRaw);
      expect(result.summary).toBe('Recent run');
    });
  });

  describe('updatedAt fallback logic', () => {
    it('uses updatedAt if present', () => {
      const raw = {
        ...minimalRaw,
        updatedAt: '2024-01-01T00:00:10Z',
        completedAt: '2024-01-01T00:00:05Z',
      };
      const result = mapRunSummary(raw);
      expect(result.updatedAt).toBe('2024-01-01T00:00:10Z');
    });

    it('falls back to completedAt if updatedAt is missing', () => {
      const raw = {
        ...minimalRaw,
        completedAt: '2024-01-01T00:00:05Z',
        startedAt: '2024-01-01T00:00:01Z',
      };
      const result = mapRunSummary(raw);
      expect(result.updatedAt).toBe('2024-01-01T00:00:05Z');
    });

    it('falls back to startedAt if updatedAt and completedAt are missing', () => {
      const raw = {
        ...minimalRaw,
        startedAt: '2024-01-01T00:00:01Z',
      };
      const result = mapRunSummary(raw);
      expect(result.updatedAt).toBe('2024-01-01T00:00:01Z');
    });

    it('falls back to createdAt if all others are missing', () => {
      const result = mapRunSummary(minimalRaw);
      expect(result.updatedAt).toBe(minimalRaw.createdAt);
    });
  });

  describe('canRetry logic', () => {
    it('is true if canRetry is missing and status is "failed"', () => {
      const raw = { ...minimalRaw, status: 'failed' as const };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(true);
    });

    it('is true if canRetry is missing and status is "degraded"', () => {
      const raw = { ...minimalRaw, status: 'degraded' as const };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(true);
    });

    it('is true if canRetry is missing and status is "cancelled"', () => {
      const raw = { ...minimalRaw, status: 'cancelled' as const };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(true);
    });

    it('is false if canRetry is missing and status is "succeeded"', () => {
      const raw = { ...minimalRaw, status: 'succeeded' as const };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(false);
    });

    it('respects explicitly provided canRetry: true', () => {
      const raw = { ...minimalRaw, status: 'succeeded' as const, canRetry: true };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(true);
    });

    it('respects explicitly provided canRetry: false', () => {
      const raw = { ...minimalRaw, status: 'failed' as const, canRetry: false };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(false);
    });
  });
});
