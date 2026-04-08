import { describe, expect, test } from 'bun:test'
import {
  anthropicToolsToOpenAI,
  anthropicToolsToOpenAIResponses,
  anthropicToolChoiceToOpenAI,
  anthropicToolChoiceToOpenAIResponses,
} from '../convertTools.js'

describe('anthropicToolsToOpenAI', () => {
  test('converts basic tool', () => {
    const tools = [
      {
        type: 'custom',
        name: 'bash',
        description: 'Run a bash command',
        input_schema: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
      },
    ]

    const result = anthropicToolsToOpenAI(tools as any)

    expect(result).toEqual([{
      type: 'function',
      function: {
        name: 'bash',
        description: 'Run a bash command',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
      },
    }])
  })

  test('uses empty schema when input_schema missing', () => {
    const tools = [{ type: 'custom', name: 'noop', description: 'no-op' }]
    const result = anthropicToolsToOpenAI(tools as any)

    expect(result[0].function.parameters).toEqual({ type: 'object', properties: {} })
  })

  test('strips Anthropic-specific fields', () => {
    const tools = [
      {
        type: 'custom',
        name: 'bash',
        description: 'Run bash',
        input_schema: { type: 'object', properties: {} },
        cache_control: { type: 'ephemeral' },
        defer_loading: true,
      },
    ]
    const result = anthropicToolsToOpenAI(tools as any)

    expect((result[0] as any).cache_control).toBeUndefined()
    expect((result[0] as any).defer_loading).toBeUndefined()
  })

  test('handles empty tools array', () => {
    expect(anthropicToolsToOpenAI([])).toEqual([])
  })
})

describe('anthropicToolChoiceToOpenAI', () => {
  test('maps auto', () => {
    expect(anthropicToolChoiceToOpenAI({ type: 'auto' })).toBe('auto')
  })

  test('maps any to required', () => {
    expect(anthropicToolChoiceToOpenAI({ type: 'any' })).toBe('required')
  })

  test('maps tool to function', () => {
    const result = anthropicToolChoiceToOpenAI({ type: 'tool', name: 'bash' })
    expect(result).toEqual({ type: 'function', function: { name: 'bash' } })
  })

  test('returns undefined for undefined input', () => {
    expect(anthropicToolChoiceToOpenAI(undefined)).toBeUndefined()
  })

  test('returns undefined for unknown type', () => {
    expect(anthropicToolChoiceToOpenAI({ type: 'unknown' })).toBeUndefined()
  })
})

describe('anthropicToolsToOpenAIResponses', () => {
  test('converts basic tool to responses format', () => {
    const tools = [
      {
        type: 'custom',
        name: 'bash',
        description: 'Run a bash command',
        input_schema: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
      },
    ]

    const result = anthropicToolsToOpenAIResponses(tools as any)

    expect(result).toEqual([{
      type: 'function',
      name: 'bash',
      description: 'Run a bash command',
      strict: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    }])
  })

  test('normalizes nested object schemas for responses', () => {
    const tools = [
      {
        type: 'custom',
        name: 'write_file',
        description: 'Write a file',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            options: {
              type: 'object',
              properties: {
                overwrite: { type: 'boolean' },
              },
            },
          },
          required: ['path'],
        },
      },
    ]

    const [tool] = anthropicToolsToOpenAIResponses(tools as any)
    expect((tool.parameters as any).additionalProperties).toBe(false)
    expect((tool.parameters as any).required).toEqual(['path', 'options'])
    expect((tool.parameters as any).properties.options.type).toEqual([
      'object',
      'null',
    ])
    expect((tool.parameters as any).properties.options.additionalProperties).toBe(
      false,
    )
    expect((tool.parameters as any).properties.options.required).toEqual([
      'overwrite',
    ])
    expect(
      (tool.parameters as any).properties.options.properties.overwrite.type,
    ).toEqual(['boolean', 'null'])
  })

  test('promotes optional fields to required nullable fields for responses', () => {
    const tools = [
      {
        type: 'custom',
        name: 'Agent',
        description: 'Launch a new agent',
        input_schema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            isolation: {
              type: 'string',
              enum: ['worktree', 'remote'],
            },
          },
          required: ['prompt'],
        },
      },
    ]

    const [tool] = anthropicToolsToOpenAIResponses(tools as any)
    expect((tool.parameters as any).required).toEqual(['prompt', 'isolation'])
    expect((tool.parameters as any).properties.isolation.type).toEqual([
      'string',
      'null',
    ])
  })
})

describe('anthropicToolChoiceToOpenAIResponses', () => {
  test('maps auto', () => {
    expect(anthropicToolChoiceToOpenAIResponses({ type: 'auto' })).toBe('auto')
  })

  test('maps any to required', () => {
    expect(anthropicToolChoiceToOpenAIResponses({ type: 'any' })).toBe(
      'required',
    )
  })

  test('maps tool to function name', () => {
    expect(
      anthropicToolChoiceToOpenAIResponses({ type: 'tool', name: 'bash' }),
    ).toEqual({
      type: 'function',
      name: 'bash',
    })
  })
})
